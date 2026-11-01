import { z } from 'zod';
import { generateJson } from './gemini.js';
import { TtlCache } from '../lib/cache.js';
import { recordError } from '../lib/lastError.js';
import { ProviderError } from './geoapify.js';

export const ReviewInput = z.object({
  vehicle: z.object({
    make: z.string().min(1),
    model: z.string().optional().default(''),
    year: z.union([z.number(), z.string()]).nullable().optional(),
  }),
  job: z.object({
    service: z.string(),
    description: z.string().optional().default(''),
  }),
  garages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        address: z.string().nullable().optional(),
        website: z.string().nullable().optional(),
        listedServices: z.array(z.string()).optional().default([]),
        openingHours: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type ReviewInputT = z.infer<typeof ReviewInput>;

export const GarageReview = z.object({
  id: z.string(),
  fit: z.enum(['strong', 'good', 'possible', 'unclear']),
  review: z.string(),
  bestFor: z.string(),
});
export type GarageReviewT = z.infer<typeof GarageReview>;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fit: { type: 'string', enum: ['strong', 'good', 'possible', 'unclear'] },
          review: { type: 'string' },
          bestFor: { type: 'string' },
        },
        required: ['id', 'fit', 'review', 'bestFor'],
      },
    },
  },
  required: ['reviews'],
};

const cache = new TtlCache<GarageReviewT>(6 * 3600_000, 2000);

function prompt(input: ReviewInputT, garages: ReviewInputT['garages']): string {
  const v = `${input.vehicle.make} ${input.vehicle.model}${input.vehicle.year ? ` (${input.vehicle.year})` : ''}`.trim();
  const list = garages
    .map((g) =>
      [
        `id=${g.id} | name: ${g.name}`,
        g.address ? `address: ${g.address}` : '',
        g.website ? `website: ${g.website}` : '',
        g.listedServices.length ? `directory-listed services (unverified): ${g.listedServices.join(', ')}` : '',
        g.openingHours ? `hours: ${g.openingHours}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
  return [
    `You are PitPal, a UAE car-service advisor. For each garage below, write a 1–2 sentence review of why (or why not) it suits this owner.`,
    `Owner's car: ${v}. Job: ${input.job.service.replace(/_/g, ' ')}${input.job.description ? ` — "${input.job.description}"` : ''}.`,
    `Use ONLY the facts given: the garage's name (e.g. brand names, "German", "Japanese", "lube", "tyres", "body shop", "quick service" hint at specialism), its listed services, website domain, hours and location. Do not invent ratings, prices, staff, awards or experience.`,
    `fit: "strong" = name/services directly match this car brand or this job; "good" = general mechanical workshop likely to do this job; "possible" = might do it but focus seems different (e.g. body shop, tyres only); "unclear" = nothing indicates suitability. Say plainly when suitability is unclear and to confirm by phone.`,
    `bestFor: 3–6 words on what the garage seems best at. Plain text, no markdown. Return one entry per id, same ids.`,
    `Garages:`,
    list,
  ].join('\n');
}

export async function reviewGarages(input: ReviewInputT): Promise<GarageReviewT[]> {
  const ctxKey = JSON.stringify([input.vehicle, input.job]);
  const keyFor = (g: ReviewInputT['garages'][number]) => `${ctxKey}|${JSON.stringify(g)}`;
  const out: GarageReviewT[] = [];
  const pending: ReviewInputT['garages'] = [];
  for (const g of input.garages) {
    const hit = cache.get(keyFor(g));
    if (hit) out.push(hit);
    else pending.push(g);
  }
  if (pending.length) {
    const raw = await generateJson('gemini_review', [{ text: prompt(input, pending) }], RESPONSE_SCHEMA, 40_000);
    const parsed = z.object({ reviews: z.array(GarageReview) }).safeParse(raw);
    if (!parsed.success) {
      recordError('gemini_review', 'PROVIDER_ERROR');
      throw new ProviderError('PROVIDER_ERROR', 'Garage reviews came back in an unexpected shape.', 502);
    }
    const ids = new Set(pending.map((g) => g.id));
    for (const r of parsed.data.reviews) {
      if (!ids.has(r.id)) continue;
      const g = pending.find((p) => p.id === r.id)!;
      cache.set(keyFor(g), r);
      out.push(r);
    }
  }
  return out;
}
