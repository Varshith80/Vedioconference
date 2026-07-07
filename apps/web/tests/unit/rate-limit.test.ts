import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, __resetRateLimit } from '@/lib/utils/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    __resetRateLimit();
  });

  it('allows the first request for a key', () => {
    const r = rateLimit('test:1', { capacity: 5, windowMs: 60_000 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it('blocks after the capacity is exhausted', () => {
    const cfg = { capacity: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const r = rateLimit('test:2', cfg);
      expect(r.allowed).toBe(true);
    }
    const blocked = rateLimit('test:2', cfg);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('isolates keys', () => {
    const cfg = { capacity: 1, windowMs: 60_000 };
    expect(rateLimit('ip-a', cfg).allowed).toBe(true);
    expect(rateLimit('ip-a', cfg).allowed).toBe(false);
    expect(rateLimit('ip-b', cfg).allowed).toBe(true);
  });
});
