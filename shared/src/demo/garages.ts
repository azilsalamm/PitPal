import type {
  Availability,
  Garage,
  JobRequest,
  SearchPreferences,
  VehicleProfile,
} from '../models.js';
import { uaeDateString } from '../time/uae.js';

// Sample customer locations from the design spec.
export const SAMPLE_LOCATIONS = {
  abuDhabiAlKhalidiyah: { lat: 24.47, lon: 54.345 },
  dubaiAlQuoz: { lat: 25.137, lon: 55.227 },
  sharjahIndustrialArea: { lat: 25.314, lon: 55.405 },
} as const;

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function demoSource(nowIso: string) {
  return { provider: 'demo' as const, retrievedAt: nowIso };
}

const demoParticipation = {
  status: 'demo_inbox' as const,
  acceptingEnquiries: true,
};

export function buildDemoGarages(nowIso: string): Garage[] {
  const now = new Date(nowIso);
  const todayUae = uaeDateString(now);
  const yesterdayUae = uaeDateString(addDays(now, -1));

  const todayAvailability = (capacity: Availability['capacity'], note?: string): Availability => ({
    capacity,
    declaredAt: nowIso,
    validOnUaeDate: todayUae,
    note,
  });

  return [
    // 1 — nearby Japanese AC option, today's capacity, inspection fee sample
    {
      id: 'demo_ad_01',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Khalidiya Auto Care',
      emirate: 'abu_dhabi',
      area: 'Al Khalidiyah',
      address: 'Al Khalidiyah, Abu Dhabi (sample address)',
      coords: { lat: 24.466, lon: 54.36 },
      phone: '+971 2 000 0001',
      makeSupport: { mode: 'list', makes: ['Toyota', 'Nissan', 'Honda', 'Lexus'] },
      restrictions: [],
      services: ['ac', 'brakes', 'general_inspection', 'routine_service'],
      specialities: ['Japanese cars', 'Air conditioning'],
      evidence: [
        {
          id: 'ev_ad_01_ac',
          kind: 'garage_provided',
          service: 'ac',
          makes: ['Toyota', 'Nissan', 'Honda', 'Lexus'],
          excerpt: 'AC diagnostics and repair for Japanese makes',
          retrievedAt: nowIso,
          isSample: true,
        },
      ],
      availability: todayAvailability('accepting_today'),
      prices: [
        {
          id: 'price_ad_01_ac',
          service: 'ac',
          scope: 'AC inspection',
          type: 'inspection_fee',
          amountAed: { min: 150 },
          inclusions: [
            'refrigerant pressure check',
            'leak inspection',
            'compressor & fan operation',
          ],
          exclusions: ['refrigerant top-up', 'parts', 'labour beyond inspection'],
          tax: 'unknown',
          inspectionFeeCredited: 'yes',
          isSample: true,
        },
      ],
      participation: demoParticipation,
    },
    // 2 — second AC inspection offer with different inclusions (compare pair)
    {
      id: 'demo_ad_02',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Mussafah Cool Tech',
      emirate: 'abu_dhabi',
      area: 'Mussafah',
      address: 'Mussafah Industrial, Abu Dhabi (sample address)',
      coords: { lat: 24.4, lon: 54.46 },
      phone: '+971 2 000 0002',
      makeSupport: {
        mode: 'list',
        makes: ['Toyota', 'Nissan', 'Honda', 'Lexus', 'Hyundai', 'Kia'],
      },
      restrictions: [],
      services: ['ac', 'electrical', 'general_inspection'],
      specialities: ['Air conditioning', 'Auto electrics'],
      evidence: [
        {
          id: 'ev_ad_02_ac',
          kind: 'website_listed',
          service: 'ac',
          excerpt: 'AC servicing for Japanese and Korean vehicles',
          retrievedAt: nowIso,
          isSample: true,
        },
      ],
      availability: todayAvailability('accepting_this_week'),
      prices: [
        {
          id: 'price_ad_02_ac',
          service: 'ac',
          scope: 'AC inspection',
          type: 'inspection_fee',
          amountAed: { min: 100 },
          inclusions: ['visual inspection', 'refrigerant pressure check'],
          exclusions: ['leak testing', 'refrigerant top-up', 'parts', 'labour'],
          tax: 'excluded',
          inspectionFeeCredited: 'no',
          isSample: true,
        },
      ],
      participation: demoParticipation,
    },
    // 3 — nearby but explicitly unsuitable for a Toyota (German makes only)
    {
      id: 'demo_ad_03',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Corniche German Werks',
      emirate: 'abu_dhabi',
      area: 'Corniche',
      address: 'Corniche Road, Abu Dhabi (sample address)',
      coords: { lat: 24.493, lon: 54.366 },
      makeSupport: {
        mode: 'list',
        makes: ['BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche'],
      },
      restrictions: [],
      services: ['general_inspection', 'routine_service', 'electrical', 'ac'],
      specialities: ['German cars'],
      evidence: [],
      availability: todayAvailability('accepting_today'),
      prices: [],
      participation: demoParticipation,
    },
    // 4 — relevant capability, availability never declared
    {
      id: 'demo_ad_04',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Al Reem Quick Service',
      emirate: 'abu_dhabi',
      area: 'Al Reem Island',
      address: 'Al Reem Island, Abu Dhabi (sample address)',
      coords: { lat: 24.485, lon: 54.39 },
      makeSupport: { mode: 'all' },
      restrictions: [],
      services: ['routine_service', 'tyres', 'brakes', 'ac'],
      specialities: ['Quick servicing'],
      evidence: [],
      // no availability declared
      prices: [],
      participation: demoParticipation,
    },
    // 5 — outside the 15 km nearby radius
    {
      id: 'demo_ad_05',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Baniyas Motors',
      emirate: 'abu_dhabi',
      area: 'Baniyas',
      address: 'Baniyas, Abu Dhabi (sample address)',
      coords: { lat: 24.33, lon: 54.58 },
      makeSupport: { mode: 'list', makes: ['Toyota', 'Nissan'] },
      restrictions: [],
      services: ['routine_service', 'general_inspection'],
      specialities: ['Routine maintenance'],
      evidence: [],
      availability: todayAvailability('accepting_today'),
      prices: [],
      participation: demoParticipation,
    },
    // 6 — Dubai restoration specialist, strong evidence, far from Abu Dhabi
    {
      id: 'demo_dxb_01',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Al Quoz Heritage Restorations',
      emirate: 'dubai',
      area: 'Al Quoz',
      address: 'Al Quoz Industrial, Dubai (sample address)',
      coords: { lat: 25.14, lon: 55.23 },
      makeSupport: { mode: 'all' },
      restrictions: [],
      services: ['bodywork_paint', 'interior', 'full_restoration'],
      specialities: ['Classic restoration', 'Bodywork and paint'],
      evidence: [
        {
          id: 'ev_dxb_01_ke70',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['Toyota'],
          models: ['Corolla'],
          excerpt: '1983 Corolla KE70 bodywork and full restoration',
          retrievedAt: nowIso,
          isSample: true,
        },
        {
          id: 'ev_dxb_01_240z',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['Nissan'],
          models: ['240Z'],
          excerpt: 'Datsun 240Z restoration',
          retrievedAt: nowIso,
          isSample: true,
        },
        {
          id: 'ev_dxb_01_fj40',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['Toyota'],
          models: ['Land Cruiser'],
          excerpt: 'Land Cruiser FJ40 restoration',
          retrievedAt: nowIso,
          isSample: true,
        },
      ],
      availability: todayAvailability('accepting_this_week'),
      prices: [
        {
          id: 'price_dxb_01_consult',
          service: 'full_restoration',
          scope: 'Restoration consultation',
          type: 'assessment_required',
          amountAed: { min: 0 },
          inclusions: ['on-site assessment'],
          exclusions: ['any restoration work'],
          tax: 'unknown',
          inspectionFeeCredited: 'unknown',
          isSample: true,
        },
      ],
      participation: demoParticipation,
    },
    // 7 — Dubai Toyota/Nissan service with an explicit year restriction
    {
      id: 'demo_dxb_02',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Jumeirah Toyota & Nissan Service',
      emirate: 'dubai',
      area: 'Jumeirah',
      address: 'Jumeirah, Dubai (sample address)',
      coords: { lat: 25.19, lon: 55.24 },
      makeSupport: {
        mode: 'list',
        makes: ['Toyota', 'Nissan', 'Lexus', 'Infiniti'],
      },
      restrictions: [
        {
          make: 'Toyota',
          yearMax: 2004,
          note: 'Does not work on Toyota models older than 2005',
        },
      ],
      services: ['routine_service', 'brakes', 'tyres', 'general_inspection'],
      specialities: ['Toyota and Nissan servicing'],
      evidence: [],
      availability: todayAvailability('accepting_this_week'),
      prices: [],
      participation: demoParticipation,
    },
    // 8 — Dubai German specialist, limited capacity
    {
      id: 'demo_dxb_03',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Deutsche Motoren Dubai',
      emirate: 'dubai',
      area: 'Al Quoz',
      address: 'Al Quoz, Dubai (sample address)',
      coords: { lat: 25.15, lon: 55.25 },
      makeSupport: {
        mode: 'list',
        makes: ['BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche'],
      },
      restrictions: [],
      services: ['general_inspection', 'electrical', 'engine_transmission_inspection'],
      specialities: ['German cars', 'Diagnostics'],
      evidence: [],
      availability: todayAvailability('limited', 'One ramp available this week'),
      prices: [],
      participation: demoParticipation,
    },
    // 9 — Dubai generalist, accepting today
    {
      id: 'demo_dxb_04',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Marina General Auto',
      emirate: 'dubai',
      area: 'Dubai Marina',
      address: 'Dubai Marina, Dubai (sample address)',
      coords: { lat: 25.08, lon: 55.14 },
      makeSupport: { mode: 'all' },
      restrictions: [],
      services: ['general_inspection', 'ac', 'electrical', 'brakes', 'tyres'],
      specialities: ['General repairs'],
      evidence: [],
      availability: todayAvailability('accepting_today'),
      prices: [],
      participation: demoParticipation,
    },
    // 10 — Sharjah restoration specialist #2
    {
      id: 'demo_shj_01',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Sharjah Classic Works',
      emirate: 'sharjah',
      area: 'Industrial Area',
      address: 'Industrial Area, Sharjah (sample address)',
      coords: { lat: 25.31, lon: 55.42 },
      makeSupport: { mode: 'all' },
      restrictions: [],
      services: ['full_restoration', 'bodywork_paint', 'custom_work'],
      specialities: ['Classic restoration', 'Custom builds'],
      evidence: [
        {
          id: 'ev_shj_01_te27',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['Toyota'],
          models: ['Corolla'],
          excerpt: 'Toyota Corolla TE27/KE70 restoration projects',
          retrievedAt: nowIso,
          isSample: true,
        },
        {
          id: 'ev_shj_01_w123',
          kind: 'work_example',
          service: 'full_restoration',
          makes: ['Mercedes-Benz'],
          models: ['W123'],
          excerpt: 'Mercedes W123 restoration',
          retrievedAt: nowIso,
          isSample: true,
        },
      ],
      availability: todayAvailability('accepting_this_week'),
      prices: [
        {
          id: 'price_shj_01_consult',
          service: 'full_restoration',
          scope: 'Restoration consultation',
          type: 'assessment_required',
          inclusions: ['assessment'],
          exclusions: ['any restoration work'],
          tax: 'unknown',
          inspectionFeeCredited: 'unknown',
          isSample: true,
        },
      ],
      participation: demoParticipation,
    },
    // 11 — Sharjah generalist whose availability declaration is stale (yesterday)
    {
      id: 'demo_shj_02',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Industrial Area Fast Fix',
      emirate: 'sharjah',
      area: 'Industrial Area',
      address: 'Industrial Area, Sharjah (sample address)',
      coords: { lat: 25.316, lon: 55.41 },
      makeSupport: { mode: 'all' },
      restrictions: [],
      services: ['ac', 'brakes', 'tyres', 'general_inspection'],
      specialities: ['Fast general repairs'],
      evidence: [],
      availability: {
        capacity: 'accepting_today',
        declaredAt: addDays(now, -1).toISOString(),
        validOnUaeDate: yesterdayUae,
      },
      prices: [],
      participation: demoParticipation,
    },
    // 12 — Sharjah Nissan specialist
    {
      id: 'demo_shj_03',
      listingType: 'demo_fictional',
      source: demoSource(nowIso),
      name: 'Sharjah Nissan Patrol Specialists',
      emirate: 'sharjah',
      area: 'Industrial Area',
      address: 'Industrial Area, Sharjah (sample address)',
      coords: { lat: 25.33, lon: 55.39 },
      makeSupport: { mode: 'list', makes: ['Nissan'] },
      restrictions: [],
      services: ['engine_transmission_inspection', 'routine_service', 'custom_work'],
      specialities: ['Nissan Patrol Y61/Y62'],
      evidence: [
        {
          id: 'ev_shj_03_patrol',
          kind: 'garage_provided',
          service: 'engine_transmission_inspection',
          makes: ['Nissan'],
          models: ['Patrol'],
          excerpt: 'Patrol Y61/Y62 drivetrain work',
          retrievedAt: nowIso,
          isSample: true,
        },
      ],
      availability: todayAvailability('accepting_this_week'),
      prices: [],
      participation: demoParticipation,
    },
  ];
}

export interface DemoScenario {
  vehicle: VehicleProfile;
  job: JobRequest;
  prefs: SearchPreferences;
}

export const demoScenarios: Record<'corollaAcAbuDhabi' | 'classicCorollaRestoration', DemoScenario> = {
  corollaAcAbuDhabi: {
    vehicle: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2016,
      source: 'manual',
    },
    job: { category: 'repair', service: 'ac' },
    prefs: {
      emirate: 'abu_dhabi',
      area: 'Al Khalidiyah',
      coords: SAMPLE_LOCATIONS.abuDhabiAlKhalidiyah,
      timing: 'today',
      travel: 'nearby',
    },
  },
  classicCorollaRestoration: {
    vehicle: {
      make: 'Toyota',
      model: 'Corolla',
      year: 1983,
      chassisCode: 'KE70',
      source: 'manual',
    },
    job: { category: 'restoration', service: 'full_restoration' },
    prefs: {
      emirate: 'dubai',
      area: 'Al Quoz',
      coords: SAMPLE_LOCATIONS.dubaiAlQuoz,
      timing: 'flexible',
      travel: 'uae',
      priority: 'relevant_experience',
    },
  },
};

/** Default per-garage view data for the demo garage inbox/profile screens. */
export function demoGarageProfileFor(garageId: string): { garageId: string } {
  return { garageId };
}
