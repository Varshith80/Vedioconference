import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 7 — Pure-helper tests for services/notifications.ts.
// The Supabase roundtrips live in route-level integration tests.
// =====================================================================

const { formatRelativeTime } = await import('@/services/notifications');

const NOW = new Date('2026-08-27T12:00:00.000Z').getTime();

function iso(msAgo: number): string {
  return new Date(NOW - msAgo).toISOString();
}

describe('formatRelativeTime', () => {
  it('returns "just now" for a future timestamp (clock skew defence)', () => {
    expect(formatRelativeTime('2026-08-27T13:00:00.000Z', NOW, 'en')).toBe(
      'just now',
    );
  });

  it('returns "just now" only when the timestamp is exactly now or in the future', () => {
    // Sub-second offsets are clamped to 0 by Math.round.
    expect(formatRelativeTime(iso(0), NOW, 'en')).toBe('just now');
  });

  it('returns seconds plural for 1..59 seconds', () => {
    expect(formatRelativeTime(iso(5_000), NOW, 'en')).toBe('5 seconds ago');
    expect(formatRelativeTime(iso(30_000), NOW, 'en')).toBe('30 seconds ago');
  });

  it('returns minutes singular for exactly 1 minute', () => {
    expect(formatRelativeTime(iso(60_000), NOW, 'en')).toBe('1 minute ago');
  });

  it('returns minutes plural for several minutes', () => {
    expect(formatRelativeTime(iso(15 * 60_000), NOW, 'en')).toBe(
      '15 minutes ago',
    );
  });

  it('returns hours plural', () => {
    expect(formatRelativeTime(iso(3 * 60 * 60_000), NOW, 'en')).toBe(
      '3 hours ago',
    );
  });

  it('returns days plural', () => {
    expect(formatRelativeTime(iso(2 * 24 * 60 * 60_000), NOW, 'en')).toBe(
      '2 days ago',
    );
  });

  it('returns weeks plural', () => {
    expect(formatRelativeTime(iso(3 * 7 * 24 * 60 * 60_000), NOW, 'en')).toBe(
      '3 weeks ago',
    );
  });

  it('returns the original string when the input is unparseable', () => {
    expect(formatRelativeTime('garbage', NOW, 'en')).toBe('garbage');
  });

  it('renders the FR string for the same delta', () => {
    expect(formatRelativeTime(iso(15 * 60_000), NOW, 'fr')).toBe(
      'il y a 15 minutes',
    );
  });

  it('renders FR singular for exactly 1 minute', () => {
    expect(formatRelativeTime(iso(60_000), NOW, 'fr')).toBe('il y a 1 minute');
  });
});
