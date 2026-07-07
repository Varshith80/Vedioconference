/**
 * Simple in-memory token-bucket rate limiter, scoped to a key
 * (typically an IP address). Suitable for Vercel's single-region
 * serverless functions. Replaced by Upstash Redis in Phase 5.
 *
 * Capacity: 5 requests / windowMs. Default window = 1 hour.
 *
 * NOTE: This is per-process. Vercel serverless functions are
 * stateless across cold starts, so a brand-new instance will
 * accept new traffic. Acceptable for a low-volume contact form;
 * the contact form is not a critical booking path.
 */

const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export interface RateLimitConfig {
  /** Max tokens in the bucket. */
  capacity: number;
  /** Window in milliseconds. Tokens refill linearly over the window. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until a token is available. 0 if allowed. */
  retryAfterSec: number;
}

const DEFAULT: RateLimitConfig = { capacity: 5, windowMs: 60 * 60 * 1000 };

export function rateLimit(key: string, cfg: RateLimitConfig = DEFAULT): RateLimitResult {
  const now = Date.now();
  const refillPerMs = cfg.capacity / cfg.windowMs;
  const existing = buckets.get(key);

  if (!existing) {
    buckets.set(key, { tokens: cfg.capacity - 1, updatedAt: now });
    return { allowed: true, remaining: cfg.capacity - 1, retryAfterSec: 0 };
  }

  // Refill: time elapsed × tokens/ms.
  const elapsed = now - existing.updatedAt;
  const refilled = Math.min(cfg.capacity, existing.tokens + elapsed * refillPerMs);

  if (refilled < 1) {
    const need = 1 - refilled;
    const retryMs = need / refillPerMs;
    existing.tokens = refilled;
    existing.updatedAt = now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil(retryMs / 1000),
    };
  }

  const next = refilled - 1;
  buckets.set(key, { tokens: next, updatedAt: now });
  return { allowed: true, remaining: Math.floor(next), retryAfterSec: 0 };
}

/** For tests: reset the bucket for a key (or all keys). */
export function __resetRateLimit(key?: string): void {
  if (key === undefined) buckets.clear();
  else buckets.delete(key);
}
