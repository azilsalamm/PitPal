import type {
  Appointment,
  CustomerRequest,
  Garage,
  JobRequest,
  Offer,
  ProviderEnquiry,
  SearchPreferences,
  ServiceCode,
  VehicleProfile,
  VehicleRestriction,
  Availability,
  Contact,
} from '../models.js';
import { Offer as OfferSchema, Appointment as AppointmentSchema } from '../models.js';
import { isFuture } from '../time/uae.js';

export class DemoError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DemoError';
  }
}

export interface ProfileOverride {
  services?: ServiceCode[];
  restrictions?: VehicleRestriction[];
  acceptingEnquiries?: boolean;
  availability?: Availability;
}

export interface DemoState {
  version: 1;
  mode: 'live' | 'demo';
  profileOverrides: Record<string, ProfileOverride>;
  requests: Record<string, CustomerRequest>;
  enquiries: Record<string, ProviderEnquiry>;
  offers: Record<string, Offer>;
  appointments: Record<string, Appointment>;
}

export function initialDemoState(): DemoState {
  return {
    version: 1,
    mode: 'live',
    profileOverrides: {},
    requests: {},
    enquiries: {},
    offers: {},
    appointments: {},
  };
}

export type DemoAction =
  | { type: 'enterDemo' }
  | { type: 'leaveDemo' }
  | { type: 'reset' }
  | {
      type: 'createRequest';
      vehicle: VehicleProfile;
      job: JobRequest;
      prefs: SearchPreferences;
      contact: Contact;
      garageIds: string[];
      nowIso: string;
      ids: { requestId: string; enquiryIds: string[] };
    }
  | {
      type: 'sendOffer';
      enquiryId: string;
      offer: Omit<Offer, 'id' | 'status' | 'createdAt' | 'enquiryId' | 'garageId'>;
      offerId: string;
      nowIso: string;
    }
  | { type: 'askQuestion'; enquiryId: string; question: string; nowIso: string }
  | { type: 'answerQuestion'; enquiryId: string; answer: string; nowIso: string }
  | { type: 'decline'; enquiryId: string; reason?: string; nowIso: string }
  | {
      type: 'confirmOffer';
      offerId: string;
      appointmentId: string;
      reference: string;
      nowIso: string;
      garage: Garage;
    }
  | { type: 'cancelAppointment'; appointmentId: string; nowIso: string }
  | { type: 'cancelRequest'; requestId: string; nowIso: string }
  | { type: 'tick'; nowIso: string }
  | { type: 'updateProfile'; garageId: string; patch: ProfileOverride }
  | {
      type: 'simulateReply';
      enquiryId: string;
      kind: 'offer' | 'question' | 'decline' | 'expired_offer';
      nowIso: string;
      garage: Garage;
      ids: { offerId?: string };
    };

const ACTIVE_ENQUIRY: ProviderEnquiry['status'][] = [
  'waiting',
  'info_needed',
  'offer_received',
];

function updateEnquiry(
  state: DemoState,
  id: string,
  patch: Partial<ProviderEnquiry>,
  nowIso: string,
): DemoState {
  const enq = state.enquiries[id];
  if (!enq) throw new DemoError('NOT_FOUND', `Unknown enquiry ${id}`);
  return {
    ...state,
    enquiries: {
      ...state.enquiries,
      [id]: { ...enq, ...patch, updatedAt: nowIso },
    },
  };
}

export function reduce(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'enterDemo':
      return { ...state, mode: 'demo' };
    case 'leaveDemo':
      return { ...state, mode: 'live' };
    case 'reset':
      // Clears this browser's demo records but keeps the mode and profile
      // overrides out of scope: requests/enquiries/offers/appointments go.
      return { ...initialDemoState(), mode: state.mode };

    case 'createRequest': {
      const { vehicle, job, prefs, contact, garageIds, nowIso, ids } = action;
      if (garageIds.length < 1 || garageIds.length > 3) {
        throw new DemoError('BAD_RECIPIENTS', 'Choose between 1 and 3 garages');
      }
      if (garageIds.length !== ids.enquiryIds.length) {
        throw new DemoError('BAD_IDS', 'enquiryIds must match garageIds');
      }
      const request: CustomerRequest = {
        id: ids.requestId,
        createdAt: nowIso,
        vehicle,
        job,
        prefs,
        contact,
        enquiryIds: ids.enquiryIds,
        status: 'open',
      };
      const enquiries: Record<string, ProviderEnquiry> = {};
      garageIds.forEach((garageId, i) => {
        const id = ids.enquiryIds[i];
        enquiries[id] = {
          id,
          requestId: ids.requestId,
          garageId,
          status: 'waiting',
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      });
      return {
        ...state,
        requests: { ...state.requests, [request.id]: request },
        enquiries: { ...state.enquiries, ...enquiries },
      };
    }

    case 'sendOffer': {
      const enq = state.enquiries[action.enquiryId];
      if (!enq) throw new DemoError('NOT_FOUND', 'Unknown enquiry');
      if (!ACTIVE_ENQUIRY.includes(enq.status)) {
        throw new DemoError('BAD_STATE', `Enquiry is ${enq.status}`);
      }
      const parsed = OfferSchema.omit({
        id: true,
        status: true,
        createdAt: true,
        enquiryId: true,
        garageId: true,
      }).safeParse(action.offer);
      if (!parsed.success) throw new DemoError('BAD_OFFER', 'Invalid offer');
      if (!isFuture(action.offer.appointmentAt, new Date(action.nowIso))) {
        throw new DemoError('PAST_APPOINTMENT', 'Appointment must be in the future');
      }
      if (!isFuture(action.offer.expiresAt, new Date(action.nowIso))) {
        throw new DemoError('PAST_EXPIRY', 'Offer expiry must be in the future');
      }
      const offer: Offer = {
        ...action.offer,
        id: action.offerId,
        enquiryId: enq.id,
        garageId: enq.garageId,
        createdAt: action.nowIso,
        status: 'open',
      };
      return updateEnquiry(
        { ...state, offers: { ...state.offers, [offer.id]: offer } },
        enq.id,
        { status: 'offer_received', offerId: offer.id },
        action.nowIso,
      );
    }

    case 'askQuestion': {
      const enq = state.enquiries[action.enquiryId];
      if (!enq) throw new DemoError('NOT_FOUND', 'Unknown enquiry');
      if (enq.status !== 'waiting' && enq.status !== 'info_needed') {
        throw new DemoError('BAD_STATE', `Enquiry is ${enq.status}`);
      }
      if (enq.question && !enq.answer) {
        throw new DemoError('QUESTION_OPEN', 'A question is already unanswered');
      }
      return updateEnquiry(
        state,
        enq.id,
        { status: 'info_needed', question: action.question, answer: undefined },
        action.nowIso,
      );
    }

    case 'answerQuestion': {
      const enq = state.enquiries[action.enquiryId];
      if (!enq) throw new DemoError('NOT_FOUND', 'Unknown enquiry');
      if (enq.status !== 'info_needed' || !enq.question || enq.answer) {
        throw new DemoError('BAD_STATE', 'No open question to answer');
      }
      return updateEnquiry(
        state,
        enq.id,
        { status: 'waiting', answer: action.answer },
        action.nowIso,
      );
    }

    case 'decline': {
      const enq = state.enquiries[action.enquiryId];
      if (!enq) throw new DemoError('NOT_FOUND', 'Unknown enquiry');
      if (!ACTIVE_ENQUIRY.includes(enq.status)) {
        throw new DemoError('BAD_STATE', `Enquiry is ${enq.status}`);
      }
      let s = state;
      if (enq.offerId && state.offers[enq.offerId]?.status === 'open') {
        s = {
          ...s,
          offers: {
            ...s.offers,
            [enq.offerId]: { ...s.offers[enq.offerId], status: 'withdrawn' },
          },
        };
      }
      return updateEnquiry(
        s,
        enq.id,
        { status: 'declined', declineReason: action.reason },
        action.nowIso,
      );
    }

    case 'confirmOffer': {
      const offer = state.offers[action.offerId];
      if (!offer) throw new DemoError('NOT_FOUND', 'Unknown offer');
      const enq = state.enquiries[offer.enquiryId];
      const request = state.requests[offer.enquiryId ? enq.requestId : ''];

      // Idempotent: same appointment already recorded for this offer.
      if (
        request &&
        request.status === 'confirmed' &&
        request.appointmentId &&
        state.appointments[request.appointmentId]?.offerId === offer.id
      ) {
        return state;
      }
      if (request && request.status === 'confirmed') {
        throw new DemoError('ALREADY_CONFIRMED', 'A different offer is already confirmed');
      }
      if (!request || request.status !== 'open') {
        throw new DemoError('BAD_STATE', 'Request is not open');
      }
      if (offer.status !== 'open') {
        throw new DemoError('OFFER_NOT_OPEN', `Offer is ${offer.status}`);
      }
      if (!isFuture(offer.expiresAt, new Date(action.nowIso))) {
        throw new DemoError('OFFER_EXPIRED', 'This offer has expired');
      }
      if (enq.status !== 'offer_received') {
        throw new DemoError('BAD_STATE', `Enquiry is ${enq.status}`);
      }
      if (!/^PP-[A-Z0-9]{6}$/.test(action.reference)) {
        throw new DemoError('BAD_REFERENCE', 'Invalid appointment reference');
      }

      const appointment: Appointment = {
        id: action.appointmentId,
        reference: action.reference,
        requestId: request.id,
        enquiryId: enq.id,
        offerId: offer.id,
        confirmedAt: action.nowIso,
        status: 'confirmed',
        snapshot: {
          garage: {
            id: action.garage.id,
            name: action.garage.name,
            address: action.garage.address,
            area: action.garage.area,
            emirate: action.garage.emirate,
            coords: action.garage.coords,
            phone: action.garage.phone,
          },
          vehicle: request.vehicle,
          job: request.job,
          firstStep: offer.firstStep,
          appointmentAt: offer.appointmentAt,
          price: offer.price,
          capabilityConfirmed: true,
        },
      };
      AppointmentSchema.parse(appointment);

      const enquiries = { ...state.enquiries };
      const offers = { ...state.offers };
      enquiries[enq.id] = { ...enq, status: 'confirmed', updatedAt: action.nowIso };
      offers[offer.id] = { ...offer, status: 'accepted' };
      for (const otherId of request.enquiryIds) {
        if (otherId === enq.id) continue;
        const other = enquiries[otherId];
        if (!other || !ACTIVE_ENQUIRY.includes(other.status)) continue;
        enquiries[otherId] = {
          ...other,
          status: 'superseded',
          updatedAt: action.nowIso,
        };
        if (other.offerId && offers[other.offerId]?.status === 'open') {
          offers[other.offerId] = { ...offers[other.offerId], status: 'superseded' };
        }
      }

      return {
        ...state,
        requests: {
          ...state.requests,
          [request.id]: {
            ...request,
            status: 'confirmed',
            appointmentId: appointment.id,
          },
        },
        enquiries,
        offers,
        appointments: { ...state.appointments, [appointment.id]: appointment },
      };
    }

    case 'cancelAppointment': {
      const appt = state.appointments[action.appointmentId];
      if (!appt) throw new DemoError('NOT_FOUND', 'Unknown appointment');
      if (appt.status !== 'confirmed') return state;
      const request = state.requests[appt.requestId];
      const enquiries = { ...state.enquiries };
      enquiries[appt.enquiryId] = {
        ...enquiries[appt.enquiryId],
        status: 'cancelled',
        updatedAt: action.nowIso,
      };
      // Do NOT revive superseded enquiries or offers.
      return {
        ...state,
        appointments: {
          ...state.appointments,
          [appt.id]: { ...appt, status: 'cancelled', cancelledAt: action.nowIso },
        },
        requests: request
          ? {
              ...state.requests,
              [appt.requestId]: { ...request, status: 'cancelled' },
            }
          : state.requests,
        enquiries,
      };
    }

    case 'cancelRequest': {
      const request = state.requests[action.requestId];
      if (!request) throw new DemoError('NOT_FOUND', 'Unknown request');
      if (request.status !== 'open') return state;
      const enquiries = { ...state.enquiries };
      const offers = { ...state.offers };
      for (const id of request.enquiryIds) {
        const enq = enquiries[id];
        if (!enq) continue;
        enquiries[id] = { ...enq, status: 'cancelled', updatedAt: action.nowIso };
        if (enq.offerId && offers[enq.offerId]?.status === 'open') {
          offers[enq.offerId] = { ...offers[enq.offerId], status: 'withdrawn' };
        }
      }
      return {
        ...state,
        requests: {
          ...state.requests,
          [request.id]: { ...request, status: 'cancelled' },
        },
        enquiries,
        offers,
      };
    }

    case 'tick': {
      const now = new Date(action.nowIso).getTime();
      const offers = { ...state.offers };
      const enquiries = { ...state.enquiries };
      let changed = false;
      for (const offer of Object.values(state.offers)) {
        if (offer.status === 'open' && new Date(offer.expiresAt).getTime() <= now) {
          offers[offer.id] = { ...offer, status: 'expired' };
          const enq = enquiries[offer.enquiryId];
          if (enq && enq.status === 'offer_received' && enq.offerId === offer.id) {
            enquiries[enq.id] = { ...enq, status: 'expired', updatedAt: action.nowIso };
          }
          changed = true;
        }
      }
      return changed ? { ...state, offers, enquiries } : state;
    }

    case 'updateProfile': {
      const existing = state.profileOverrides[action.garageId] ?? {};
      return {
        ...state,
        profileOverrides: {
          ...state.profileOverrides,
          [action.garageId]: { ...existing, ...action.patch },
        },
      };
    }

    case 'simulateReply': {
      const enq = state.enquiries[action.enquiryId];
      if (!enq) throw new DemoError('NOT_FOUND', 'Unknown enquiry');
      switch (action.kind) {
        case 'question':
          return reduce(state, {
            type: 'askQuestion',
            enquiryId: action.enquiryId,
            question:
              'Could you share a little more detail about the issue? (simulated)',
            nowIso: action.nowIso,
          });
        case 'decline':
          return reduce(state, {
            type: 'decline',
            enquiryId: action.enquiryId,
            reason: 'Unable to take this job right now (simulated)',
            nowIso: action.nowIso,
          });
        case 'offer':
        case 'expired_offer': {
          if (!action.ids.offerId) {
            throw new DemoError('BAD_IDS', 'offerId required for simulateReply');
          }
          const samplePrice = action.garage.prices.find((p) => p.isSample);
          const isRestoration = action.garage.services.includes('full_restoration');
          const appointmentAt = new Date(
            new Date(action.nowIso).getTime() + 48 * 3600_000,
          ).toISOString();
          const expiresAt =
            action.kind === 'expired_offer'
              ? new Date(new Date(action.nowIso).getTime() - 3600_000).toISOString()
              : new Date(new Date(action.nowIso).getTime() + 24 * 3600_000).toISOString();
          const offer: Omit<Offer, 'id' | 'status' | 'createdAt' | 'enquiryId' | 'garageId'> = {
            capabilityConfirmed: true,
            firstStep: isRestoration ? 'restoration_consultation' : 'inspection',
            appointmentAt,
            price: samplePrice ?? {
              id: `sample_${enq.garageId}`,
              service: 'general_inspection',
              scope: 'General inspection (simulated)',
              type: 'inspection_fee',
              inclusions: [],
              exclusions: [],
              tax: 'unknown',
              inspectionFeeCredited: 'unknown',
              isSample: true,
            },
            expiresAt,
          };
          // expired_offer intentionally writes an OPEN offer whose expiresAt is
          // already in the past (bypassing sendOffer's future-expiry check).
          // Callers must dispatch `tick` right after any simulateReply/sendOffer —
          // and on load + every 60 s — so it flips to expired/expired enquiry.
          if (action.kind === 'offer') {
            return reduce(state, {
              type: 'sendOffer',
              enquiryId: action.enquiryId,
              offer,
              offerId: action.ids.offerId,
              nowIso: action.nowIso,
            });
          }
          const enq2 = state.enquiries[action.enquiryId];
          if (!enq2 || !ACTIVE_ENQUIRY.includes(enq2.status)) {
            throw new DemoError('BAD_STATE', `Enquiry is ${enq2?.status}`);
          }
          const full: Offer = {
            ...offer,
            id: action.ids.offerId,
            enquiryId: enq2.id,
            garageId: enq2.garageId,
            createdAt: action.nowIso,
            status: 'open',
          };
          return updateEnquiry(
            { ...state, offers: { ...state.offers, [full.id]: full } },
            enq2.id,
            { status: 'offer_received', offerId: full.id },
            action.nowIso,
          );
        }
      }
    }
  }
}
