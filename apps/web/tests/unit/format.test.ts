import { describe, it, expect } from 'vitest';
import { formatCents, formatDate, formatDateTime } from '@/lib/utils/format';

describe('formatCents', () => {
  it('formats integer cents as a localized currency string', () => {
    expect(formatCents(4500, 'EUR')).toMatch(/45,00/);
    expect(formatCents(0, 'EUR')).toMatch(/0,00/);
    expect(formatCents(199, 'EUR')).toMatch(/1,99/);
  });
});

describe('formatDate', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    expect(formatDate('2026-07-07T10:00:00.000Z').length).toBeGreaterThan(0);
  });
});

describe('formatDateTime', () => {
  it('returns a non-empty string for a valid ISO date', () => {
    expect(formatDateTime('2026-07-07T10:00:00.000Z').length).toBeGreaterThan(0);
  });
});
