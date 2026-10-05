import "server-only";

// Fixed-window limiter. The interface is storage-agnostic so a Redis-backed
// implementation can replace the in-memory one for multi-instance deployments.
export interface RateLimiter {
  hit(key: string): { allowed: boolean; remaining: number; resetAt: number };
}

export function createMemoryRateLimiter(opts: { limit: number; windowMs: number }): RateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    hit(key) {
      const now = Date.now();
      let b = buckets.get(key);
      if (!b || b.resetAt <= now) {
        b = { count: 0, resetAt: now + opts.windowMs };
        buckets.set(key, b);
        if (buckets.size > 10_000) {
          for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
        }
      }
      b.count += 1;
      return { allowed: b.count <= opts.limit, remaining: Math.max(0, opts.limit - b.count), resetAt: b.resetAt };
    },
  };
}

const g = globalThis as unknown as { __pccLimiters?: Record<string, RateLimiter> };
g.__pccLimiters ??= {};

/** 10 auth attempts per 15 minutes per IP+email. */
export const authLimiter = (g.__pccLimiters.auth ??= createMemoryRateLimiter({ limit: 10, windowMs: 15 * 60_000 }));
/** 300 API requests per minute per session. */
export const apiLimiter = (g.__pccLimiters.api ??= createMemoryRateLimiter({ limit: 300, windowMs: 60_000 }));
