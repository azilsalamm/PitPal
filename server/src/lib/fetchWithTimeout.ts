export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request to ${new URL(url).hostname} timed out after ${ms} ms`);
    this.name = 'FetchTimeoutError';
  }
}

async function doFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** fetch with a timeout and one retry on timeout, network error or 5xx. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  try {
    const res = await doFetch(url, init, timeoutMs);
    if (res.status >= 500) {
      // one retry on 5xx
      return await doFetch(url, init, timeoutMs);
    }
    return res;
  } catch (e) {
    if (e instanceof FetchTimeoutError || e instanceof TypeError) {
      // retry once on timeout / network failure
      return await doFetch(url, init, timeoutMs);
    }
    throw e;
  }
}
