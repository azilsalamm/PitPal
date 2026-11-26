export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request to ${new URL(url).hostname} timed out after ${ms} ms`);
    this.name = 'FetchTimeoutError';
  }
}

async function doFetch<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (response: Response) => T | Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await read(await fetch(url, { ...init, signal: ctrl.signal }));
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
  const attempt = () => doFetch(url, init, timeoutMs, (response) => response);
  try {
    const res = await attempt();
    if (res.status >= 500) {
      // one retry on 5xx
      return await attempt();
    }
    return res;
  } catch (e) {
    if (e instanceof FetchTimeoutError || e instanceof TypeError) {
      // retry once on timeout / network failure
      return await attempt();
    }
    throw e;
  }
}

const MIN_ATTEMPT_MS = 1_000;

export async function fetchJsonWithDeadline(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  deadline: number,
): Promise<{ status: number; ok: boolean; data: unknown }> {
  const attempt = () => {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw new FetchTimeoutError(url, Math.max(0, remaining));
    return doFetch(url, init, Math.min(timeoutMs, remaining), async (res) => ({
      status: res.status,
      ok: res.ok,
      data: res.ok ? await res.json() : undefined,
    }));
  };
  let res: Awaited<ReturnType<typeof attempt>>;
  try {
    res = await attempt();
  } catch (e) {
    if (e instanceof FetchTimeoutError || e instanceof TypeError) return attempt();
    throw e;
  }
  return res.status >= 500 ? attempt() : res;
}
