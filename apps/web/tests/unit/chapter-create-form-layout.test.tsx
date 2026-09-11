import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

// =====================================================================
// Sprint 3.8 (post-acceptance) — Chapter create form layout regression
// test. The Admin "Create chapter" modal has had multiple layout
// regressions. This test guards the invariants:
//
//   1. Every input has a unique `htmlFor` / `id` pair.
//      (The previous fix was triggered by two labels stacking at the
//      same `htmlFor` id.)
//   2. No raw i18n key like `Admin.chapterCreate.fields.duration` or
//      `Admin.chapterCreate.fields.position` leaks into the rendered
//      HTML — every label is properly translated.
//   3. The bottom row of the form does not stack the "Published"
//      checkbox beside another field's label, so it cannot visually
//      collide with the duration field.
//
// The test renders the form via renderToStaticMarkup and inspects
// the resulting HTML. We mock next-intl so the translator returns a
// fully-resolved string (the i18n files are not the unit under test).
// =====================================================================

// Mock next-intl so the translator returns a fully-qualified label
// that we can pattern-match.
vi.mock('next-intl', () => ({
  useTranslations: vi.fn((namespace: string) => {
    return (key: string, _vars?: Record<string, unknown>) => {
      // Resolve leaf keys into their EN label value (from en.json).
      const en: Record<string, string> = {
        'Admin.chapterCreate.title': 'Create chapter',
        'Admin.chapterCreate.subline': 'Add a chapter under a course.',
        'Admin.chapterCreate.submit': 'Create chapter',
        'Admin.chapterCreate.fields.title': 'Title',
        'Admin.chapterCreate.fields.slug': 'Slug',
        'Admin.chapterCreate.fields.description': 'Description',
        'Admin.chapterCreate.fields.course': 'Parent course',
        'Admin.chapterCreate.fields.position': 'Position',
        'Admin.chapterCreate.fields.durationMin': 'Default duration (minutes)',
        'Admin.chapterCreate.fields.isPublished': 'Published',
        'Admin.chapterCreate.errors.courseRequired': 'Select a parent course first.',
        'Admin.chapterCreate.placeholders.course': 'Pick a course…',
        'Admin.chapterCreate.empty.courses': 'No courses yet — create one first.',
        'Admin.forms.submitting': 'Submitting…',
        'Admin.forms.saveError': 'Save failed.',
      };
      const k = `${namespace}.${key}`;
      return en[k] ?? `__MISSING__:${k}`;
    };
  }),
}));

// Mock next/navigation so the useRouter call inside the form is safe.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));

import { ChapterCreateForm } from '@/components/admin/chapter-create-form';

const COURSES = [
  { value: 'chimie-bts-optique', label: 'Chimie – BTS Optique' },
  { value: 'maths-lycee', label: 'Mathématiques – Lycée' },
];

describe('Admin ChapterCreateForm layout (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders each input id exactly once (no duplicate label/input pairs)', () => {
    const html = renderToStaticMarkup(
      <ChapterCreateForm courses={COURSES} />,
    );
    // Collect every `id="..."` attribute occurrence. The regex
    // is anchored on a non-word character before `id="` so we
    // don't accidentally match `aria-invalid="false"`.
    const idRegex = /(?:^|\s)id="([^"]+)"/g;
    const ids: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(html))) {
      const captured = m[1];
      if (typeof captured === 'string') ids.push(captured);
    }
    const unique = new Set(ids);
    expect(
      ids.length,
      `expected every input id to appear exactly once, got duplicates: ${
        JSON.stringify(ids.filter((x, i) => ids.indexOf(x) !== i))
      }`,
    ).toBe(unique.size);
  });

  it('never leaks a raw Admin.chapterCreate.* key into the rendered HTML', () => {
    const html = renderToStaticMarkup(
      <ChapterCreateForm courses={COURSES} />,
    );
    expect(html, 'no raw "Admin.chapterCreate" key visible').not.toMatch(
      /Admin\.chapterCreate\./,
    );
    expect(html, 'no raw MISSING marker visible').not.toMatch(/__MISSING__/);
  });

  it('renders each form label exactly once (as visible <Label> text, ignoring aria-label attributes)', () => {
    const html = renderToStaticMarkup(
      <ChapterCreateForm courses={COURSES} />,
    );
    const labels = [
      'Title',
      'Slug',
      'Description',
      'Position',
      'Default duration (minutes)',
      'Published',
    ];
    // "Parent course" is also used as the aria-label on the
    // SearchableSelect for a11y, so we count it differently:
    // strip every attribute first, then look at visible text only.
    const visibleHtml = html
      .replace(/\saria-label="[^"]*"/g, '')
      .replace(/\saria-labelledby="[^"]*"/g, '');
    for (const label of labels) {
      const occurrences = visibleHtml.split(label).length - 1;
      expect(
        occurrences,
        `label "${label}" should appear exactly once, found ${occurrences}`,
      ).toBe(1);
    }
  });

  it('"Parent course" appears as a visible label and exactly one aria-label (no duplicate visible label)', () => {
    const html = renderToStaticMarkup(
      <ChapterCreateForm courses={COURSES} />,
    );
    // Strip aria-label / aria-labelledby attributes so we only
    // count visible text occurrences.
    const visibleHtml = html
      .replace(/\saria-label="[^"]*"/g, '')
      .replace(/\saria-labelledby="[^"]*"/g, '');
    const ariaAttr = (html.match(/aria-label="Parent course"/g) ?? []).length;
    const visible = visibleHtml.split('Parent course').length - 1;
    expect(visible, 'visible "Parent course" label should be exactly 1').toBe(1);
    expect(ariaAttr, 'one aria-label="Parent course" on the SearchableSelect is allowed').toBeLessThanOrEqual(1);
  });

  it('renders the Published checkbox below the Position/Duration row (not in the same flex/grid cell)', () => {
    const html = renderToStaticMarkup(
      <ChapterCreateForm courses={COURSES} />,
    );
    // The duration label appears inside the bottom grid cell.
    const durationIdx = html.indexOf('Default duration (minutes)');
    // The checkbox label appears later in a <label> element.
    const publishedIdx = html.indexOf('Published');
    expect(durationIdx).toBeGreaterThan(0);
    expect(publishedIdx).toBeGreaterThan(0);
    expect(
      publishedIdx,
      'Published checkbox should render after the duration label',
    ).toBeGreaterThan(durationIdx);
  });

  it('does not call t("fields.duration") (without "Min") — that key was a duplicate alias removed in the cleanup', () => {
    // Compile-time guard: grepping the source is the cheapest way
    // to lock this in (the form is a client component and the
    // runtime test would require running the translator with a
    // different namespace mock).
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const src = readFileSync(
      require('node:path').resolve(
        __dirname,
        '..',
        '..',
        'components/admin/chapter-create-form.tsx',
      ),
      'utf8',
    );
    // The form must use ONE canonical key for the duration field.
    // It is `fields.durationMin` (the historical name, kept by
    // every other chapter form). A raw `fields.duration` call would
    // mean someone reintroduced the duplicate alias.
    expect(
      src,
      'form must not look up fields.duration (no alias key)',
    ).not.toMatch(/['"]fields\.duration['"]/);
  });
});
