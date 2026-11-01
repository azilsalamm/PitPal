import { z } from 'zod';
import type { Emirate, Garage } from '@pitpal/shared';
import { getGeoapifyKey } from '../config.js';
import { fetchWithTimeout, FetchTimeoutError } from '../lib/fetchWithTimeout.js';
import { recordError } from '../lib/lastError.js';

export class ProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

const ATTRIBUTION = 'Powered by Geoapify | © OpenStreetMap contributors';
export { ATTRIBUTION };

const Feature = z.object({
  properties: z.object({
    place_id: z.string(),
    name: z.string().optional(),
    formatted: z.string().optional(),
    address_line1: z.string().optional(),
    address_line2: z.string().optional(),
    suburb: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    opening_hours: z.string().optional(),
    contact: z
      .object({ phone: z.string().optional(), website: z.string().optional() })
      .passthrough()
      .optional(),
    datasource: z
      .object({ raw: z.record(z.unknown()).optional() })
      .passthrough()
      .optional(),
  }).passthrough(),
  geometry: z.object({
    coordinates: z.tuple([z.number(), z.number()]),
  }).passthrough().optional(),
});

const PlacesResponse = z.object({ features: z.array(Feature) });

// Categories we never want in results — wash-only and parts-only shops that
// slip through the repair category.
const EXCLUDE_CATEGORIES = /car_wash|car wash|vehicle_parts|parts store/i;

const GeocodeResponse = z.object({
  features: z
    .array(
      z.object({
        properties: z.object({
          lat: z.number(),
          lon: z.number(),
          formatted: z.string().optional(),
        }).passthrough(),
      }),
    )
    .optional(),
});

function emirateFromState(state: string | undefined, fallback: Emirate): Emirate {
  if (!state) return fallback;
  const s = state.toLowerCase();
  if (s.includes('dubai')) return 'dubai';
  if (s.includes('abu dhabi')) return 'abu_dhabi';
  if (s.includes('sharjah')) return 'sharjah';
  if (s.includes('ajman')) return 'ajman';
  if (s.includes('umm')) return 'umm_al_quwain';
  if (s.includes('ras')) return 'ras_al_khaimah';
  if (s.includes('fujairah')) return 'fujairah';
  return fallback;
}

function safeHttp(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? u : undefined;
  } catch {
    return undefined;
  }
}

function mapFeature(
  f: z.infer<typeof Feature>,
  requestEmirate: Emirate,
  retrievedAt: string,
): Garage | null {
  const p = f.properties;
  if (!p.name) return null;
  const lat = p.lat ?? f.geometry?.coordinates[1];
  const lon = p.lon ?? f.geometry?.coordinates[0];
  const raw = p.datasource?.raw ?? {};
  const phone =
    (typeof raw['phone'] === 'string' && raw['phone']) ||
    (typeof raw['contact:phone'] === 'string' && raw['contact:phone']) ||
    p.contact?.phone;
  const website =
    safeHttp(raw['website']) ?? safeHttp(raw['contact:website']) ?? safeHttp(p.contact?.website);
  return {
    id: `geoapify:${p.place_id}`,
    listingType: 'public_listing',
    providerId: p.place_id,
    source: { provider: 'geoapify', retrievedAt, attribution: ATTRIBUTION },
    name: p.name,
    emirate: emirateFromState(p.state, requestEmirate),
    area: p.suburb ?? p.district ?? p.city ?? '',
    address: p.formatted ?? ([p.address_line1, p.address_line2].filter(Boolean).join(', ') || undefined),
    coords: lat != null && lon != null ? { lat, lon } : undefined,
    phone: typeof phone === 'string' ? phone : undefined,
    website,
    openingHours: p.opening_hours,
    makeSupport: { mode: 'unknown' },
    restrictions: [],
    services: [],
    specialities: [],
    evidence: [],
    prices: [],
    participation: { status: 'none', acceptingEnquiries: false },
  };
}

async function apiGet(path: string, params: Record<string, string>): Promise<unknown> {
  const key = getGeoapifyKey();
  if (!key) {
    recordError('geoapify', 'NOT_CONFIGURED');
    throw new ProviderError('NOT_CONFIGURED', 'Live garage discovery is not configured in this environment.', 503);
  }
  const url = new URL(`https://api.geoapify.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('apiKey', key);
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), {}, 8000);
  } catch (e) {
    if (e instanceof FetchTimeoutError) {
      recordError('geoapify', 'PROVIDER_TIMEOUT');
      throw new ProviderError('PROVIDER_TIMEOUT', 'The listings provider timed out. Try again in a moment.', 504);
    }
    recordError('geoapify', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'The listings provider could not be reached.', 502);
  }
  if (res.status === 401 || res.status === 403) {
    recordError('geoapify', 'PROVIDER_AUTH');
    throw new ProviderError('PROVIDER_AUTH', 'The listings provider rejected our credentials.', 502);
  }
  if (res.status === 429) {
    recordError('geoapify', 'PROVIDER_QUOTA');
    throw new ProviderError('PROVIDER_QUOTA', 'The listings provider rate limit was hit. Try again shortly.', 429);
  }
  if (!res.ok) {
    recordError('geoapify', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', `The listings provider failed (${res.status}).`, 502);
  }
  return res.json();
}

export async function geocodeArea(text: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const data = GeocodeResponse.parse(
    await apiGet('/v1/geocode/search', {
      text,
      filter: 'countrycode:ae',
      limit: '1',
    }),
  );
  const r = data.features?.[0]?.properties;
  return r ? { lat: r.lat, lon: r.lon, label: r.formatted ?? text } : null;
}

export async function searchGarages(opts: {
  centre: { lat: number; lon: number };
  radiusM: number;
  limit?: number;
  offset?: number;
  requestEmirate: Emirate;
}): Promise<Garage[]> {
  const { centre, radiusM, limit = 20, offset = 0, requestEmirate } = opts;
  const data = PlacesResponse.parse(
    await apiGet('/v2/places', {
      categories: 'service.vehicle.repair.car',
      filter: `circle:${centre.lon},${centre.lat},${radiusM}`,
      bias: `proximity:${centre.lon},${centre.lat}`,
      limit: String(limit),
      offset: String(offset),
    }),
  );
  const retrievedAt = new Date().toISOString();
  const seen = new Set<string>();
  const out: Garage[] = [];
  for (const f of data.features) {
    if (seen.has(f.properties.place_id)) continue;
    seen.add(f.properties.place_id);
    const cats = ((f.properties as Record<string, unknown>).categories as string[] | undefined) ?? [];
    if (cats.some((c) => EXCLUDE_CATEGORIES.test(c)) && !cats.some((c) => /repair/i.test(c))) continue;
    const g = mapFeature(f, requestEmirate, retrievedAt);
    if (g) out.push(g);
  }
  return out;
}
