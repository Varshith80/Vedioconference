import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 6 — SLA helpers in services/student/tutor-change.ts.
//
// Pure functions:
//   - computeSlaDeadline(requestedAtIso): returns ISO 24h later.
//   - computeOverdue(status, slaDeadline): returns boolean.
//
// We do NOT exercise the service's Supabase roundtrips here —
// those live in route-level integration tests.
// =====================================================================

const { computeSlaDeadline, computeOverdue } = await import(
  '@/services/student/tutor-change'
);

describe('computeSlaDeadline', () => {
  it('returns an ISO exactly 24h after the input', () => {
    const input = '2026-08-01T10:00:00.000Z';
    const out = computeSlaDeadline(input);
    const diff = new Date(out).getTime() - new Date(input).getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('handles timezone offset correctly (UTC round-trip)', () => {
    const input = '2026-01-15T22:00:00Z';
    const out = computeSlaDeadline(input);
    expect(new Date(out).toISOString()).toBe('2026-01-16T22:00:00.000Z');
  });

  it('rejects an invalid input', () => {
    expect(() => computeSlaDeadline('not-a-date')).toThrow();
  });
});

describe('computeOverdue', () => {
  it('returns true for a pending request whose SLA is in the past', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    expect(computeOverdue('pending', past)).toBe(true);
  });

  it('returns false for a pending request whose SLA is in the future', () => {
    const future = new Date(Date.now() + 60 * 1000).toISOString();
    expect(computeOverdue('pending', future)).toBe(false);
  });

  it('returns false for a non-pending status even if SLA is in the past', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    expect(computeOverdue('completed', past)).toBe(false);
    expect(computeOverdue('cancelled', past)).toBe(false);
    expect(computeOverdue('alternatives_proposed', past)).toBe(false);
  });

  it('returns false for an invalid date', () => {
    expect(computeOverdue('pending', 'not-a-date')).toBe(false);
  });
});
