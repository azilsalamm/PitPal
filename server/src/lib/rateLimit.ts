import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory per-IP rate limiter, keyed per route group.
 * Limit defaults to 30 requests per minute.
 */
export function rateLimit(group: string, limitPerMinute = 30) {
  const buckets = new Map<string, Bucket>();
  // periodic sweep so the map doesn't grow forever
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }, 60_000);
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${group}:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + 60_000 };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > limitPerMinute) {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests — try again shortly.' },
      });
      return;
    }
    next();
  };
}
