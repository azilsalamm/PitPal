// Integration keys. Never log these values.
// Precedence for Geoapify: lowercase geoapify_api_key wins over GEOAPIFY_API_KEY.

export function getGeoapifyKey(): string | undefined {
  return process.env.geoapify_api_key ?? process.env.GEOAPIFY_API_KEY;
}

export function getGeminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';
}

export function getGeminiFallbackModels(): string[] {
  const raw = process.env.GEMINI_FALLBACK_MODELS ?? 'gemini-3.7-flash,gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite';
  return raw.split(',').map((m) => m.trim()).filter(Boolean);
}

export function getContextDevKey(): string | undefined {
  return process.env.CONTEXT_DEV_API_KEY;
}
