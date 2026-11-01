import { z } from 'zod';
import { VisionResult, type VisionResult as VisionResultT } from '@pitpal/shared';
import { getGeminiKey, getGeminiModel, getGeminiFallbackModels } from '../config.js';
import { fetchWithTimeout, FetchTimeoutError } from '../lib/fetchWithTimeout.js';
import { recordError } from '../lib/lastError.js';
import { ProviderError } from './geoapify.js';

const PROMPT = `Identify the vehicle's make, model and generation year range from visible exterior cues only (badges, body shape, lights, grille). Do not read licence plates or identify people. Do not infer condition, trim, fuel type, or an exact year. If the image is unclear or shows multiple vehicles, say so. Provide up to 3 suggestions, best first.`;

const GeminiResponse = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.object({ text: z.string().optional() })),
        }),
      }),
    )
    .optional(),
});

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    imageQuality: { type: 'string', enum: ['ok', 'unclear', 'no_vehicle'] },
    multipleVehicles: { type: 'boolean' },
    suggestions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          make: { type: 'string' },
          model: { type: 'string' },
          yearFrom: { type: 'integer', nullable: true },
          yearTo: { type: 'integer', nullable: true },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          note: { type: 'string' },
        },
        required: ['make', 'model', 'yearFrom', 'yearTo', 'confidence', 'note'],
      },
    },
  },
  required: ['imageQuality', 'multipleVehicles', 'suggestions'],
};

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Call Gemini with a JSON response schema, falling back across models on quota/overload. */
export async function generateJson(
  integration: string,
  parts: Part[],
  responseSchema: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<unknown> {
  const key = getGeminiKey();
  if (!key) {
    recordError(integration, 'NOT_CONFIGURED');
    throw new ProviderError('NOT_CONFIGURED', 'Gemini isn’t connected in this environment.', 503);
  }
  const models = [getGeminiModel(), ...getGeminiFallbackModels()].filter((m, i, a) => a.indexOf(m) === i);
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseSchema },
  };
  let res: Response | undefined;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      res = await fetchWithTimeout(
        url,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
        timeoutMs,
      );
    } catch (e) {
      if (e instanceof FetchTimeoutError) {
        recordError(integration, 'PROVIDER_TIMEOUT');
        throw new ProviderError('PROVIDER_TIMEOUT', 'The request timed out — please try again.', 504);
      }
      recordError(integration, 'PROVIDER_ERROR');
      throw new ProviderError('PROVIDER_ERROR', 'Gemini could not be reached.', 502);
    }
    if (res.status !== 429 && res.status !== 503 && res.status !== 404) break;
  }
  if (!res) {
    recordError(integration, 'NOT_CONFIGURED');
    throw new ProviderError('NOT_CONFIGURED', 'No Gemini model is configured.', 503);
  }
  if (res.status === 401 || res.status === 403) {
    recordError(integration, 'PROVIDER_AUTH');
    throw new ProviderError('PROVIDER_AUTH', 'Gemini credentials were rejected.', 502);
  }
  if (res.status === 429) {
    recordError(integration, 'PROVIDER_QUOTA');
    throw new ProviderError('PROVIDER_QUOTA', 'Gemini is rate-limited right now.', 429);
  }
  if (!res.ok) {
    recordError(integration, 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', `Gemini request failed (${res.status}).`, 502);
  }
  const json = GeminiResponse.parse(await res.json());
  const text = json.candidates?.[0]?.content.parts.find((p) => p.text)?.text;
  if (!text) {
    recordError(integration, 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'Gemini returned no result.', 502);
  }
  try {
    return JSON.parse(text);
  } catch {
    recordError(integration, 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'Gemini returned unreadable output.', 502);
  }
}

export async function identifyVehicle(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<VisionResultT> {
  const parsed = await generateJson(
    'gemini_vision',
    [{ text: PROMPT }, { inlineData: { mimeType, data: imageBase64 } }],
    RESPONSE_SCHEMA,
  );
  const result = VisionResult.safeParse(parsed);
  if (!result.success) {
    recordError('gemini_vision', 'PROVIDER_ERROR');
    throw new ProviderError('PROVIDER_ERROR', 'Identification returned unexpected output.', 502);
  }
  return result.data;
}
