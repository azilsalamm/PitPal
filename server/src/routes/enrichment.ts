import { Router } from 'express';
import { z } from 'zod';
import { extractWebsite, searchWeb } from '../adapters/contextdev.js';
import { ProviderError } from '../adapters/geoapify.js';
import { TtlCache } from '../lib/cache.js';
import { dedupe } from '../lib/inflight.js';
import { rateLimit } from '../lib/rateLimit.js';
import { assertSafeUrl } from '../lib/safeUrl.js';

export const enrichmentRouter = Router();
enrichmentRouter.use(rateLimit('enrichment', 20));

const cache = new TtlCache<object>(24 * 3600_000);

const ExtractBody = z.object({ url: z.string().url() });
const FindBody = z.object({
  name: z.string().min(1),
  area: z.string().optional().default(''),
  emirate: z.string().optional().default(''),
});

const GENERIC_TOKENS = new Set([
  'auto', 'car', 'cars', 'garage', 'motors', 'motor', 'service', 'services',
  'repair', 'repairs', 'workshop', 'center', 'centre', 'llc', 'uae', 'dubai',
  'the', 'al', 'and', 'for',
]);

export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !GENERIC_TOKENS.has(t));
}

export function filterCandidates(
  name: string,
  results: { url: string; title?: string }[],
): { url: string; title: string; matchedOn: string }[] {
  const tokens = nameTokens(name);
  return results
    .map((r) => {
      let hostname = '';
      try {
        hostname = new URL(r.url).hostname.toLowerCase();
      } catch {
        return null;
      }
      const hay = `${hostname} ${(r.title ?? '').toLowerCase()}`;
      const matchedOn = tokens.find((t) => hay.includes(t));
      return matchedOn ? { url: r.url, title: r.title ?? r.url, matchedOn } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .slice(0, 3);
}

function err(res: import('express').Response, e: unknown) {
  if (e instanceof ProviderError) {
    res.status(e.status).json({ error: { code: e.code, message: e.message } });
    return;
  }
  res.status(502).json({ error: { code: 'PROVIDER_ERROR', message: 'Enrichment failed.' } });
}

enrichmentRouter.post('/extract', async (req, res) => {
  const parsed = ExtractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid body' } });
    return;
  }
  let url: URL;
  try {
    url = await assertSafeUrl(parsed.data.url);
  } catch (e) {
    res.status(400).json({
      error: { code: 'UNSAFE_URL', message: e instanceof Error ? e.message : 'URL not allowed' },
    });
    return;
  }
  const key = `extract:${url.toString()}`;
  const hit = cache.get(key);
  if (hit) {
    res.json(hit);
    return;
  }
  try {
    const payload = await dedupe(key, async () => ({
      enrichment: await extractWebsite(url.toString()),
    }));
    cache.set(key, payload);
    res.json(payload);
  } catch (e) {
    err(res, e);
  }
});

enrichmentRouter.post('/find-website', async (req, res) => {
  const parsed = FindBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid body' } });
    return;
  }
  const { name, area, emirate } = parsed.data;
  try {
    const results = await searchWeb(`"${name}" ${area} ${emirate} garage`.trim());
    res.json({ candidates: filterCandidates(name, results) });
  } catch (e) {
    err(res, e);
  }
});
