import { z } from 'zod';

// --- Enums / primitives -----------------------------------------------------

export const ServiceCode = z.enum([
  'ac',
  'brakes',
  'tyres',
  'electrical',
  'engine_transmission_inspection',
  'general_inspection',
  'routine_service',
  'bodywork_paint',
  'interior',
  'full_restoration',
  'custom_work',
]);
export type ServiceCode = z.infer<typeof ServiceCode>;

export const JobCategory = z.enum(['repair', 'service', 'restoration', 'unsure']);
export type JobCategory = z.infer<typeof JobCategory>;

export const VehicleProfile = z.object({
  make: z.string(),
  model: z.string(),
  year: z.union([z.number(), z.literal('unknown')]),
  chassisCode: z.string().optional(),
  source: z.enum(['manual', 'photo_confirmed']),
});
export type VehicleProfile = z.infer<typeof VehicleProfile>;

export const JobRequest = z.object({
  category: JobCategory,
  service: ServiceCode.optional(),
  description: z.string().optional(),
});
export type JobRequest = z.infer<typeof JobRequest>;

export const Emirate = z.enum([
  'dubai',
  'abu_dhabi',
  'sharjah',
  'ajman',
  'umm_al_quwain',
  'ras_al_khaimah',
  'fujairah',
]);
export type Emirate = z.infer<typeof Emirate>;

export const Coords = z.object({ lat: z.number(), lon: z.number() });
export type Coords = z.infer<typeof Coords>;

export const SearchPreferences = z.object({
  emirate: Emirate,
  area: z.string(),
  coords: Coords.optional(),
  timing: z.enum(['today', 'this_week', 'flexible']),
  travel: z.enum(['nearby', 'emirate', 'uae']),
  priority: z
    .enum(['earliest', 'lower_first_visit_cost', 'relevant_experience'])
    .optional(),
  undrivable: z.boolean().optional(),
});
export type SearchPreferences = z.infer<typeof SearchPreferences>;

export const ListingType = z.enum([
  'public_listing',
  'participating',
  'demo_fictional',
]);
export type ListingType = z.infer<typeof ListingType>;

export const EvidenceKind = z.enum([
  'website_listed',
  'garage_provided',
  'work_example',
  'confirmed_for_request',
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const CapabilityEvidence = z.object({
  id: z.string(),
  kind: EvidenceKind,
  service: ServiceCode.optional(),
  makes: z.array(z.string()).optional(),
  models: z.array(z.string()).optional(),
  yearMin: z.number().optional(),
  yearMax: z.number().optional(),
  excerpt: z.string(),
  sourceUrl: z.string().optional(),
  retrievedAt: z.string(),
  isSample: z.boolean(),
});
export type CapabilityEvidence = z.infer<typeof CapabilityEvidence>;

export const VehicleRestriction = z.object({
  make: z.string(),
  model: z.string().optional(),
  yearMin: z.number().optional(),
  yearMax: z.number().optional(),
  note: z.string(),
});
export type VehicleRestriction = z.infer<typeof VehicleRestriction>;

export const MakeSupport = z.union([
  z.object({ mode: z.literal('all') }),
  z.object({ mode: z.literal('list'), makes: z.array(z.string()) }),
  z.object({ mode: z.literal('unknown') }),
]);
export type MakeSupport = z.infer<typeof MakeSupport>;

export const Availability = z.object({
  capacity: z.enum([
    'accepting_today',
    'accepting_this_week',
    'limited',
    'not_accepting',
  ]),
  declaredAt: z.string(),
  validOnUaeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
});
export type Availability = z.infer<typeof Availability>;

export const PriceType = z.enum([
  'inspection_fee',
  'fixed_service',
  'estimate',
  'assessment_required',
  'unspecified',
]);
export type PriceType = z.infer<typeof PriceType>;

export const PriceEntry = z.object({
  id: z.string(),
  service: ServiceCode,
  scope: z.string(),
  type: PriceType,
  amountAed: z
    .object({ min: z.number(), max: z.number().optional() })
    .optional(),
  inclusions: z.array(z.string()),
  exclusions: z.array(z.string()),
  tax: z.enum(['included', 'excluded', 'unknown']),
  inspectionFeeCredited: z.enum(['yes', 'no', 'unknown']),
  isSample: z.boolean(),
});
export type PriceEntry = z.infer<typeof PriceEntry>;

export const Participation = z.object({
  status: z.enum(['none', 'demo_inbox', 'participating']),
  acceptingEnquiries: z.boolean(),
});
export type Participation = z.infer<typeof Participation>;

export const Garage = z.object({
  id: z.string(),
  listingType: ListingType,
  providerId: z.string().optional(),
  source: z.object({
    provider: z.enum(['demo', 'geoapify', 'contextdev']),
    retrievedAt: z.string(),
    attribution: z.string().optional(),
  }),
  name: z.string(),
  emirate: Emirate,
  area: z.string(),
  address: z.string().optional(),
  coords: Coords.optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  openingHours: z.string().optional(),
  makeSupport: MakeSupport,
  restrictions: z.array(VehicleRestriction),
  services: z.array(ServiceCode),
  unsupportedServices: z.array(ServiceCode).optional(),
  specialities: z.array(z.string()),
  evidence: z.array(CapabilityEvidence),
  availability: Availability.optional(),
  prices: z.array(PriceEntry),
  participation: Participation,
});
export type Garage = z.infer<typeof Garage>;

export const EnquiryStatus = z.enum([
  'waiting',
  'info_needed',
  'offer_received',
  'declined',
  'expired',
  'confirmed',
  'superseded',
  'cancelled',
]);
export type EnquiryStatus = z.infer<typeof EnquiryStatus>;

export const Contact = z.object({
  name: z.string(),
  phone: z.string(),
  isSample: z.boolean(),
});
export type Contact = z.infer<typeof Contact>;

export const CustomerRequest = z.object({
  id: z.string(),
  createdAt: z.string(),
  vehicle: VehicleProfile,
  job: JobRequest,
  prefs: SearchPreferences,
  contact: Contact,
  enquiryIds: z.array(z.string()),
  status: z.enum(['open', 'confirmed', 'cancelled']),
  appointmentId: z.string().optional(),
});
export type CustomerRequest = z.infer<typeof CustomerRequest>;

export const ProviderEnquiry = z.object({
  id: z.string(),
  requestId: z.string(),
  garageId: z.string(),
  status: EnquiryStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
  question: z.string().optional(),
  answer: z.string().optional(),
  offerId: z.string().optional(),
  declineReason: z.string().optional(),
});
export type ProviderEnquiry = z.infer<typeof ProviderEnquiry>;

export const Offer = z.object({
  id: z.string(),
  enquiryId: z.string(),
  garageId: z.string(),
  createdAt: z.string(),
  capabilityConfirmed: z.literal(true),
  firstStep: z.enum(['inspection', 'defined_service', 'restoration_consultation']),
  appointmentAt: z.string(),
  price: PriceEntry,
  expiresAt: z.string(),
  status: z.enum(['open', 'accepted', 'expired', 'withdrawn', 'superseded']),
});
export type Offer = z.infer<typeof Offer>;

export const Appointment = z.object({
  id: z.string(),
  reference: z.string().regex(/^PP-[A-Z0-9]{6}$/),
  requestId: z.string(),
  enquiryId: z.string(),
  offerId: z.string(),
  confirmedAt: z.string(),
  status: z.enum(['confirmed', 'cancelled']),
  cancelledAt: z.string().optional(),
  snapshot: z.object({
    garage: z.object({
      id: z.string(),
      name: z.string(),
      address: z.string().optional(),
      area: z.string(),
      emirate: Emirate,
      coords: Coords.optional(),
      phone: z.string().optional(),
    }),
    vehicle: VehicleProfile,
    job: JobRequest,
    firstStep: z.enum(['inspection', 'defined_service', 'restoration_consultation']),
    appointmentAt: z.string(),
    price: PriceEntry,
    capabilityConfirmed: z.literal(true),
  }),
});
export type Appointment = z.infer<typeof Appointment>;

export const IntegrationStatus = z.object({
  name: z.enum(['geoapify', 'gemini_vision', 'contextdev']),
  state: z.enum(['configured', 'unavailable', 'failed']),
  detail: z.string(),
  checkedAt: z.string(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatus>;

export const VisionSuggestion = z.object({
  make: z.string(),
  model: z.string(),
  yearFrom: z.number().int().nullable(),
  yearTo: z.number().int().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  note: z.string(),
});
export type VisionSuggestion = z.infer<typeof VisionSuggestion>;

export const VisionResult = z.object({
  imageQuality: z.enum(['ok', 'unclear', 'no_vehicle']),
  multipleVehicles: z.boolean(),
  suggestions: z.array(VisionSuggestion).max(3),
});
export type VisionResult = z.infer<typeof VisionResult>;

export const PlacesSearchResponse = z.object({
  listings: z.array(Garage),
  total: z.number().optional(),
  bounded: z.boolean(),
  coverageNote: z.string(),
  attribution: z.string(),
  centre: z
    .object({ lat: z.number(), lon: z.number(), label: z.string() })
    .nullable(),
  radiusKm: z.number().nullable(),
  widened: z.boolean().optional(),
});
export type PlacesSearchResponse = z.infer<typeof PlacesSearchResponse>;

/** Facts extracted from a garage's own website via Context.dev. */
export const GarageEnrichment = z.object({
  sourceUrl: z.string(),
  retrievedAt: z.string(),
  urlsAnalyzed: z.array(z.string()),
  factChecked: z.boolean(),
  services: z.array(z.string()),
  makes: z.array(z.string()),
  models: z.array(z.string()),
  restorationExamples: z.array(
    z.object({
      title: z.string(),
      vehicle: z.string().nullable(),
      description: z.string().nullable(),
    }),
  ),
  publishedFees: z.array(
    z.object({
      service: z.string(),
      amountAed: z.number().nullable(),
      scopeNote: z.string().nullable(),
    }),
  ),
  phone: z.string().nullable(),
  whatsapp: z.string().nullable(),
  address: z.string().nullable(),
  openingHours: z.string().nullable(),
});
export type GarageEnrichment = z.infer<typeof GarageEnrichment>;

/** A listing read from a third-party garage directory via Context.dev. */
export const DirectoryListing = z.object({
  id: z.string(), // dir:<sourceId>:<slug>
  name: z.string(),
  area: z.string().nullable(),
  emirate: Emirate,
  address: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  directoryProfileUrl: z.string().nullable(),
  mapsUrl: z.string().nullable(),
  listedServices: z.array(z.string()),
  source: z.object({ id: z.string(), name: z.string(), url: z.string() }),
  retrievedAt: z.string(),
});
export type DirectoryListing = z.infer<typeof DirectoryListing>;

export const DirectorySearchResponse = z.object({
  listings: z.array(DirectoryListing),
  sources: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      retrievedAt: z.string(),
      count: z.number(),
    }),
  ),
  sourceErrors: z.array(z.object({ source: z.string(), code: z.string() })),
  pending: z.array(z.string()),
  coverageNote: z.string(),
});
export type DirectorySearchResponse = z.infer<typeof DirectorySearchResponse>;

export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;
