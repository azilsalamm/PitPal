import { z } from 'zod';
import type { GarageEnrichment } from '@pitpal/shared';
import { generateJson } from './gemini.js';
import { extractWebsite } from './contextdev.js';
import { getContextDevKey } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { recordError } from '../lib/lastError.js';
import { ProviderError } from './geoapify.js';

export const EstimateInput = z.object({
  garage: z.object({
    name: z.string().min(1),
    emirate: z.string(),
    area: z.string().nullable().optional(),
    website: z.string().url().nullable().optional(),
    listedServices: z.array(z.string()).optional().default([]),
  }),
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().optional().default(''),
    year: z.union([z.number(), z.string()]).nullable().optional(),
  }),
  job: z.object({
    category: z.string(),
    service: z.string(),
    description: z.string().optional().default(''),
  }),
});
export type EstimateInputT = z.infer<typeof EstimateInput>;

export const Estimate = z.object({
  summary: z.string(),
  items: z.array(
    z.object({
      item: z.string(),
      detail: z.string(),
      lowAed: z.number(),
      highAed: z.number(),
      basis: z.enum(['garage_website', 'uae_market_typical']),
    }),
  ),
  totalLowAed: z.number(),
  totalHighAed: z.number(),
  recommendedSpec: z.array(z.string()),
  questionsForGarage: z.array(z.string()),
  garageFitNotes: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type EstimateT = z.infer<typeof Estimate>;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          detail: { type: 'string' },
          lowAed: { type: 'number' },
          highAed: { type: 'number' },
          basis: { type: 'string', enum: ['garage_website', 'uae_market_typical'] },
        },
        required: ['item', 'detail', 'lowAed', 'highAed', 'basis'],
      },
    },
    totalLowAed: { type: 'number' },
    totalHighAed: { type: 'number' },
    recommendedSpec: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    questionsForGarage: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    garageFitNotes: { type: 'array', items: { type: 'string' }, maxItems: 4 },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'summary',
    'items',
    'totalLowAed',
    'totalHighAed',
    'recommendedSpec',
    'questionsForGarage',
    'garageFitNotes',
    'confidence',
  ],
};

const cache = new TtlCache<{ estimate: EstimateT; enrichment: GarageEnrichment | null }>(6 * 3600_000, 300);

function buildPrompt(input: EstimateInputT, enrichment: GarageEnrichment | null): string {
  const v = `${input.vehicle.make} ${input.vehicle.model}${input.vehicle.year ? ` (${input.vehicle.year})` : ''}`.trim();
  const job = `${input.job.service.replace(/_/g, ' ')}${input.job.description ? ` — "${input.job.description}"` : ''}`;
  const site = enrichment
    ? [
        `Facts extracted from the garage's own website (${enrichment.sourceUrl}):`,
        enrichment.services.length ? `- Services: ${enrichment.services.join(', ')}` : '',
        enrichment.makes.length ? `- Makes worked on: ${enrichment.makes.join(', ')}` : '',
        enrichment.publishedFees.length
          ? `- Published fees: ${enrichment.publishedFees
              .map((f) => `${f.service}${f.amountAed != null ? ` AED ${f.amountAed}` : ''}${f.scopeNote ? ` (${f.scopeNote})` : ''}`)
              .join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No garage website data is available; use typical UAE independent-garage market prices.';
  const listed = input.garage.listedServices.length
    ? `Directory-listed services (unverified): ${input.garage.listedServices.join(', ')}`
    : '';
  return [
    `You are PitPal, a UAE car-service assistant. Prepare an indicative cost estimate in AED for this job at an independent garage.`,
    `Garage: ${input.garage.name}, ${input.garage.area ?? ''} ${input.garage.emirate.replace(/_/g, ' ')}.`,
    listed,
    site,
    `Vehicle: ${v}.`,
    `Job requested: ${job}.`,
    `Rules:`,
    `- Itemise parts, consumables and labour. For each item give the specific spec that suits this exact vehicle (e.g. engine oil grade/viscosity and quality tier such as fully synthetic 5W-30 meeting the manufacturer approval, oil capacity in litres, filter type, brake pad material, coolant type). Include an "OEM vs quality aftermarket" option where relevant.`,
    `- Use the garage's published fee for an item when one exists and mark basis "garage_website"; otherwise use typical ${new Date().getFullYear()} UAE independent-garage prices (not dealer prices) and mark "uae_market_typical".`,
    `- Give realistic low/high ranges. Totals must equal the sums of item lows/highs.`,
    `- garageFitNotes: brief notes on how well this garage fits the job and car based ONLY on the facts above (say "not stated" rather than inventing).`,
    `- questionsForGarage: the questions the owner should confirm with the garage (warranty, oil brand, turnaround).`,
    `- If the job description is vague or the job is a diagnosis, estimate the diagnostic/inspection fee and say the repair cost depends on findings.`,
    `- Never claim the garage has confirmed anything. Plain text only, no markdown.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buildEstimate(
  input: EstimateInputT,
): Promise<{ estimate: EstimateT; enrichment: GarageEnrichment | null; generatedAt: string }> {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return { ...hit, generatedAt: new Date().toISOString() };

  let enrichment: GarageEnrichment | null = null;
  if (input.garage.website && getContextDevKey()) {
    try {
      enrichment = await extractWebsite(input.garage.website);
    } catch {
      enrichment = null; // website unreadable — fall back to market-typical pricing
    }
  }

  const raw = await generateJson('gemini_estimate', [{ text: buildPrompt(input, enrichment) }], RESPONSE_SCHEMA, 45_000);
  const parsed = Estimate.safeParse(raw);
  if (!parsed.success) {
    recordError('gemini_estimate', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'The estimate came back in an unexpected shape.', 502);
  }
  const result = { estimate: parsed.data, enrichment };
  cache.set(key, result);
  return { ...result, generatedAt: new Date().toISOString() };
}
