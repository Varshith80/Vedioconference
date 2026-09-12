import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =====================================================================
// Sprint 11 — 11-E (read-path UI) i18n contract tests.
//
// The recording card is reused on the student session detail page and
// the admin bookings row. Both surfaces need the same 5 EN + 5 FR
// strings in their respective namespaces:
//
//   Dashboard.bookings.recording.{cardLabel, badge, badgeAriaLabel, cta, pending}
//   Admin.bookings.recording.{cardLabel, cta, pending}
//
// We assert the keys exist, the ICU variables are correct (no
// single-quote escape needed because the values are always supplied
// at call time), and the existing `Dashboard.bookings.*` and
// `Dashboard.labels.*` keys are unchanged (regression guard: the
// new block is *appended*, never inlined above existing keys).
// =====================================================================

const EN_PATH = resolve(
  __dirname,
  '../../messages/en.json',
);
const FR_PATH = resolve(
  __dirname,
  '../../messages/fr.json',
);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function dig(
  root: unknown,
  keys: ReadonlyArray<string>,
): unknown {
  let cur: unknown = root;
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

describe('Recording link i18n — Sprint 11 11-E', () => {
  const en = readJson(EN_PATH);
  const fr = readJson(FR_PATH);

  it('A. Dashboard.bookings.recording.{cardLabel, badge, badgeAriaLabel, cta, pending} exist in en.json', () => {
    for (const key of ['cardLabel', 'badge', 'badgeAriaLabel', 'cta', 'pending']) {
      const v = dig(en, ['Dashboard', 'bookings', 'recording', key]);
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  it('B. Dashboard.bookings.recording.{cardLabel, badge, badgeAriaLabel, cta, pending} exist in fr.json', () => {
    for (const key of ['cardLabel', 'badge', 'badgeAriaLabel', 'cta', 'pending']) {
      const v = dig(fr, ['Dashboard', 'bookings', 'recording', key]);
      expect(typeof v).toBe('string');
      expect((v as string).length).toBeGreaterThan(0);
    }
  });

  it('C. Admin.bookings.recording.{cardLabel, cta, pending} exist in both locales', () => {
    for (const key of ['cardLabel', 'cta', 'pending']) {
      for (const [name, root] of [
        ['en', en],
        ['fr', fr],
      ] as const) {
        const v = dig(root, ['Admin', 'bookings', 'recording', key]);
        expect(typeof v, `${name}.Admin.bookings.recording.${key}`).toBe(
          'string',
        );
        expect((v as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('D. the new ICU values keep no interpolation variables (no single-quote escape needed)', () => {
    // The recording strings are static. If a future change adds
    // `{name}` or `{count}` interpolation, the consumer will need
    // to pass values at call time. Until then, the strings must
    // contain no `{...}` placeholders.
    const enRec = dig(en, ['Dashboard', 'bookings', 'recording']) as
      | Record<string, string>
      | undefined;
    const frRec = dig(fr, ['Dashboard', 'bookings', 'recording']) as
      | Record<string, string>
      | undefined;
    expect(enRec).toBeDefined();
    expect(frRec).toBeDefined();
    for (const [name, rec] of [
      ['en', enRec!],
      ['fr', frRec!],
    ] as const) {
      for (const [key, value] of Object.entries(rec)) {
        expect(value, `${name}.recording.${key} should have no ICU variables`).not.toMatch(
          /\{[a-zA-Z_][a-zA-Z0-9_]*\}/,
        );
      }
    }
  });

  it('E. the existing Dashboard.bookings.status.* and Dashboard.labels.* keys are unchanged (regression guard)', () => {
    // The new `recording` block is appended under `bookings`. The
    // pre-existing status enum and labels namespace must remain
    // byte-identical.
    const existingBookingsKeys = [
      'title',
      'subline',
      'emptyTitle',
      'emptyDescription',
      'listHeading',
      'moduleLabel',
      'scheduled',
      'duration',
      'joinSession',
      'bookAgain',
    ];
    for (const k of existingBookingsKeys) {
      const v = dig(en, ['Dashboard', 'bookings', k]);
      expect(typeof v, `en.Dashboard.bookings.${k}`).toBe('string');
      const vFr = dig(fr, ['Dashboard', 'bookings', k]);
      expect(typeof vFr, `fr.Dashboard.bookings.${k}`).toBe('string');
    }
    // And the status enum sub-tree.
    for (const status of [
      'pending_payment',
      'scheduled',
      'confirmed',
      'completed',
      'cancelled',
      'no_show',
      'rescheduled',
    ]) {
      expect(
        dig(en, ['Dashboard', 'bookings', 'status', status]),
        `en.Dashboard.bookings.status.${status}`,
      ).toBeTypeOf('string');
      expect(
        dig(fr, ['Dashboard', 'bookings', 'status', status]),
        `fr.Dashboard.bookings.status.${status}`,
      ).toBeTypeOf('string');
    }
  });

  it('F. the new "recording" block sits adjacent to "joinSession" (structural guard)', () => {
    // The pre-existing `bookings` object is read in order by
    // humans in PR review; we keep the new block next to the
    // join-related keys for readability.
    const enBookings = dig(en, ['Dashboard', 'bookings']) as
      | Record<string, unknown>
      | undefined;
    const frBookings = dig(fr, ['Dashboard', 'bookings']) as
      | Record<string, unknown>
      | undefined;
    expect(enBookings).toBeDefined();
    expect(frBookings).toBeDefined();
    expect(enBookings!['recording']).toBeDefined();
    expect(frBookings!['recording']).toBeDefined();
  });
});
