import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// =====================================================================
// Source-level contract test for `Homepage.progress` i18n keys.
//
// The new hero card lives at `Homepage.progress` in both message
// files. The contract we pin here:
//
//   1. The sub-namespace exists in BOTH `en.json` and `fr.json`.
//   2. The four ICU variables — `{percent}` (×1 in `percent`),
//      `{count}` (×3 in `purchased` / `booked` /
//      `completedCount`) — are PRESERVED (NOT single-quote
//      escaped). The homepage always has the values at call
//      time, so a real ICU variable is the right shape.
//   3. The existing `Homepage.*` keys are unchanged (we did
//      not regress the marketing copy).
//   4. The `ctaNoEnrollment` block has a title, subline, and
//      CTA label in both locales.
//   5. The English headline / subheadline / CTA labels are
//      unchanged from their pre-Sprint values.
// =====================================================================

const FILE_EN = join(process.cwd(), 'messages/en.json');
const FILE_FR = join(process.cwd(), 'messages/fr.json');

interface HomepageProgressShape {
  title: string;
  subline: string;
  notStarted: string;
  completed: string;
  percent: string;
  purchased: string;
  booked: string;
  completedCount: string;
  ctaNoEnrollment: {
    title: string;
    subline: string;
    cta: string;
  };
}

function readHomepageProgress(file: string): HomepageProgressShape {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    Homepage?: { progress?: HomepageProgressShape };
  };
  const p = raw.Homepage?.progress;
  if (!p) {
    throw new Error(`Homepage.progress sub-namespace missing in ${file}`);
  }
  return p;
}

describe('Homepage.progress i18n — both locales', () => {
  it('en.json: the sub-namespace exists with the 8 flat keys + ctaNoEnrollment block', () => {
    const p = readHomepageProgress(FILE_EN);
    expect(p.title).toBe('Your progress');
    expect(p.subline).toBe('Across all of your programs.');
    expect(p.notStarted).toBe('Not started yet');
    expect(p.completed).toBe('Completed');
    expect(p.percent).toBe('{percent}%');
    expect(p.purchased).toBe('{count} sessions purchased');
    expect(p.booked).toBe('{count} scheduled');
    expect(p.completedCount).toBe('{count} completed');
    expect(p.ctaNoEnrollment.title).toBe('Start your learning journey');
    expect(p.ctaNoEnrollment.subline.length).toBeGreaterThan(0);
    expect(p.ctaNoEnrollment.cta).toBe('Explore courses');
  });

  it('fr.json: the sub-namespace exists with French copy + ctaNoEnrollment block', () => {
    const p = readHomepageProgress(FILE_FR);
    expect(p.title).toBe('Votre progression');
    expect(p.subline.length).toBeGreaterThan(0);
    expect(p.notStarted).toBe('Pas encore commencé');
    expect(p.completed).toBe('Terminé');
    expect(p.percent).toBe('{percent} %');
    expect(p.purchased).toBe('{count} séances achetées');
    expect(p.booked).toBe('{count} planifiées');
    expect(p.completedCount).toBe('{count} terminées');
    expect(p.ctaNoEnrollment.title).toBe('Commencez votre parcours');
    expect(p.ctaNoEnrollment.subline.length).toBeGreaterThan(0);
    expect(p.ctaNoEnrollment.cta).toBe('Voir les cours');
  });

  it('both locales keep the {percent} ICU variable (no single-quote escape)', () => {
    // The bookings page had to escape `{n}` and `{total}`
    // because the server called `t('…')` with no values. The
    // homepage always passes the percent at call time, so
    // the variable stays a real ICU variable.
    const en = readHomepageProgress(FILE_EN);
    const fr = readHomepageProgress(FILE_FR);
    expect(en.percent).toContain('{percent}');
    expect(fr.percent).toContain('{percent}');
    // Negative assertion: we did NOT regress into the
    // bookings pattern.
    expect(en.percent).not.toBe("'{percent}'%");
    expect(fr.percent).not.toBe("'{percent}' %");
  });

  it('both locales keep the {count} ICU variable in purchased/booked/completedCount', () => {
    const en = readHomepageProgress(FILE_EN);
    const fr = readHomepageProgress(FILE_FR);
    expect(en.purchased).toContain('{count}');
    expect(en.booked).toContain('{count}');
    expect(en.completedCount).toContain('{count}');
    expect(fr.purchased).toContain('{count}');
    expect(fr.booked).toContain('{count}');
    expect(fr.completedCount).toContain('{count}');
  });

  it('en.json: existing Homepage headline / subheadline / CTAs are unchanged', () => {
    // The plan says "do not redesign the homepage". Pin the
    // marketing copy as a regression guard.
    const raw = JSON.parse(readFileSync(FILE_EN, 'utf8')) as {
      Homepage: Record<string, unknown>;
    };
    const h = raw.Homepage;
    expect(h.headline).toBe('Understand, not just memorise.');
    expect(h.subheadline).toMatch(/Online private lessons/);
    expect(h.ctaPrimary).toBe('Book a free course');
    expect(h.ctaSecondary).toBe('See the levels');
    expect(h.socialProof).toMatch(/Live classes/);
  });

  it('fr.json: existing Homepage headline / subheadline / CTAs are unchanged', () => {
    const raw = JSON.parse(readFileSync(FILE_FR, 'utf8')) as {
      Homepage: Record<string, unknown>;
    };
    const h = raw.Homepage;
    expect(h.headline).toBe('Comprendre, pas seulement retenir.');
    expect(h.subheadline).toMatch(/Cours particuliers en ligne/);
    expect(h.ctaPrimary).toBe('Réserver un cours gratuit');
    expect(h.ctaSecondary).toBe('Voir les niveaux');
    expect(h.socialProof).toMatch(/Cours en direct/);
  });
});
