import { describe, it, expect } from 'vitest';
import { formatCents, formatDate, formatDateTime } from '@/lib/utils/format';

/**
 * Test fixtures for Intl.NumberFormat output.
 *
 * The product spec calls for whole-euro display: the formatter
 * always passes `minimumFractionDigits: 0` and
 * `maximumFractionDigits: 0`, so neither locale shows `.00` /
 * `,00`. What still differs between EN and FR is the symbol
 * placement and the separator:
 *   - English ('en') places the € symbol BEFORE the number:
 *     "€35"
 *   - French ('fr') places the € symbol AFTER the number with
 *     a non-breaking space (U+00A0) between them: "35 €"
 *
 * Using the literal NBSP keeps the assertions faithful to what
 * the runtime actually produces (and what the user sees on the
 * page) instead of relying on a regex match that would silently
 * pass with either space character.
 */
const NBSP = ' ';

describe('formatCents', () => {
  it('renders €35 in English with no decimals (en + EUR + 3500)', () => {
    expect(formatCents(3500, 'EUR', 'en')).toBe('€35');
  });

  it('renders 35 € in French with no decimals (fr + EUR + 3500)', () => {
    expect(formatCents(3500, 'EUR', 'fr')).toBe(`35${NBSP}€`);
  });

  it('renders €299 in English with no decimals (en + EUR + 29900)', () => {
    expect(formatCents(29900, 'EUR', 'en')).toBe('€299');
  });

  it('renders 299 € in French with no decimals (fr + EUR + 29900)', () => {
    expect(formatCents(29900, 'EUR', 'fr')).toBe(`299${NBSP}€`);
  });

  it('renders €109 in English with no decimals (en + EUR + 10900)', () => {
    expect(formatCents(10900, 'EUR', 'en')).toBe('€109');
  });

  it('renders 109 € in French with no decimals (fr + EUR + 10900)', () => {
    expect(formatCents(10900, 'EUR', 'fr')).toBe(`109${NBSP}€`);
  });

  it('renders €0 / 0 € for the zero amount with no decimals', () => {
    expect(formatCents(0, 'EUR', 'en')).toBe('€0');
    expect(formatCents(0, 'EUR', 'fr')).toBe(`0${NBSP}€`);
  });

  it('rounds sub-euro amounts to the nearest whole euro (en + 199 → €2, fr + 199 → 2 €)', () => {
    // Sub-euro amounts are not part of the current product spec,
    // but the formatter must still produce a sane whole-euro
    // value rather than throwing or producing a malformed
    // string.
    expect(formatCents(199, 'EUR', 'en')).toBe('€2');
    expect(formatCents(199, 'EUR', 'fr')).toBe(`2${NBSP}€`);
  });

  it('rounds 4500 cents to €45 in both locales (regression guard for the legacy fixture)', () => {
    expect(formatCents(4500, 'EUR', 'en')).toBe('€45');
    expect(formatCents(4500, 'EUR', 'fr')).toBe(`45${NBSP}€`);
  });

  it('never produces a decimal separator in either locale (regression guard against the .00 / ,00 re-introduction)', () => {
    for (const cents of [3500, 29900, 10900, 0, 199, 4500, 12345, 9999, 1]) {
      const en = formatCents(cents, 'EUR', 'en');
      const fr = formatCents(cents, 'EUR', 'fr');
      expect(en, `en ${cents} → ${en} must not contain '.'`).not.toMatch(/\./);
      expect(fr, `fr ${cents} → ${fr} must not contain ','`).not.toMatch(/,/);
      expect(en, `en ${cents} → ${en} must contain €`).toContain('€');
      expect(fr, `fr ${cents} → ${fr} must contain €`).toContain('€');
    }
  });
});

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    expect(formatDate('2026-07-07T10:00:00.000Z', 'en').length).toBeGreaterThan(0);
    expect(formatDate('2026-07-07T10:00:00.000Z', 'fr').length).toBeGreaterThan(0);
  });
});

describe('formatDateTime', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    expect(formatDateTime('2026-07-07T10:00:00.000Z', 'en').length).toBeGreaterThan(0);
    expect(formatDateTime('2026-07-07T10:00:00.000Z', 'fr').length).toBeGreaterThan(0);
  });
});
