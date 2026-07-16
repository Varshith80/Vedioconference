import { describe, it, expect } from 'vitest';
import { localizedTitle, localizedTitles } from '@/lib/i18n/localized-title';

describe('localizedTitle', () => {
  it('returns the FR title from metadata when present', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { titles: { fr: { title: 'MATHÉMATIQUES' } } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHÉMATIQUES');
  });

  it('returns the EN title from metadata when present', () => {
    const row = {
      title: 'MATHEMATIQUES',
      metadata: { titles: { en: { title: 'MATHEMATICS' } } },
    };
    expect(localizedTitle(row, 'en')).toBe('MATHEMATICS');
  });

  it('falls back to row.title when the locale has no metadata entry', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { titles: { en: { title: 'Mathematics' } } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('falls back to row.title when metadata is null', () => {
    const row = { title: 'MATHEMATICS', metadata: null };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('falls back to row.title when metadata is undefined', () => {
    const row = { title: 'MATHEMATICS' };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('falls back to row.title when metadata.titles is empty', () => {
    const row = { title: 'MATHEMATICS', metadata: { titles: {} } };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('falls back to row.title when the locale entry has an empty title', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { titles: { fr: { title: '' } } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('returns an empty string when the row is null', () => {
    expect(localizedTitle(null, 'fr')).toBe('');
  });

  it('returns an empty string when the row is undefined', () => {
    expect(localizedTitle(undefined, 'fr')).toBe('');
  });

  it('does not throw when metadata is a foreign shape (e.g. wrong keys)', () => {
    // The runtime types `metadata` as `Record<string, unknown> | null`,
    // so the helper must tolerate foreign JSON shapes that may
    // exist in the wild (e.g. legacy rows from before the import).
    const row = {
      title: 'MATHEMATICS',
      metadata: { legacy_field: 'whatever' },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('does not throw when the locale entry is missing a title field', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { titles: { fr: { slug: 'maths-lycee' } } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  // --- Legacy metadata[locale].title path -----------------------
  // The pre-v2.0 importer (CJS prototype) wrote FR titles at
  // metadata.fr.title instead of metadata.titles.fr.title. The
  // runtime helper must still render the FR string for these
  // historical rows until the data is re-imported under the
  // canonical key.

  it('falls back to metadata.fr.title (legacy path) for FR locale', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { fr: { title: 'MATHÉMATIQUES', slug: 'maths-lycee' } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHÉMATIQUES');
  });

  it('falls back to metadata.fr.title even when metadata.titles is empty', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { titles: {}, fr: { title: 'MATHÉMATIQUES' } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHÉMATIQUES');
  });

  it('prefers the canonical path when both metadata.titles.fr and metadata.fr exist', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: {
        titles: { fr: { title: 'CANONICAL' } },
        fr: { title: 'LEGACY' },
      },
    };
    expect(localizedTitle(row, 'fr')).toBe('CANONICAL');
  });

  it('falls through to row.title when the legacy entry has an empty title', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { fr: { title: '' } },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });

  it('does not throw when metadata.fr is not an object', () => {
    const row = {
      title: 'MATHEMATICS',
      metadata: { fr: 'not-an-object' },
    };
    expect(localizedTitle(row, 'fr')).toBe('MATHEMATICS');
  });
});

describe('localizedTitles', () => {
  it('returns one title per row, in order', () => {
    const rows = [
      { title: 'A', metadata: { titles: { fr: { title: 'a-fr' } } } },
      { title: 'B', metadata: { titles: { fr: { title: 'b-fr' } } } },
      { title: 'C' },
    ];
    expect(localizedTitles(rows, 'fr')).toEqual(['a-fr', 'b-fr', 'C']);
  });

  it('returns an empty array for an empty input', () => {
    expect(localizedTitles([], 'fr')).toEqual([]);
  });
});
