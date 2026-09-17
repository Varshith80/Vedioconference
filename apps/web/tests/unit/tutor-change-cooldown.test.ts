import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 6.5 — Feature G cooldown pure-helper tests.
//
// These pin the behaviour of the helpers in
// `apps/web/lib/tutor-change-cooldown-helpers.ts` (mirrored by the
// server-only service module). The service module re-exports them,
// so server-side callers test the same functions. Client-side
// callers (the tutor-change form) import them directly from the
// helpers module to avoid pulling in `server-only`.
//
// These tests must NOT mock the cooldown mechanism — they exercise
// real date arithmetic and real formatting.
// =====================================================================

import {
  COOLDOWN_HOURS_MS,
  formatCooldownRemaining,
  isInCooldown,
  nextEligibleAt,
} from '@/lib/tutor-change-cooldown-helpers';

describe('Sprint 6.5 — cooldown pure helpers', () => {
  describe('COOLDOWN_HOURS_MS', () => {
    it('equals 24 hours in ms', () => {
      expect(COOLDOWN_HOURS_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('isInCooldown', () => {
    it('returns false when lastChangedAt is null', () => {
      expect(isInCooldown(null)).toBe(false);
    });

    it('returns true when lastChangedAt is within the last 24 hours', () => {
      const now = new Date('2026-09-15T12:00:00Z');
      const last = new Date('2026-09-15T11:00:00Z');
      expect(isInCooldown(last, now)).toBe(true);
    });

    it('returns false when lastChangedAt is exactly 24 hours ago', () => {
      const now = new Date('2026-09-15T12:00:00Z');
      const last = new Date(now.getTime() - COOLDOWN_HOURS_MS);
      expect(isInCooldown(last, now)).toBe(false);
    });

    it('returns false when lastChangedAt is older than 24 hours', () => {
      const now = new Date('2026-09-15T12:00:00Z');
      const last = new Date('2026-09-14T11:00:00Z');
      expect(isInCooldown(last, now)).toBe(false);
    });

    it('accepts an ISO string', () => {
      const now = new Date('2026-09-15T12:00:00Z');
      expect(isInCooldown('2026-09-15T11:00:00Z', now)).toBe(true);
    });
  });

  describe('nextEligibleAt', () => {
    it('returns a Date 24h after the input', () => {
      const last = new Date('2026-09-15T12:00:00Z');
      const expected = new Date('2026-09-16T12:00:00Z');
      expect(nextEligibleAt(last).toISOString()).toBe(expected.toISOString());
    });

    it('accepts an ISO string', () => {
      const expected = new Date('2026-09-16T12:00:00.000Z');
      expect(nextEligibleAt('2026-09-15T12:00:00Z').toISOString()).toBe(expected.toISOString());
    });

    it('throws on invalid input', () => {
      expect(() => nextEligibleAt(new Date('not-a-date'))).toThrow();
    });
  });

  describe('formatCooldownRemaining', () => {
    it('formats minutes under an hour', () => {
      expect(formatCooldownRemaining(5 * 60_000, 'en')).toBe('5 min');
      expect(formatCooldownRemaining(5 * 60_000, 'fr')).toBe('5 min');
    });

    it('formats exact hours', () => {
      expect(formatCooldownRemaining(60 * 60_000, 'en')).toBe('1 h');
      expect(formatCooldownRemaining(60 * 60_000, 'fr')).toBe('1 h');
    });

    it('formats hours + minutes', () => {
      expect(formatCooldownRemaining(90 * 60_000, 'en')).toBe('1 h 30 min');
      expect(formatCooldownRemaining(90 * 60_000, 'fr')).toBe('1 h 30 min');
    });

    it('formats exact days', () => {
      expect(formatCooldownRemaining(48 * 60 * 60_000, 'en')).toBe('2 d');
      expect(formatCooldownRemaining(48 * 60 * 60_000, 'fr')).toBe('2 j');
    });

    it('formats days + hours', () => {
      expect(formatCooldownRemaining(50 * 60 * 60_000, 'en')).toBe('2 d 2 h');
      expect(formatCooldownRemaining(50 * 60 * 60_000, 'fr')).toBe('2 j 2 h');
    });

    it('rounds up so a non-zero remaining never shows 0 min', () => {
      // 30 seconds remaining should display as "1 min"
      expect(formatCooldownRemaining(30_000, 'en')).toBe('1 min');
      expect(formatCooldownRemaining(30_000, 'fr')).toBe('1 min');
    });

    it('clamps a zero-or-negative remaining to "1 min" rather than "0 min"', () => {
      expect(formatCooldownRemaining(0, 'en')).toBe('1 min');
      expect(formatCooldownRemaining(-1000, 'en')).toBe('1 min');
    });

    it('uses French day-unit ("j") not English ("d")', () => {
      expect(formatCooldownRemaining(24 * 60 * 60_000, 'fr')).toMatch(/j/);
    });
  });
});
