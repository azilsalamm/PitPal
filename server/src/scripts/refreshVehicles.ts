/**
 * Maintenance script: refresh server/data/uae-catalog.json from UAE car-listing
 * sites via Context.dev. Run: npm run vehicles:refresh -w @pitpal/server
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextDevPost } from '../adapters/contextdev.js';
import { UAE_MAKES } from '../adapters/uaeExtraModels.js';

const SOURCES = [
  'https://uae.yallamotor.com/new-cars',
  'https://www.dubicars.com/new-cars',
];

const SCHEMA = {
  type: 'object',
  properties: {
    makes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          models: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
  },
  required: ['makes'],
};

interface Extracted {
  makes?: { name?: string; models?: string[] }[];
}

const out = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/uae-catalog.json',
);

const byMake = new Map<string, Set<string>>();
const failed: string[] = [];

for (const url of SOURCES) {
  try {
    const raw = (await contextDevPost(
      '/v1/web/extract',
      {
        url,
        schema: SCHEMA,
        factCheck: false,
        instructions:
          'List every car make sold on this page and its model names as written. Do not invent models.',
      },
      90_000,
    )) as { data?: Extracted };
    for (const m of raw.data?.makes ?? []) {
      if (!m.name) continue;
      const set = byMake.get(m.name) ?? new Set<string>();
      for (const model of m.models ?? []) if (model.trim()) set.add(model.trim());
      byMake.set(m.name, set);
    }
    console.log(`extracted ${raw.data?.makes?.length ?? 0} makes from ${url}`);
  } catch {
    failed.push(url);
    console.log(`skipped ${url} (extract failed)`);
  }
}

// Merge with the static UAE list so the file is useful even if extraction is thin.
for (const make of UAE_MAKES) {
  if (!byMake.has(make)) byMake.set(make, new Set());
}
import { UAE_EXTRA_MODELS } from '../adapters/uaeExtraModels.js';
for (const [make, models] of Object.entries(UAE_EXTRA_MODELS)) {
  const set = byMake.get(make) ?? new Set<string>();
  for (const m of models) set.add(m);
  byMake.set(make, set);
}

const catalog = {
  makes: [...byMake.entries()]
    .map(([name, set]) => ({ name, models: [...set].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  generatedAt: new Date().toISOString(),
  sources: SOURCES,
};

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(catalog, null, 2));
console.log(`wrote ${catalog.makes.length} makes to ${out}`);
if (failed.length) console.log(`failed sources: ${failed.join(', ')}`);
