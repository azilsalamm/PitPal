import { z } from 'zod';
import type { GarageEnrichment } from '@pitpal/shared';
import { getContextDevKey } from '../config.js';
import { fetchWithTimeout, FetchTimeoutError } from '../lib/fetchWithTimeout.js';
import { recordError } from '../lib/lastError.js';
import { ProviderError } from './geoapify.js';

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    services: { type: 'array', items: { type: 'string' } },
    makes: { type: 'array', items: { type: 'string' } },
    models: { type: 'array', items: { type: 'string' } },
    restorationExamples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          vehicle: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
        },
        required: ['title'],
      },
    },
    publishedFees: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          service: { type: 'string' },
          amountAed: { type: ['number', 'null'] },
          scopeNote: { type: ['string', 'null'] },
        },
        required: ['service'],
      },
    },
    phone: { type: ['string', 'null'] },
    whatsapp: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] },
    openingHours: { type: ['string', 'null'] },
  },
};

const ExtractData = z.object({
  services: z.array(z.string()).optional().default([]),
  makes: z.array(z.string()).optional().default([]),
  models: z.array(z.string()).optional().default([]),
  restorationExamples: z
    .array(
      z.object({
        title: z.string(),
        vehicle: z.string().nullable().optional().default(null),
        description: z.string().nullable().optional().default(null),
      }),
    )
    .optional()
    .default([]),
  publishedFees: z
    .array(
      z.object({
        service: z.string(),
        amountAed: z.number().nullable().optional().default(null),
        scopeNote: z.string().nullable().optional().default(null),
      }),
    )
    .optional()
    .default([]),
  phone: z.string().nullable().optional().default(null),
  whatsapp: z.string().nullable().optional().default(null),
  address: z.string().nullable().optional().default(null),
  openingHours: z.string().nullable().optional().default(null),
});

const ExtractResponse = z.object({
  status: z.string().optional(),
  urls_analyzed: z.array(z.string()).optional().default([]),
  data: z.unknown(),
});

const SearchResponse = z.object({
  results: z
    .array(z.object({ url: z.string(), title: z.string().optional() }).passthrough())
    .optional()
    .default([]),
});

export async function contextDevPost(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const key = getContextDevKey();
  if (!key) {
    recordError('contextdev', 'NOT_CONFIGURED');
    throw new ProviderError('NOT_CONFIGURED', 'Website enrichment is not configured in this environment.', 503);
  }
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `https://api.context.dev${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
      },
      timeoutMs,
    );
  } catch (e) {
    if (e instanceof FetchTimeoutError) {
      recordError('contextdev', 'PROVIDER_TIMEOUT');
      throw new ProviderError('PROVIDER_TIMEOUT', 'Website enrichment timed out.', 504);
    }
    recordError('contextdev', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'Website enrichment could not be reached.', 502);
  }
  if (res.status === 401 || res.status === 403) {
    recordError('contextdev', 'PROVIDER_AUTH');
    throw new ProviderError('PROVIDER_AUTH', 'Website enrichment credentials were rejected.', 502);
  }
  if (res.status === 429) {
    recordError('contextdev', 'PROVIDER_QUOTA');
    throw new ProviderError('PROVIDER_QUOTA', 'Website enrichment is rate-limited right now.', 429);
  }
  if (!res.ok) {
    recordError('contextdev', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', `Website enrichment failed (${res.status}).`, 502);
  }
  return res.json();
}

/** Extract structured garage facts from a page. Page text is treated as data only. */
export async function extractWebsite(url: string): Promise<GarageEnrichment> {
  const raw = await contextDevPost(
    '/v1/web/extract',
    {
      url,
      schema: EXTRACT_SCHEMA,
      factCheck: true,
      instructions:
        'Extract only facts stated on the site: offered services, vehicle makes/models they work on, restoration project examples, published fees in AED, phone, WhatsApp, address and opening hours. Leave fields empty/null when not stated.',
    },
    60_000,
  );
  const parsed = ExtractResponse.parse(raw);
  const data = ExtractData.parse(parsed.data ?? {});
  return {
    sourceUrl: url,
    retrievedAt: new Date().toISOString(),
    urlsAnalyzed: parsed.urls_analyzed,
    factChecked: true,
    services: data.services,
    makes: data.makes,
    models: data.models,
    restorationExamples: data.restorationExamples.map((r) => ({
      title: r.title,
      vehicle: r.vehicle ?? null,
      description: r.description ?? null,
    })),
    publishedFees: data.publishedFees.map((f) => ({
      service: f.service,
      amountAed: f.amountAed ?? null,
      scopeNote: f.scopeNote ?? null,
    })),
    phone: data.phone,
    whatsapp: data.whatsapp,
    address: data.address,
    openingHours: data.openingHours,
  };
}

export async function searchWeb(query: string): Promise<{ url: string; title: string }[]> {
  const raw = await contextDevPost('/v1/web/search', { query }, 20_000);
  const parsed = SearchResponse.parse(raw);
  return parsed.results.map((r) => ({ url: r.url, title: r.title ?? r.url }));
}
