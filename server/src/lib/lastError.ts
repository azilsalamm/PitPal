/** Remembers the last error class per integration for /api/integrations/status. Never stores secrets. */
const lastErrors = new Map<string, string>();

export function recordError(integration: string, code: string): void {
  lastErrors.set(integration, code);
}

export function lastError(integration: string): string | undefined {
  return lastErrors.get(integration);
}
