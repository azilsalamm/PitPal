import type {
  CapabilityEvidence,
  Garage,
  JobRequest,
  PriceEntry,
  SearchPreferences,
  ServiceCode,
  VehicleProfile,
  VehicleRestriction,
} from '../models.js';
import { uaeDateString } from '../time/uae.js';

export type Tri = 'supported' | 'unknown' | 'unsupported';

export interface Criteria {
  vehicle: VehicleProfile;
  job: JobRequest;
  prefs: SearchPreferences;
  nowIso: string;
}

export interface Evaluation {
  garageId: string;
  verdict: 'suitable' | 'unconfirmed' | 'excluded';
  checks: {
    service: Tri;
    make: Tri;
    modelYear: Tri;
    travel: 'within' | 'outside' | 'unknown';
    participation: 'demo_inbox' | 'participating' | 'public_only' | 'not_accepting';
    restorationEvidence: 'relevant' | 'generic' | 'none';
  };
  distanceKm: number | null;
  availability: 'today' | 'this_week' | 'needs_confirmation' | 'not_accepting';
  reasons: string[];
  cautions: string[];
  exclusionReasons: string[];
  relevantPrice: PriceEntry | null;
}

const NEARBY_RADIUS_KM = 15;

export function requiredService(job: JobRequest): ServiceCode {
  if (job.category === 'unsure') return 'general_inspection';
  if (job.category === 'service') return 'routine_service';
  if (job.service) return job.service;
  // repair without a chosen service starts with a general inspection
  return 'general_inspection';
}

export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function eq(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function includesCi(list: string[] | undefined, value: string): boolean {
  return !!list?.some((v) => eq(v, value));
}

function restrictionMatches(
  r: VehicleRestriction,
  vehicle: VehicleProfile,
): boolean {
  if (!eq(r.make, vehicle.make)) return false;
  if (r.model && !eq(r.model, vehicle.model)) return false;
  if (vehicle.year !== 'unknown') {
    if (r.yearMin !== undefined && vehicle.year < r.yearMin) return false;
    if (r.yearMax !== undefined && vehicle.year > r.yearMax) return false;
  }
  return true;
}

function makeCheck(garage: Garage, vehicle: VehicleProfile): Tri {
  const ms = garage.makeSupport;
  if (ms.mode === 'all') return 'supported';
  if (ms.mode === 'unknown') return 'unknown';
  return includesCi(ms.makes, vehicle.make) ? 'supported' : 'unsupported';
}

function serviceCheck(
  garage: Garage,
  required: ServiceCode,
): { tri: Tri; evidence?: CapabilityEvidence } {
  if (garage.services.includes(required)) return { tri: 'supported' };
  const ev = garage.evidence.find((e) => e.service === required);
  if (ev) return { tri: 'supported', evidence: ev };
  if (garage.unsupportedServices?.includes(required)) return { tri: 'unsupported' };
  return { tri: 'unknown' };
}

function travelCheck(
  garage: Garage,
  prefs: SearchPreferences,
): { result: 'within' | 'outside' | 'unknown'; distanceKm: number | null } {
  if (prefs.travel === 'uae') return { result: 'within', distanceKm: distanceIfPossible(garage, prefs) };
  if (prefs.travel === 'emirate') {
    return {
      result: garage.emirate === prefs.emirate ? 'within' : 'outside',
      distanceKm: distanceIfPossible(garage, prefs),
    };
  }
  // nearby: require BOTH coords; never broaden to emirate
  if (!garage.coords || !prefs.coords) return { result: 'unknown', distanceKm: null };
  const d = haversineKm(prefs.coords, garage.coords);
  return { result: d <= NEARBY_RADIUS_KM ? 'within' : 'outside', distanceKm: d };
}

function distanceIfPossible(
  garage: Garage,
  prefs: SearchPreferences,
): number | null {
  if (!garage.coords || !prefs.coords) return null;
  return haversineKm(prefs.coords, garage.coords);
}

function restorationEvidence(
  garage: Garage,
  required: ServiceCode,
  vehicle: VehicleProfile,
): 'relevant' | 'generic' | 'none' {
  const workExamples = garage.evidence.filter(
    (e) => e.kind === 'work_example' && e.service === required,
  );
  if (workExamples.length === 0) return 'none';
  const relevant = workExamples.some(
    (e) => includesCi(e.makes, vehicle.make) || includesCi(e.models, vehicle.model),
  );
  return relevant ? 'relevant' : 'generic';
}

function availabilityCheck(
  garage: Garage,
  nowIso: string,
): { status: Evaluation['availability']; caution?: string } {
  const av = garage.availability;
  if (!av) {
    return { status: 'needs_confirmation', caution: 'Availability needs confirmation' };
  }
  if (av.capacity === 'not_accepting') return { status: 'not_accepting' };
  if (av.validOnUaeDate !== uaeDateString(new Date(nowIso))) {
    return { status: 'needs_confirmation', caution: 'Availability needs confirmation' };
  }
  if (av.capacity === 'accepting_today') return { status: 'today' };
  // accepting_this_week | limited
  return {
    status: 'this_week',
    caution: av.capacity === 'limited' ? 'Capacity is limited' : undefined,
  };
}

function relevantPrice(garage: Garage, job: JobRequest, required: ServiceCode): PriceEntry | null {
  if (job.category === 'restoration') {
    return (
      garage.prices.find(
        (p) => p.service === required && p.type === 'assessment_required',
      ) ?? null
    );
  }
  return garage.prices.find((p) => p.service === required) ?? null;
}

const EVIDENCE_LABEL: Record<CapabilityEvidence['kind'], string> = {
  website_listed: 'listed on the garage’s website',
  garage_provided: 'provided by the garage',
  work_example: 'supporting work example',
  confirmed_for_request: 'confirmed for your request',
};

const SERVICE_LABEL: Record<ServiceCode, string> = {
  ac: 'AC work',
  brakes: 'brake work',
  tyres: 'tyre work',
  electrical: 'electrical work',
  engine_transmission_inspection: 'engine/transmission inspections',
  general_inspection: 'general inspections',
  routine_service: 'routine servicing',
  bodywork_paint: 'bodywork and paint',
  interior: 'interior work',
  full_restoration: 'full restorations',
  custom_work: 'custom work',
};

export function evaluateEligibility(garage: Garage, criteria: Criteria): Evaluation {
  const { vehicle, job, prefs, nowIso } = criteria;
  const required = requiredService(job);

  const reasons: string[] = [];
  const cautions: string[] = [];
  const exclusionReasons: string[] = [];

  const svc = serviceCheck(garage, required);
  const make = makeCheck(garage, vehicle);

  let modelYear: Tri;
  const matchedRestriction = garage.restrictions.find((r) =>
    restrictionMatches(r, vehicle),
  );
  if (matchedRestriction) {
    modelYear = 'unsupported';
    exclusionReasons.push(matchedRestriction.note);
  } else {
    modelYear = make === 'supported' ? 'supported' : 'unknown';
  }

  const travel = travelCheck(garage, prefs);
  const resto =
    job.category === 'restoration'
      ? restorationEvidence(garage, required, vehicle)
      : 'none';
  const avail = availabilityCheck(garage, nowIso);
  if (avail.caution) cautions.push(avail.caution);

  // Public listings have no PitPal inbox at all: acceptingEnquiries=false on a
  // 'none' listing means "public_only", never "not accepting".
  const participation =
    garage.participation.status === 'none'
      ? 'public_only'
      : !garage.participation.acceptingEnquiries
        ? 'not_accepting'
        : garage.participation.status === 'demo_inbox'
          ? 'demo_inbox'
          : 'participating';

  // --- reasons / cautions ---------------------------------------------------
  if (svc.tri === 'supported') {
    if (svc.evidence) {
      reasons.push(`Lists ${SERVICE_LABEL[required]} for ${vehicle.make} (${EVIDENCE_LABEL[svc.evidence.kind]})`);
    } else {
      reasons.push(`Lists ${SERVICE_LABEL[required]}`);
    }
  } else if (svc.tri === 'unknown') {
    cautions.push(`${SERVICE_LABEL[required].replace(/^./, (c) => c.toUpperCase())} capability not confirmed`);
  }

  if (make === 'unknown') cautions.push('Make support not stated');
  if (make === 'unsupported')
    exclusionReasons.push(`Does not list ${vehicle.make} as a supported make`);

  if (travel.result === 'within' && travel.distanceKm != null) {
    reasons.push(`About ${travel.distanceKm.toFixed(1)} km from ${prefs.area}`);
  } else if (travel.result === 'outside') {
    exclusionReasons.push(
      travel.distanceKm != null
        ? `About ${travel.distanceKm.toFixed(1)} km away — outside your ${NEARBY_RADIUS_KM} km travel range`
        : `In ${garage.emirate.replace('_', ' ')} — outside your selected emirate`,
    );
  } else {
    cautions.push('Distance cannot be checked — location unknown');
  }

  if (job.category === 'restoration') {
    const ex = garage.evidence.find(
      (e) => e.kind === 'work_example' && e.service === required,
    );
    if (resto === 'relevant' && ex) {
      reasons.push(`Restoration example: ${ex.excerpt} (${EVIDENCE_LABEL[ex.kind]})`);
    } else if (resto === 'generic') {
      cautions.push('Restoration examples are for other vehicles, not this make/model');
    } else {
      exclusionReasons.push('No restoration work examples for this type of job');
    }
  }

  if (garage.listingType === 'public_listing') {
    cautions.push('Public listing — capability not confirmed');
  }
  if (participation === 'not_accepting') {
    exclusionReasons.push('Not currently accepting enquiries');
  }

  const price = relevantPrice(garage, job, required);

  // --- verdict ----------------------------------------------------------------
  const hardExcluded =
    svc.tri === 'unsupported' ||
    make === 'unsupported' ||
    modelYear === 'unsupported' ||
    travel.result === 'outside' ||
    (job.category === 'restoration' && resto === 'none') ||
    participation === 'not_accepting';

  const suitable =
    !hardExcluded &&
    svc.tri === 'supported' &&
    make === 'supported' &&
    modelYear !== 'unsupported' &&
    travel.result === 'within' &&
    (job.category === 'restoration' ? resto === 'relevant' || resto === 'generic' : true);

  const verdict: Evaluation['verdict'] = hardExcluded
    ? 'excluded'
    : suitable
      ? 'suitable'
      : 'unconfirmed';

  return {
    garageId: garage.id,
    verdict,
    checks: {
      service: svc.tri,
      make,
      modelYear,
      travel: travel.result,
      participation,
      restorationEvidence: resto,
    },
    distanceKm: travel.distanceKm,
    availability: avail.status,
    reasons,
    cautions,
    exclusionReasons,
    relevantPrice: price,
  };
}
