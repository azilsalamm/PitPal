import { Router, type Response } from 'express';
import { z } from 'zod';
import { Emirate } from '@pitpal/shared';
import {
  ATTRIBUTION,
  geocodeArea,
  ProviderError,
  searchGarages,
} from '../adapters/geoapify.js';
import { TtlCache } from '../lib/cache.js';
import { dedupe } from '../lib/inflight.js';
import { rateLimit } from '../lib/rateLimit.js';

export const placesRouter = Router();
placesRouter.use(rateLimit('places', 120));

const cache = new TtlCache<object>(10 * 60_000);

export const PlacesBody = z.object({
  emirate: Emirate,
  area: z.string().optional().default(''),
  coords: z.object({ lat: z.number(), lon: z.number() }).optional(),
  travel: z.enum(['nearby', 'emirate', 'uae']),
});
type PlacesBodyT = z.infer<typeof PlacesBody>;

const EMIRATE_RADIUS_KM: Record<Emirate, number> = {
  dubai: 35,
  abu_dhabi: 50,
  sharjah: 25,
  ajman: 12,
  umm_al_quwain: 15,
  ras_al_khaimah: 35,
  fujairah: 30,
};

const EMIRATE_LABEL: Record<Emirate, string> = {
  dubai: 'Dubai',
  abu_dhabi: 'Abu Dhabi',
  sharjah: 'Sharjah',
  ajman: 'Ajman',
  umm_al_quwain: 'Umm Al Quwain',
  ras_al_khaimah: 'Ras Al Khaimah',
  fujairah: 'Fujairah',
};

function err(res: Response, e: unknown) {
  if (e instanceof ProviderError) {
    res.status(e.status).json({ error: { code: e.code, message: e.message } });
    return;
  }
  res.status(502).json({ error: { code: 'PROVIDER_ERROR', message: 'The listings provider failed.' } });
}

export function errProvider(res: Response, e: unknown): void {
  err(res, e);
}

/**
 * Resolve centre + radii, geocode if needed, search and widen until ≥5.
 * Returns the response payload (or null after writing an AREA_NOT_FOUND body).
 */
export async function searchPlaces(
  input: PlacesBodyT,
): Promise<Record<string, unknown> | { areNotFound: true; payload: Record<string, unknown> }> {
  const { emirate, area, coords, travel } = input;

  // Decide the centre + radius honestly. 'nearby' starts at 15 km and widens
  // (25 → 40 → emirate circle) until at least 5 listings are found.
  let centre: { lat: number; lon: number } | null = null;
  let centreLabel = '';
  let radiiKm: number[];
  if (travel === 'nearby' && coords) {
    centre = coords;
    centreLabel = 'your location';
    radiiKm = [15, 25, 40, EMIRATE_RADIUS_KM[emirate]];
  } else if (travel === 'nearby' || travel === 'emirate' || travel === 'uae') {
    radiiKm =
      travel === 'nearby'
        ? [15, 25, 40, EMIRATE_RADIUS_KM[emirate]]
        : [EMIRATE_RADIUS_KM[emirate]];
    const text = area
      ? `${area}, ${EMIRATE_LABEL[emirate]}, United Arab Emirates`
      : `${EMIRATE_LABEL[emirate]}, United Arab Emirates`;
    try {
      const geo = await geocodeArea(text);
      if (!geo) {
        return {
          areNotFound: true,
          payload: {
            listings: [],
            bounded: true,
            code: 'AREA_NOT_FOUND',
            coverageNote: `We could not locate “${area || EMIRATE_LABEL[emirate]}” — check the area spelling or pick a nearby landmark.`,
            attribution: ATTRIBUTION,
            centre: null,
            radiusKm: null,
          },
        };
      }
      centre = { lat: geo.lat, lon: geo.lon };
      centreLabel = `the approximate location of ${area || EMIRATE_LABEL[emirate]}`;
    } catch (e) {
      throw e;
    }
  } else {
    radiiKm = [15, 25, 40, EMIRATE_RADIUS_KM[emirate]];
  }
  // Dedupe radii (emirate circle may already be in the list).
  radiiKm = [...new Set(radiiKm)].sort((a, b) => a - b);

  const c = centre!;
  const cacheKey = `places:${c.lat.toFixed(2)},${c.lon.toFixed(2)}:${travel}`;
  const hit = cache.get(cacheKey);
  if (hit) {
    return hit as Record<string, unknown>;
  }

  try {
    const payload = await dedupe(cacheKey, async () => {
      let listings: Awaited<ReturnType<typeof searchGarages>> = [];
      let radiusKm = radiiKm[0];
      for (const r of radiiKm) {
        radiusKm = r;
        listings = await searchGarages({
          centre: c,
          radiusM: r * 1000,
          limit: 20,
          requestEmirate: emirate,
        });
        if (listings.length >= 5) break;
      }
      const widened = radiusKm !== radiiKm[0];
      const scopeNote =
        travel === 'uae'
          ? ' The Places API has no country-wide search; this searches the same circle around ' +
            `${EMIRATE_LABEL[emirate]}.`
          : '';
      const widenNote = widened
        ? ` Widened to ${radiusKm} km to find at least 5 garages.`
        : '';
      return {
        listings,
        bounded: listings.length >= 20,
        coverageNote:
          `Public listings within ${radiusKm} km, centred on ${centreLabel}. Public listings are incomplete.` +
          widenNote +
          scopeNote,
        attribution: ATTRIBUTION,
        centre: { ...c, label: centreLabel },
        radiusKm,
        widened,
      };
    });
    cache.set(cacheKey, payload);
    return payload;
  } catch (e) {
    throw e;
  }
}

placesRouter.post('/search', async (req, res) => {
  const parsed = PlacesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid search body' } });
    return;
  }
  try {
    const result = await searchPlaces(parsed.data);
    if ('areNotFound' in result) res.json(result.payload);
    else res.json(result);
  } catch (e) {
    err(res, e);
  }
});
