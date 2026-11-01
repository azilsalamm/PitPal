import { describe, expect, it } from 'vitest';
import type { Garage, JobRequest, SearchPreferences, VehicleProfile } from '../models.js';
import {
  evaluateEligibility,
  haversineKm,
  requiredService,
  type Criteria,
  type Evaluation,
} from './eligibility.js';
import { rankEvaluations } from './ranking.js';
import { compareOffers } from '../pricing/compare.js';
import {
  buildDemoGarages,
  demoScenarios,
  SAMPLE_LOCATIONS,
} from '../demo/garages.js';
import type { Offer } from '../models.js';

const NOW = new Date().toISOString();

const garages = buildDemoGarages(NOW);
const byId = Object.fromEntries(garages.map((g) => [g.id, g]));

function criteria(
  vehicle: VehicleProfile,
  job: JobRequest,
  prefs: SearchPreferences,
): Criteria {
  return { vehicle, job, prefs, nowIso: NOW };
}

const corolla2016 = demoScenarios.corollaAcAbuDhabi.vehicle;

function mkGarage(partial: Partial<Garage>): Garage {
  return {
    id: 'g_test',
    listingType: 'demo_fictional',
    source: { provider: 'demo', retrievedAt: NOW },
    name: 'Test Garage',
    emirate: 'abu_dhabi',
    area: 'Test',
    makeSupport: { mode: 'all' },
    restrictions: [],
    services: [],
    specialities: [],
    evidence: [],
    prices: [],
    participation: { status: 'demo_inbox', acceptingEnquiries: true },
    ...partial,
  };
}

describe('requiredService', () => {
  it('maps unsure to general_inspection', () => {
    expect(requiredService({ category: 'unsure' })).toBe('general_inspection');
  });
  it('maps service category to routine_service', () => {
    expect(requiredService({ category: 'service' })).toBe('routine_service');
  });
  it('maps repair without service to general_inspection', () => {
    expect(requiredService({ category: 'repair' })).toBe('general_inspection');
  });
});

describe('eligibility', () => {
  const basePrefs = demoScenarios.corollaAcAbuDhabi.prefs;

  it('"unsure" requires general_inspection only — AC/electrical alone is not enough', () => {
    const onlyAcElectrical = mkGarage({
      services: ['ac', 'electrical'],
      coords: { lat: 24.466, lon: 54.36 },
    });
    const ev = evaluateEligibility(
      onlyAcElectrical,
      criteria(corolla2016, { category: 'unsure' }, basePrefs),
    );
    expect(ev.checks.service).toBe('unknown');
    expect(ev.verdict).toBe('unconfirmed');
    // and the counterpart: a garage listing general_inspection is suitable
    const withGi = mkGarage({
      services: ['general_inspection'],
      coords: { lat: 24.466, lon: 54.36 },
      availability: {
        capacity: 'accepting_today',
        declaredAt: NOW,
        validOnUaeDate: '9999-01-01', // will be needs_confirmation, still suitable? no — see next test
      },
    });
    const ev2 = evaluateEligibility(
      { ...withGi, availability: undefined },
      criteria(corolla2016, { category: 'unsure' }, basePrefs),
    );
    expect(ev2.checks.service).toBe('supported');
    expect(ev2.verdict).toBe('suitable');
  });

  it('excludes a garage whose make list does not include the vehicle make', () => {
    const ev = evaluateEligibility(
      byId['demo_ad_03'],
      criteria(corolla2016, { category: 'repair', service: 'ac' }, basePrefs),
    );
    expect(ev.checks.make).toBe('unsupported');
    expect(ev.verdict).toBe('excluded');
  });

  it('excludes via explicit year restriction (1983 Corolla vs demo_dxb_02)', () => {
    const vehicle: VehicleProfile = {
      make: 'Toyota',
      model: 'Corolla',
      year: 1983,
      chassisCode: 'KE70',
      source: 'manual',
    };
    const ev = evaluateEligibility(
      byId['demo_dxb_02'],
      criteria(vehicle, { category: 'unsure' }, {
        emirate: 'dubai',
        area: 'Al Quoz',
        coords: SAMPLE_LOCATIONS.dubaiAlQuoz,
        timing: 'flexible',
        travel: 'uae',
      }),
    );
    expect(ev.checks.modelYear).toBe('unsupported');
    expect(ev.verdict).toBe('excluded');
    expect(ev.exclusionReasons.join(' ')).toContain('2005');
  });

  it('nearby travel with missing coords is unconfirmed — never broadened to emirate', () => {
    const noCoords = mkGarage({
      services: ['general_inspection'],
      emirate: 'abu_dhabi',
      coords: undefined,
    });
    const ev = evaluateEligibility(
      noCoords,
      criteria(corolla2016, { category: 'unsure' }, basePrefs),
    );
    expect(ev.checks.travel).toBe('unknown');
    expect(ev.verdict).toBe('unconfirmed');
  });

  it('applies the 15 km nearby boundary', () => {
    // ~0.13 deg latitude ≈ 14.5 km — just inside; 0.14 ≈ 15.6 km — outside.
    const inside = mkGarage({
      id: 'g_in',
      services: ['general_inspection'],
      coords: { lat: 24.47 + 0.13, lon: 54.345 },
    });
    const outside = mkGarage({
      id: 'g_out',
      services: ['general_inspection'],
      coords: { lat: 24.47 + 0.14, lon: 54.345 },
    });
    const c = criteria(corolla2016, { category: 'unsure' }, basePrefs);
    const evIn = evaluateEligibility(inside, c);
    const evOut = evaluateEligibility(outside, c);
    expect(evIn.distanceKm!).toBeLessThanOrEqual(15);
    expect(evIn.checks.travel).toBe('within');
    expect(evIn.verdict).toBe('suitable');
    expect(evOut.distanceKm!).toBeGreaterThan(15);
    expect(evOut.checks.travel).toBe('outside');
    expect(evOut.verdict).toBe('excluded');
  });

  it('restoration: relevant evidence ranks first, no-evidence garages are excluded', () => {
    const s = demoScenarios.classicCorollaRestoration;
    const noEvidence = mkGarage({
      id: 'g_noev',
      services: ['full_restoration'],
      emirate: 'dubai',
      coords: SAMPLE_LOCATIONS.dubaiAlQuoz,
    });
    const generic = mkGarage({
      id: 'g_generic',
      services: ['full_restoration'],
      emirate: 'dubai',
      coords: { lat: 25.15, lon: 55.2 },
      evidence: [
        {
          id: 'ev_bmw',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['BMW'],
          excerpt: 'BMW 2002 restoration',
          retrievedAt: NOW,
          isSample: true,
        },
      ],
    });
    const set = [...garages, noEvidence, generic];
    const map = Object.fromEntries(set.map((g) => [g.id, g]));
    const c = criteria(s.vehicle, s.job, s.prefs);
    const evals = set.map((g) => evaluateEligibility(g, c));
    const ranked = rankEvaluations(evals, c, map);

    // no-evidence restoration garage excluded
    expect(
      evals.find((e) => e.garageId === 'g_noev')!.verdict,
    ).toBe('excluded');
    // relevant (Toyota examples) ranked ahead of generic (BMW example)
    const ids = ranked.suitable.map((e) => e.garageId);
    expect(ids).toContain('demo_dxb_01');
    expect(ids).toContain('demo_shj_01');
    expect(ids).toContain('g_generic');
    expect(ids.indexOf('g_generic')).toBeGreaterThan(
      Math.max(ids.indexOf('demo_dxb_01'), ids.indexOf('demo_shj_01')),
    );
  });

  it('public listings with no inbox are public_only, never excluded for participation', () => {
    const publicListing = mkGarage({
      listingType: 'public_listing',
      services: ['ac'],
      coords: { lat: 24.466, lon: 54.36 },
      participation: { status: 'none', acceptingEnquiries: false },
    });
    const ev = evaluateEligibility(
      publicListing,
      criteria(corolla2016, { category: 'repair', service: 'ac' }, basePrefs),
    );
    expect(ev.checks.participation).toBe('public_only');
    expect(ev.verdict).not.toBe('excluded');
    expect(ev.exclusionReasons).not.toContain('Not currently accepting enquiries');
  });

  it('a participating garage not accepting enquiries is excluded', () => {
    const g = mkGarage({
      services: ['ac'],
      coords: { lat: 24.466, lon: 54.36 },
      participation: { status: 'participating', acceptingEnquiries: false },
    });
    const ev = evaluateEligibility(
      g,
      criteria(corolla2016, { category: 'repair', service: 'ac' }, basePrefs),
    );
    expect(ev.checks.participation).toBe('not_accepting');
    expect(ev.verdict).toBe('excluded');
    expect(ev.exclusionReasons).toContain('Not currently accepting enquiries');
  });

  it('stale availability (declared for yesterday) → needs_confirmation', () => {
    const ev = evaluateEligibility(
      byId['demo_shj_02'],
      criteria(
        corolla2016,
        { category: 'repair', service: 'ac' },
        {
          emirate: 'sharjah',
          area: 'Industrial Area',
          coords: SAMPLE_LOCATIONS.sharjahIndustrialArea,
          timing: 'today',
          travel: 'nearby',
        },
      ),
    );
    expect(ev.availability).toBe('needs_confirmation');
    expect(ev.cautions).toContain('Availability needs confirmation');
  });

  it('relevantPrice never falls back to an unrelated price', () => {
    // demo_ad_01 only prices AC; a brakes job must not pick it up.
    const ev = evaluateEligibility(
      byId['demo_ad_01'],
      criteria(corolla2016, { category: 'repair', service: 'brakes' }, basePrefs),
    );
    expect(ev.relevantPrice).toBeNull();
    const evAc = evaluateEligibility(
      byId['demo_ad_01'],
      criteria(corolla2016, { category: 'repair', service: 'ac' }, basePrefs),
    );
    expect(evAc.relevantPrice?.amountAed?.min).toBe(150);
  });
});

describe('compareOffers', () => {
  function mkOffer(patch: Partial<Offer['price']> & { firstStep?: Offer['firstStep'] }): Offer {
    const { firstStep, ...price } = patch;
    return {
      id: 'o',
      enquiryId: 'e',
      garageId: 'g',
      createdAt: NOW,
      capabilityConfirmed: true,
      firstStep: firstStep ?? 'inspection',
      appointmentAt: NOW,
      expiresAt: NOW,
      status: 'open',
      price: {
        id: 'p',
        service: 'ac',
        scope: 'AC inspection',
        type: 'inspection_fee',
        inclusions: [],
        exclusions: [],
        tax: 'unknown',
        inspectionFeeCredited: 'unknown',
        isSample: true,
        ...price,
      },
    };
  }

  it('flags offers with different tax treatment as not comparable', () => {
    const a = mkOffer({ tax: 'unknown', amountAed: { min: 150 } });
    const b = mkOffer({ tax: 'excluded', amountAed: { min: 100 } });
    const r = compareOffers([a, b]);
    expect(r.comparable).toBe(false);
    expect(r.reason).toMatch(/aren’t directly comparable/i);
  });

  it('treats same scope/type/tax offers as comparable', () => {
    const a = mkOffer({ amountAed: { min: 150 } });
    const b = mkOffer({ amountAed: { min: 100 } });
    expect(compareOffers([a, b]).comparable).toBe(true);
  });
});

describe('rankEvaluations', () => {
  function mkEval(garageId: string, verdict: Evaluation['verdict'], avail: Evaluation['availability'], dist: number | null): Evaluation {
    return {
      garageId,
      verdict,
      checks: {
        service: 'supported',
        make: 'supported',
        modelYear: 'supported',
        travel: 'within',
        participation: 'demo_inbox',
        restorationEvidence: 'none',
      },
      distanceKm: dist,
      availability: avail,
      reasons: [],
      cautions: [],
      exclusionReasons: [],
      relevantPrice: null,
    };
  }

  it('priority reorders suitable only; excluded stay excluded', () => {
    const c = criteria(
      corolla2016,
      { category: 'repair', service: 'ac' },
      { ...demoScenarios.corollaAcAbuDhabi.prefs, priority: 'earliest' },
    );
    const evals = [
      mkEval('g_excluded', 'excluded', 'today', 0.5),
      mkEval('g_late', 'suitable', 'this_week', 1),
      mkEval('g_soon', 'suitable', 'today', 9),
      mkEval('g_unc', 'unconfirmed', 'today', 0.1),
    ];
    const ranked = rankEvaluations(evals, c, {});
    expect(ranked.suitable.map((e) => e.garageId)).toEqual(['g_soon', 'g_late']);
    expect(ranked.excluded.map((e) => e.garageId)).toEqual(['g_excluded']);
    expect(ranked.unconfirmed.map((e) => e.garageId)).toEqual(['g_unc']);
  });
});

describe('demo data sanity', () => {
  it('Abu Dhabi sample distances match intents', () => {
    const d = (id: string) =>
      haversineKm(SAMPLE_LOCATIONS.abuDhabiAlKhalidiyah, byId[id].coords!);
    for (const id of ['demo_ad_01', 'demo_ad_02', 'demo_ad_03', 'demo_ad_04']) {
      expect(d(id), id).toBeLessThanOrEqual(15);
    }
    expect(d('demo_ad_05')).toBeGreaterThan(15);
  });
});
