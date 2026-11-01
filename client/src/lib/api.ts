export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json();
    if (body?.error?.code) {
      return new ApiError(body.error.code, body.error.message ?? res.statusText, res.status);
    }
  } catch {
    /* not JSON */
  }
  return new ApiError(
    res.status === 404 ? 'NOT_FOUND' : 'PROVIDER_ERROR',
    res.status === 404
      ? 'This service is not available in this environment.'
      : `Request failed (${res.status})`,
    res.status,
  );
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the PitPal server.');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

export async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the PitPal server.');
  }
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}
