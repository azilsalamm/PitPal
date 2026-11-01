import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js';
import { TtlCache } from '../lib/cache.js';
import { dedupe } from '../lib/inflight.js';
import { UAE_EXTRA_MODELS, UAE_MAKES } from './uaeExtraModels.js';

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles';
const CACHE_7D = 7 * 24 * 3600_000;
const cache = new TtlCache<unknown>(CACHE_7D);

const MakesResponse = z.object({
  Results: z.array(z.object({ MakeName: z.string() })).optional(),
});
const ModelsResponse = z.object({
  Results: z
    .array(
      z.object({
        Model_Name: z.string(),
        Make_Name: z.string().optional(),
      }),
    )
    .optional(),
});

const CatalogFile = z.object({
  makes: z.array(
    z.object({ name: z.string(), models: z.array(z.string()).default([]) }),
  ),
});

function here(...p: string[]): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), ...p);
}

/** Catalog harvested by `npm run vehicles:refresh` — optional file. */
export function loadUaeCatalog(): { name: string; models: string[] }[] {
  for (const p of [
    here('../../data/uae-catalog.json'),
    here('../data/uae-catalog.json'),
    path.join(process.cwd(), 'server/data/uae-catalog.json'),
  ]) {
    try {
      const parsed = CatalogFile.safeParse(JSON.parse(readFileSync(p, 'utf8')));
      if (parsed.success) return parsed.data.makes;
    } catch {
      /* missing or invalid — skip */
    }
  }
  return [];
}

const norm = (s: string) => s.trim().toLowerCase();

function unionSorted(...lists: string[][]): string[] {
  const seen = new Map<string, string>();
  for (const l of lists) for (const s of l) {
    const k = norm(s);
    if (k && !seen.has(k)) seen.set(k, s.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

async function vpicGet(pathname: string): Promise<unknown> {
  const key = `vpic:${pathname}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const data = await dedupe(key, async () => {
    const res = await fetchWithTimeout(`${VPIC}${pathname}`, {}, 8_000);
    if (!res.ok) throw new Error(`vPIC ${res.status}`);
    return res.json();
  });
  cache.set(key, data);
  return data;
}

/** Test helper — clears the vPIC cache. */
export function clearVehicleCache(): void {
  cache.clear();
}

export interface MakesResult {
  makes: { name: string }[];
  sources: string[];
}

export interface ModelsResult {
  models: { name: string; yearFrom?: number; yearTo?: number }[];
  sources: string[];
}

function makeMatchesAllowlist(makeName: string): string | null {
  const n = norm(makeName).replace(/[^a-z0-9]+/g, ' ');
  for (const allow of UAE_MAKES) {
    const a = norm(allow).replace(/[^a-z0-9]+/g, ' ');
    if (n === a || n.includes(a)) return allow;
  }
  return null;
}

export async function getMakes(): Promise<MakesResult> {
  const sources: string[] = [];
  let vpicNames: string[] = [];
  try {
    const data = MakesResponse.parse(await vpicGet('/GetMakesForVehicleType/car?format=json'));
    vpicNames = (data.Results ?? []).map((r) => r.MakeName);
    sources.push('vPIC');
  } catch {
    sources.push('static');
  }

  const allowed = new Set<string>();
  for (const v of vpicNames) {
    const match = makeMatchesAllowlist(v);
    if (match) allowed.add(match);
  }
  // Ensure every allowlist make is present even if vPIC lacks it.
  const merged = unionSorted([...allowed], UAE_MAKES);

  const catalog = loadUaeCatalog();
  if (catalog.length) {
    sources.push('UAE list');
    const extra = catalog.map((m) => m.name).filter((n) => makeMatchesAllowlist(n));
    return { makes: unionSorted(merged, extra).map((name) => ({ name })), sources };
  }
  return { makes: merged.map((name) => ({ name })), sources };
}

export async function getModels(make: string): Promise<ModelsResult> {
  const sources: string[] = [];
  let vpic: string[] = [];
  const q = encodeURIComponent(make);
  try {
    const data = ModelsResponse.parse(
      await vpicGet(`/GetModelsForMake/${q}?format=json`),
    );
    vpic = (data.Results ?? []).map((r) => r.Model_Name);
    if (vpic.length) sources.push('vPIC');
    else sources.push('static');
  } catch {
    sources.push('static');
  }

  const extra = UAE_EXTRA_MODELS[make] ?? findExtraModels(make);
  if (extra.length) sources.push('UAE list');

  const catalog = loadUaeCatalog();
  const catEntry = catalog.find((m) => norm(m.name) === norm(make));
  const catModels = catEntry?.models ?? [];
  if (catModels.length && !sources.includes('UAE list')) sources.push('UAE list');

  return {
    models: unionSorted(vpic, extra, catModels).map((name) => ({ name })),
    sources,
  };
}

function findExtraModels(make: string): string[] {
  const k = norm(make);
  for (const [m, models] of Object.entries(UAE_EXTRA_MODELS)) {
    if (norm(m) === k) return models;
  }
  return [];
}
