import { describe, expect, it } from 'vitest';
import {
  DemoError,
  initialDemoState,
  reduce,
  type DemoState,
} from './state.js';
import { loadDemoState, saveDemoState, DEMO_STORAGE_KEY } from './persistence.js';
import { buildDemoGarages, demoScenarios } from './garages.js';
import { uaeDateString } from '../time/uae.js';

const NOW = new Date();
const NOW_ISO = NOW.toISOString();
const inHours = (h: number) => new Date(NOW.getTime() + h * 3600_000).toISOString();

const garages = buildDemoGarages(NOW_ISO);
const g1 = garages.find((g) => g.id === 'demo_ad_01')!;
const g2 = garages.find((g) => g.id === 'demo_ad_02')!;

const scenario = demoScenarios.corollaAcAbuDhabi;
const contact = { name: 'Sample Owner', phone: '050 000 0000', isSample: true };

function withRequest(): DemoState {
  return reduce(initialDemoState(), {
    type: 'createRequest',
    vehicle: scenario.vehicle,
    job: scenario.job,
    prefs: scenario.prefs,
    contact,
    garageIds: [g1.id, g2.id],
    nowIso: NOW_ISO,
    ids: { requestId: 'req1', enquiryIds: ['enq1', 'enq2'] },
  });
}

const sampleOffer = {
  capabilityConfirmed: true as const,
  firstStep: 'inspection' as const,
  appointmentAt: inHours(48),
  price: g1.prices[0],
  expiresAt: inHours(24),
};

function withOffer(state: DemoState, enquiryId: string, offerId: string): DemoState {
  return reduce(state, {
    type: 'sendOffer',
    enquiryId,
    offer: sampleOffer,
    offerId,
    nowIso: NOW_ISO,
  });
}

describe('demo state reducer', () => {
  it('createRequest → sendOffer → confirmOffer supersedes other enquiries', () => {
    let s = withRequest();
    s = withOffer(s, 'enq1', 'offer1');
    expect(s.enquiries['enq1'].status).toBe('offer_received');

    s = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt1',
      reference: 'PP-ABC123',
      nowIso: NOW_ISO,
      garage: g1,
    });
    expect(s.enquiries['enq1'].status).toBe('confirmed');
    expect(s.enquiries['enq2'].status).toBe('superseded');
    expect(s.offers['offer1'].status).toBe('accepted');
    expect(s.requests['req1'].status).toBe('confirmed');
    const appt = s.appointments['appt1'];
    expect(appt.reference).toBe('PP-ABC123');
    expect(appt.snapshot.garage.id).toBe(g1.id);
    expect(appt.snapshot.price.amountAed?.min).toBe(150);
  });

  it('repeated confirm of the same offer is idempotent', () => {
    let s = withRequest();
    s = withOffer(s, 'enq1', 'offer1');
    s = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt1',
      reference: 'PP-ABC123',
      nowIso: NOW_ISO,
      garage: g1,
    });
    const again = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt2',
      reference: 'PP-XYZ999',
      nowIso: NOW_ISO,
      garage: g1,
    });
    expect(again).toBe(s);
    expect(Object.keys(again.appointments)).toEqual(['appt1']);
  });

  it('confirming an expired offer throws', () => {
    let s = withRequest();
    // send an offer that expires in 1h, then confirm after it expired
    s = reduce(s, {
      type: 'sendOffer',
      enquiryId: 'enq1',
      offer: { ...sampleOffer, expiresAt: inHours(1) },
      offerId: 'offer1',
      nowIso: NOW_ISO,
    });
    expect(() =>
      reduce(s, {
        type: 'confirmOffer',
        offerId: 'offer1',
        appointmentId: 'appt1',
        reference: 'PP-ABC123',
        nowIso: inHours(2),
        garage: g1,
      }),
    ).toThrowError(DemoError);
  });

  it('confirming a different offer after one is confirmed throws ALREADY_CONFIRMED', () => {
    let s = withRequest();
    s = withOffer(s, 'enq1', 'offer1');
    s = withOffer(s, 'enq2', 'offer2');
    s = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt1',
      reference: 'PP-ABC123',
      nowIso: NOW_ISO,
      garage: g1,
    });
    try {
      reduce(s, {
        type: 'confirmOffer',
        offerId: 'offer2',
        appointmentId: 'appt2',
        reference: 'PP-DEF456',
        nowIso: NOW_ISO,
        garage: g2,
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DemoError);
      expect((e as DemoError).code).toBe('ALREADY_CONFIRMED');
    }
  });

  it('cancelAppointment does not revive superseded enquiries', () => {
    let s = withRequest();
    s = withOffer(s, 'enq1', 'offer1');
    s = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt1',
      reference: 'PP-ABC123',
      nowIso: NOW_ISO,
      garage: g1,
    });
    s = reduce(s, { type: 'cancelAppointment', appointmentId: 'appt1', nowIso: NOW_ISO });
    expect(s.appointments['appt1'].status).toBe('cancelled');
    expect(s.requests['req1'].status).toBe('cancelled');
    expect(s.enquiries['enq1'].status).toBe('cancelled');
    expect(s.enquiries['enq2'].status).toBe('superseded');
  });

  it('updateProfile after confirm leaves the appointment snapshot unchanged', () => {
    let s = withRequest();
    s = withOffer(s, 'enq1', 'offer1');
    s = reduce(s, {
      type: 'confirmOffer',
      offerId: 'offer1',
      appointmentId: 'appt1',
      reference: 'PP-ABC123',
      nowIso: NOW_ISO,
      garage: g1,
    });
    s = reduce(s, {
      type: 'updateProfile',
      garageId: g1.id,
      patch: { services: [], acceptingEnquiries: false },
    });
    expect(s.appointments['appt1'].snapshot.garage.name).toBe('Khalidiya Auto Care');
    expect(s.appointments['appt1'].snapshot.price.amountAed?.min).toBe(150);
  });

  it('tick expires open offers and marks their enquiries expired', () => {
    let s = withRequest();
    s = reduce(s, {
      type: 'sendOffer',
      enquiryId: 'enq1',
      offer: { ...sampleOffer, expiresAt: inHours(1) },
      offerId: 'offer1',
      nowIso: NOW_ISO,
    });
    s = reduce(s, { type: 'tick', nowIso: inHours(2) });
    expect(s.offers['offer1'].status).toBe('expired');
    expect(s.enquiries['enq1'].status).toBe('expired');
  });

  it('reset clears requests/enquiries/offers/appointments but keeps mode', () => {
    let s = reduce(initialDemoState(), { type: 'enterDemo' });
    s = withRequest();
    s = { ...s, mode: 'demo' };
    s = reduce(s, { type: 'reset' });
    expect(s.requests).toEqual({});
    expect(s.enquiries).toEqual({});
    expect(s.offers).toEqual({});
    expect(s.appointments).toEqual({});
    expect(s.mode).toBe('demo');
  });

  it('simulated expired_offer creates an already-past offer', () => {
    let s = withRequest();
    s = reduce(s, {
      type: 'simulateReply',
      enquiryId: 'enq1',
      kind: 'expired_offer',
      nowIso: NOW_ISO,
      garage: g1,
      ids: { offerId: 'offerX' },
    });
    expect(s.enquiries['enq1'].status).toBe('offer_received');
    // and tick immediately expires it
    s = reduce(s, { type: 'tick', nowIso: NOW_ISO });
    expect(s.offers['offerX'].status).toBe('expired');
  });
});

describe('persistence', () => {
  function fakeStorage(value: string | null) {
    const store: Record<string, string> = {};
    if (value != null) store[DEMO_STORAGE_KEY] = value;
    return {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      dump: () => store,
    };
  }

  it('rejects garbage and returns fresh state', () => {
    expect(loadDemoState(fakeStorage('not json{')).requests).toEqual({});
    expect(loadDemoState(fakeStorage('{"version":2}')).mode).toBe('live');
    expect(loadDemoState(fakeStorage(null)).version).toBe(1);
  });

  it('round-trips a valid state', () => {
    const s = withRequest();
    const storage = fakeStorage(null);
    saveDemoState(storage, s);
    const loaded = loadDemoState(storage);
    expect(loaded.requests['req1'].enquiryIds).toEqual(['enq1', 'enq2']);
  });
});

describe('uae time', () => {
  it('uaeDateString uses Asia/Dubai', () => {
    // 21:30 UTC = 01:30 next day in Dubai
    expect(uaeDateString(new Date('2025-09-21T21:30:00Z'))).toBe('2025-09-22');
  });
});
