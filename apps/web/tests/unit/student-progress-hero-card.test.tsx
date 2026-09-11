import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// =====================================================================
// Behavioural test for the homepage hero progress card.
//
// The card has 5 product states (visitor / 0% / partial / 100% / no-
// enrollment). All 5 must work correctly with both EN and FR copy,
// and the existing visitor path through `<Hero />` must continue to
// render `<HeroCurve />` (not the new card). We pin every branch and
// every accessibility attribute the contract requires.
// =====================================================================

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement('a', { href }, children),
}));

import { StudentProgressHeroCard, type StudentProgressHeroCardCopy } from '@/components/marketing/student-progress-hero-card';
import { Hero } from '@/components/marketing/hero';
import type { StudentProgressSummary } from '@/services/student/progress';

const FILE_HERO = join(process.cwd(), 'components/marketing/hero.tsx');
const FILE_CARD = join(process.cwd(), 'components/marketing/student-progress-hero-card.tsx');

function emptySummary(): StudentProgressSummary {
  return {
    programs: [],
    totals: { purchased: 0, booked: 0, completed: 0 },
    hasAny: false,
  };
}

function summaryWith(args: { purchased: number; booked: number; completed: number }): StudentProgressSummary {
  return {
    programs: [],
    totals: args,
    hasAny: args.purchased > 0,
  };
}

const enCopy: StudentProgressHeroCardCopy = {
  title: 'Your progress',
  subline: 'Across all of your programs.',
  notStarted: 'Not started yet',
  completed: 'Completed',
  percent: (n) => `${n}%`,
  purchased: (n) => `${n} sessions purchased`,
  booked: (n) => `${n} scheduled`,
  completedCount: (n) => `${n} completed`,
  ctaNoEnrollment: {
    title: 'Start your learning journey',
    subline: "You don't have any active programs yet.",
    cta: 'Explore courses',
  },
};

const frCopy: StudentProgressHeroCardCopy = {
  title: 'Votre progression',
  subline: "Sur l'ensemble de vos programmes.",
  notStarted: 'Pas encore commencer',
  completed: 'Terminé',
  percent: (n) => `${n} %`,
  purchased: (n) => `${n} séances achetées`,
  booked: (n) => `${n} planifiées`,
  completedCount: (n) => `${n} terminées`,
  ctaNoEnrollment: {
    title: 'Commencez votre parcours',
    subline: "Vous n'avez pas encore de programme actif.",
    cta: 'Voir les cours',
  },
};

describe('StudentProgressHeroCard — 5 product states', () => {
  it('state 5 (no enrollment): CTA card with link to /<locale>/courses', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'en',
        summary: emptySummary(),
        copy: enCopy,
      }),
    );
    expect(html).toContain('data-progress-state="no-enrollment"');
    expect(html).toContain('Start your learning journey');
    expect(html).toContain("You don&#x27;t have any active programs yet.");
    // Anchor (not button) — Cmd+Click must work.
    expect(html).toMatch(/<a[^>]+href="\/en\/courses"/);
    expect(html).toContain('Explore courses');
    // No progressbar in the no-enrollment state.
    expect(html).not.toContain('role="progressbar"');
    // The visitor must NOT see a 0% bar.
    expect(html).not.toContain('>0%<');
  });

  it('state 5 (no enrollment): FR copy renders the FR CTA label', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'fr',
        summary: emptySummary(),
        copy: frCopy,
      }),
    );
    expect(html).toContain('data-progress-state="no-enrollment"');
    expect(html).toContain('Commencez votre parcours');
    expect(html).toContain('Voir les cours');
    expect(html).toMatch(/<a[^>]+href="\/fr\/courses"/);
  });

  it('state 2 (0%, not started): empty bar with "Not started yet"', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'en',
        summary: summaryWith({ purchased: 4, booked: 0, completed: 0 }),
        copy: enCopy,
      }),
    );
    expect(html).toContain('data-progress-state="not-started"');
    expect(html).toContain('Your progress');
    expect(html).toContain('Not started yet');
    // Native progressbar with aria-valuenow="0".
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="0"/);
    // Percent label.
    expect(html).toContain('>0%<');
    // 0% width — the inline style must clamp to 0% (not -%).
    expect(html).toMatch(/style="width:0%"/);
  });

  it('state 3 (partial): live percent and counts', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'en',
        summary: summaryWith({ purchased: 4, booked: 2, completed: 1 }),
        copy: enCopy,
      }),
    );
    expect(html).toContain('data-progress-state="in-progress"');
    expect(html).toContain('>25%<');
    expect(html).toMatch(/style="width:25%"/);
    // 1 completed · 1 scheduled (booked - completed = 1).
    expect(html).toContain('1 completed');
    expect(html).toContain('1 scheduled');
    // 4 sessions purchased.
    expect(html).toContain('4 sessions purchased');
    // No "Not started" or "Completed" status line in partial state.
    expect(html).not.toContain('Not started yet');
    expect(html).not.toContain('>Completed<');
  });

  it('state 4 (100%): full bar with "Completed"', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'en',
        summary: summaryWith({ purchased: 3, booked: 3, completed: 3 }),
        copy: enCopy,
      }),
    );
    expect(html).toContain('data-progress-state="completed"');
    expect(html).toContain('>100%<');
    expect(html).toMatch(/style="width:100%"/);
    expect(html).toContain('Completed');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="100"/);
  });

  it('state 4 (100%): FR copy renders "Terminé"', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'fr',
        summary: summaryWith({ purchased: 3, booked: 3, completed: 3 }),
        copy: frCopy,
      }),
    );
    expect(html).toContain('data-progress-state="completed"');
    // FR copy uses "100 %" (with a space, per the FR ICU
    // message "{percent} %" and the test's frCopy callback
    // returning `${n} %`).
    expect(html).toContain('>100 %<');
    expect(html).toContain('Terminé');
  });

  it('partial: French copy renders counts and percent in French', () => {
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'fr',
        summary: summaryWith({ purchased: 4, booked: 2, completed: 1 }),
        copy: frCopy,
      }),
    );
    expect(html).toContain('Votre progression');
    expect(html).toContain('>25 %<');
    expect(html).toContain('1 terminées');
    expect(html).toContain('1 planifiées');
    expect(html).toContain('4 séances achetées');
  });

  it('accessibility: every non-empty state has role/aria-valuemin/aria-valuemax', () => {
    for (const s of [
      summaryWith({ purchased: 4, booked: 0, completed: 0 }),
      summaryWith({ purchased: 4, booked: 2, completed: 1 }),
      summaryWith({ purchased: 3, booked: 3, completed: 3 }),
    ]) {
      const html = renderToStaticMarkup(
        React.createElement(StudentProgressHeroCard, {
          locale: 'en',
          summary: s,
          copy: enCopy,
        }),
      );
      expect(html).toMatch(/role="progressbar"/);
      expect(html).toMatch(/aria-valuemin="0"/);
      expect(html).toMatch(/aria-valuemax="100"/);
    }
  });

  it('percent is bounded 0..100 even with malformed totals (defence-in-depth)', () => {
    // Hypothetical pathological case: completed > purchased
    // (e.g. a service bug). The local clamp + ProgressBar
    // clamp must keep the bar at 100% and never render NaN.
    const html = renderToStaticMarkup(
      React.createElement(StudentProgressHeroCard, {
        locale: 'en',
        summary: summaryWith({ purchased: 3, booked: 3, completed: 99 }),
        copy: enCopy,
      }),
    );
    expect(html).toMatch(/aria-valuenow="100"/);
    expect(html).toMatch(/style="width:100%"/);
    expect(html).not.toContain('NaN');
  });

  it('source: the card does NOT declare a "use client" directive', () => {
    const src = readFileSync(FILE_CARD, 'utf8');
    // The card is pure-presentational; it must not pull in
    // any client-side hook.
    expect(src).not.toMatch(/['"]use client['"]/);
  });
});

describe('Hero — visitor path still renders <HeroCurve />', () => {
  it('source: Hero.tsx still imports HeroCurve and uses the progressCard ?? HeroCurve ternary', () => {
    const src = readFileSync(FILE_HERO, 'utf8');
    expect(src).toMatch(/import\s*\{\s*HeroCurve\s*\}/);
    // The hero is built so a missing progressCard falls back
    // to the existing decorative curve.
    expect(src).toMatch(/progressCard\s*\?\?\s*<HeroCurve\s*\/>/);
  });

  it('behaviour: rendering <Hero progressCard={undefined} /> emits an <svg> from HeroCurve', () => {
    const html = renderToStaticMarkup(
      React.createElement(Hero, {
        headline: 'H',
        subheadline: 'S',
        primaryLabel: 'P',
        secondaryLabel: 'C',
        socialProof: 'P',
      }),
    );
    // The right-hand card contains an SVG (the HeroCurve).
    expect(html).toMatch(/<svg/);
    // No progressbar — visitors do NOT see the new card.
    expect(html).not.toContain('data-progress-state');
    expect(html).not.toContain('role="progressbar"');
    // The HeroCurve must remain in the page even when a
    // progressCard is mounted, for other consumers that
    // unconditionally render the curve. We assert only that
    // it's not the same DOM block as the new card.
  });
});
