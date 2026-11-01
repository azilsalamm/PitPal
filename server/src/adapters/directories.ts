import { z } from 'zod';
import type { DirectoryListing, Emirate } from '@pitpal/shared';
import { contextDevPost } from './contextdev.js';
import { ProviderError } from './geoapify.js';
import { TtlCache } from '../lib/cache.js';
import { dedupe } from '../lib/inflight.js';

interface DirectorySource {
  id: string;
  name: string;
  url: string;
  emirates?: Emirate[]; // absent = covers all
}

export const DIRECTORY_SOURCES: DirectorySource[] = [
  {
    id: 'reachuae',
    name: 'Reach UAE',
    url: 'https://www.reachuae.com/uae/garages-c199',
  },
  {
    id: 'awnic',
    name: 'AWNIC premium garages',
    url: 'https://awnic.com/premium-garages-list/',
    emirates: ['abu_dhabi'],
  },
  {
    id: 'dubizzle_shj',
    name: 'dubizzle — Sharjah garages',
    url: 'https://www.dubizzle.com/blog/cars/car-garages-sharjah/',
    emirates: ['sharjah'],
  },
  {
    id: 'propertyfinder_ad',
    name: 'Propertyfinder — Abu Dhabi garages',
    url: 'https://www.propertyfinder.ae/blog/car-garages-abu-dhabi/',
    emirates: ['abu_dhabi'],
  },
  {
    id: 'dubizzle_dxb',
    name: 'dubizzle — Dubai garages',
    url: 'https://www.dubizzle.com/blog/cars/car-garages-dubai/',
    emirates: ['dubai'],
  },
  {
    id: 'dubizzle_ad',
    name: 'dubizzle — Abu Dhabi garages',
    url: 'https://www.dubizzle.com/blog/cars/car-garages-abu-dhabi/',
    emirates: ['abu_dhabi'],
  },
  {
    id: 'atninfo_dxb',
    name: 'ATN Info — Dubai auto repair',
    url: 'https://www.atninfo.com/uae/dubai/auto-repair-89',
    emirates: ['dubai'],
  },
  {
    id: 'atninfo_ad',
    name: 'ATN Info — Abu Dhabi garage services',
    url: 'https://www.atninfo.com/uae/abu-dhabi/garage-services-659',
    emirates: ['abu_dhabi'],
  },
  {
    id: 'almadina_dxb',
    name: 'Al Madina — top Dubai garages',
    url: 'https://www.almadinagarage.com/blog/top-car-garage-dubai-uae/',
    emirates: ['dubai'],
  },
  {
    id: 'mideast_dxb',
    name: 'Mid-East — Dubai car service centres',
    url: 'https://mid-east.info/best-car-service-center-in-dubai/',
    emirates: ['dubai'],
  },
  {
    id: 'munich_dxb',
    name: 'Munich Motor Works — Al Quoz workshops',
    url: 'https://munichmotorworks.ae/best-car-repair-workshops-in-al-quoz-dubai/',
    emirates: ['dubai'],
  },
  {
    id: 'citysearch_dxb',
    name: 'Citysearch — Al Quoz garages',
    url: 'https://www.citysearch.ae/dubai/al-quoz-industrial-area-3/automotive/cars/car-garage-repairs',
    emirates: ['dubai'],
  },
  {
    id: 'dubbizdir_dxb',
    name: 'Dubai Business Directory — car repair',
    url: 'https://dubaibusinessdirectory.ae/category/car-repair-companies-in-dubai/',
    emirates: ['dubai'],
  },
  // yellowpages.ae intentionally excluded — extraction returns 0 rows.
];

const ROW = z.object({
  name: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  emirate: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  services: z.array(z.string()).nullable().optional(),
});
export type DirectoryRow = z.infer<typeof ROW>;

const ExtractResponse = z.object({
  urls_analyzed: z.array(z.string()).optional().default([]),
  data: z.object({ garages: z.array(ROW).optional().default([]) }).optional(),
});

export interface SourceRows {
  rows: DirectoryRow[];
  retrievedAt: string;
}

const cache = new TtlCache<SourceRows>(24 * 3600_000);
const warmErrors = new Map<string, string>();
let warmRunning = false;

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    garages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: ['string', 'null'] },
          area: { type: ['string', 'null'] },
          emirate: { type: ['string', 'null'] },
          address: { type: ['string', 'null'] },
          phone: { type: ['string', 'null'] },
          website: { type: ['string', 'null'] },
          services: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

export function normaliseEmirate(text: string | null | undefined): Emirate | null {
  if (!text) return null;
  const s = text.toLowerCase();
  if (s.includes('dubai')) return 'dubai';
  if (s.includes('abu dhabi')) return 'abu_dhabi';
  if (s.includes('sharjah')) return 'sharjah';
  if (s.includes('ajman')) return 'ajman';
  if (s.includes('umm') || s.includes('uaq')) return 'umm_al_quwain';
  if (s.includes('fujairah')) return 'fujairah';
  if (s.includes('ras') || s.includes('rak')) return 'ras_al_khaimah';
  return null;
}

export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+971') || digits.startsWith('00971')) {
    return `+971${digits.replace(/^(\+971|00971)/, '')}`;
  }
  if (digits.startsWith('971')) return `+${digits}`;
  if (digits.startsWith('0')) return `+971${digits.slice(1)}`;
  return digits.startsWith('+') ? digits : null;
}

const MAPS_HOSTS = /(^|\.)(google\.|goo\.gl|maps\.)/;

export function classifyUrl(
  url: string | null | undefined,
  directoryHost: string,
): { website?: string; directoryProfileUrl?: string; mapsUrl?: string } {
  if (!url) return {};
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return {};
  }
  if (host === directoryHost || host.endsWith(`.${directoryHost}`)) {
    return { directoryProfileUrl: url };
  }
  if (MAPS_HOSTS.test(host)) return { mapsUrl: url };
  return { website: url };
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'x'
  );
}

export async function extractSource(source: DirectorySource): Promise<SourceRows> {
  const cached = cache.get(source.url);
  if (cached) return cached;
  const result = await dedupe(`dir:${source.url}`, async () => {
    const raw = await contextDevPost(
      '/v1/web/extract',
      {
        url: source.url,
        schema: EXTRACT_SCHEMA,
        factCheck: false,
        instructions:
          'List every garage/workshop named on this page with its area, emirate, address, phone, website or profile/maps link, and services as written. Do not invent rows.',
      },
      90_000,
    );
    const parsed = ExtractResponse.parse(raw);
    return { rows: parsed.data?.garages ?? [], retrievedAt: new Date().toISOString() };
  });
  cache.set(source.url, result);
  return result;
}

/** Read cache only — never fetches. */
export function cachedSource(source: DirectorySource): SourceRows | undefined {
  return cache.get(source.url);
}

/**
 * Warm the directory cache in the background (called at server start and every
 * 24 h). Errors are recorded by class only — never keys.
 */
export function warmDirectories(): void {
  if (warmRunning) return;
  warmRunning = true;
  // Sequential with a small delay — don't hammer Context.dev.
  void (async () => {
    for (const s of DIRECTORY_SOURCES) {
      try {
        await extractSource(s);
        warmErrors.delete(s.id);
      } catch (e) {
        warmErrors.set(s.id, e instanceof ProviderError ? e.code : 'PROVIDER_ERROR');
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    warmRunning = false;
  })();
}

/** Pure: turn extracted rows into DirectoryListings for one emirate. */
export function normaliseRows(
  source: DirectorySource,
  rows: DirectoryRow[],
  retrievedAt: string,
  emirate: Emirate,
  seen: Set<string>,
): DirectoryListing[] {
  const dirHost = new URL(source.url).hostname.toLowerCase();
  const out: DirectoryListing[] = [];
  for (const row of rows) {
    if (!row.name?.trim()) continue;
    const rowEmirate =
      normaliseEmirate(row.emirate) ??
      normaliseEmirate(row.area) ??
      normaliseEmirate(row.address) ??
      (source.emirates?.length === 1 ? source.emirates[0] : null);
    if (rowEmirate !== emirate) continue;
    const dedupeKey = `${row.name.trim().toLowerCase()}|${rowEmirate}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const urls = classifyUrl(row.website, dirHost);
    out.push({
      id: `dir:${source.id}:${slug(row.name)}`,
      name: row.name.trim(),
      area: row.area?.trim() || null,
      emirate: rowEmirate,
      address: row.address?.trim() || null,
      phone: normalisePhone(row.phone),
      website: urls.website ?? null,
      directoryProfileUrl: urls.directoryProfileUrl ?? null,
      mapsUrl: urls.mapsUrl ?? null,
      listedServices: (row.services ?? []).filter((s) => s.trim()),
      source: { id: source.id, name: source.name, url: source.url },
      retrievedAt,
    });
  }
  return out;
}

export interface DirectorySearchResult {
  listings: DirectoryListing[];
  sources: { name: string; url: string; retrievedAt: string; count: number }[];
  sourceErrors: { source: string; code: string }[];
  /** Sources still warming — client should poll. */
  pending: string[];
  coverageNote: string;
}

/** Pure aggregation over already-available source rows. */
export function aggregateDirectories(
  emirate: Emirate,
  area: string | undefined,
  available: { source: DirectorySource; rows: DirectoryRow[]; retrievedAt: string }[],
  pending: string[],
  failed: { source: string; code: string }[],
): DirectorySearchResult {
  const seen = new Set<string>();
  const listings: DirectoryListing[] = [];
  const sourceMeta: DirectorySearchResult['sources'] = [];
  for (const a of available) {
    const rows = normaliseRows(a.source, a.rows, a.retrievedAt, emirate, seen);
    listings.push(...rows);
    sourceMeta.push({
      name: a.source.name,
      url: a.source.url,
      retrievedAt: a.retrievedAt,
      count: rows.length,
    });
  }

  let filtered = listings;
  let coverageNote =
    'Third-party directory listings are unverified and may be incomplete or out of date.';
  if (area?.trim()) {
    const needle = area.trim().toLowerCase();
    const matched = listings.filter(
      (l) =>
        l.area?.toLowerCase().includes(needle) ||
        l.address?.toLowerCase().includes(needle) ||
        l.name.toLowerCase().includes(needle),
    );
    if (matched.length > 0) {
      filtered = matched;
      coverageNote = `Filtered to listings matching “${area}”. ` + coverageNote;
    } else if (listings.length > 0) {
      coverageNote = `No area match for “${area}”; showing the whole emirate. ` + coverageNote;
    }
  }

  return { listings: filtered, sources: sourceMeta, sourceErrors: failed, pending, coverageNote };
}

/** Cache-serving search used by the route: never blocks on extraction. */
export function searchDirectories(emirate: Emirate, area?: string): DirectorySearchResult {
  const sources = DIRECTORY_SOURCES.filter(
    (s) => !s.emirates || s.emirates.includes(emirate),
  );
  const available: { source: DirectorySource; rows: DirectoryRow[]; retrievedAt: string }[] = [];
  const pending: string[] = [];
  const failed: { source: string; code: string }[] = [];
  let needsWarm = false;
  for (const s of sources) {
    const cached = cachedSource(s);
    if (cached) {
      available.push({ source: s, rows: cached.rows, retrievedAt: cached.retrievedAt });
    } else {
      const err = warmErrors.get(s.id);
      if (err && !warmRunning) {
        failed.push({ source: s.name, code: err });
      } else {
        pending.push(s.name);
        needsWarm = true;
      }
    }
  }
  if (needsWarm) warmDirectories();
  return aggregateDirectories(emirate, area, available, pending, failed);
}
