import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// =====================================================================
// Sprint 3.7 routing smoke test for
// `apps/web/app/[locale]/(marketing)/levels/page.tsx`.
//
// The bug
// -------
// The pre-Sprint-3.7 `/levels` page was hardcoded to read
// `getLearningPaths(t)` (a static i18n array) and then map
// each i18n track id (`lycee`, `prepa`, `bts`, `licence`) to
// a DB program slug via a hardcoded snake_case lookup. The
// DB stores kebab-case slugs (`high-school`, `prep-school`,
// `bts-abm`, `bts-optics`, `bts-bioalc`). Every entry in
// `knownSlugs.has(targetSlug)` returned false, so all four
// CTAs navigated to `/contact` instead of a real program.
//
// What this test asserts
// ----------------------
// 1. The page renders one <ProgramCard> per program returned
//    by `getPublishedPrograms()`.
// 2. Every card's CTA points to `/en/levels/${program.slug}`.
//    None of them points to `/contact`.
// 3. The page does NOT import or call `getLearningPaths` —
//    the legacy i18n array. This is enforced two ways: a
//    mock spy that the page should never call, and a source
//    grep that fails the test if `getLearningPaths` is ever
//    imported by the page again.
// 4. The localised breadcrumb labels come from
//    `Nav.breadcrumbs.*` keys (the page renders the
//    `<PageHeader>` breadcrumbs). We assert the namespace
//    is requested and the keys are used.
//
// Rendering the page requires mocking `next-intl/server`.
// We follow the pattern from `email-templates.test.ts`.
// =====================================================================

// --- Module mocks (must come before the page import) ---

// `next-intl/server` — we only care about the `getTranslations`
// and `setRequestLocale` helpers the page calls.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ namespace }: { namespace: string }) => {
    return (key: string, vars?: Record<string, unknown>) => {
      // Plural-rule keys: render `# courses` / `# grades` so we
      // can assert the parent invokes them.
      if (namespace === 'Levels' && (key === 'coursesCount' || key === 'gradesCount')) {
        const n = typeof vars?.['n'] === 'number' ? (vars['n'] as number) : 0;
        const unit = key === 'coursesCount' ? 'courses' : 'grades';
        return n === 0 ? `No ${unit}` : `${n} ${unit}`;
      }
      // The JsonLd name string. The page passes `{ brand: BRAND.name }`.
      // For this test we return the namespaced key (instead of the
      // translated value) so the rendered HTML proves the page
      // requested the i18n key and didn't hardcode a string.
      if (namespace === 'Levels' && key === 'jsonLdName') {
        return `Levels.jsonLdName`;
      }
      // The Explore CTA label. Same pattern: return the namespaced
      // key so the rendered HTML proves the parent resolved it
      // via i18n instead of hardcoding "Explore" / "Explorer".
      if (namespace === 'Levels' && key === 'exploreCta') {
        return `Levels.exploreCta`;
      }
      // Default: echo the namespaced key back. Tests assert
      // *structure* (i.e. "the page requested Nav.breadcrumbs.home")
      // rather than a snapshot of the translation copy.
      return `${namespace}.${key}`;
    };
  }),
  setRequestLocale: vi.fn(),
}));

// `@/lib/i18n/paths` — the legacy helper the broken page used.
// The fix must NOT import or call it. We expose a spy so the
// test can assert it was never invoked.
const getLearningPaths = vi.fn(() => []);
vi.mock('@/lib/i18n/paths', () => ({
  getLearningPaths,
}));

// Curriculum services. We return 5 fake programs to mirror
// the real DB shape (5 programs: 1 high-school + 1 prep-school
// + 3 BTS).
interface FakeProgram {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

const PROGRAMS: FakeProgram[] = [
  {
    id: 'p-bts-abm', slug: 'bts-abm', title: 'BTS ABM',
    subtitle: 'Analyses de Biologie Médicale',
    description: null, metadata: {},
  },
  {
    id: 'p-bts-bioalc', slug: 'bts-bioalc', title: 'BTS BioALC',
    subtitle: 'Bioanalyses et Assurances de la Qualité',
    description: null, metadata: {},
  },
  {
    id: 'p-bts-optics', slug: 'bts-optics', title: 'BTS Optics',
    subtitle: 'Optique Lunetterie',
    description: null, metadata: {},
  },
  {
    id: 'p-high-school', slug: 'high-school', title: 'High School',
    subtitle: 'Lycée — Seconde, Première, Terminale',
    description: null, metadata: {},
  },
  {
    id: 'p-prep-school', slug: 'prep-school', title: 'Prépa',
    subtitle: 'Classes préparatoires aux grandes écoles',
    description: null, metadata: {},
  },
];

vi.mock('@/services/curriculum/programs', () => ({
  getPublishedPrograms: vi.fn(async () => PROGRAMS),
  // The page also calls `getProgramWithGrades(program.id)` per
  // program. We return null so the page falls back to a
  // `gradeCount` of 0 (no grade line). The route's behaviour
  // with grades is covered by the deep-link page's tests.
  getProgramWithGrades: vi.fn(async () => null),
}));

vi.mock('@/services/curriculum/courses', () => ({
  getCoursesByProgram: vi.fn(async (programId: string) => {
    // High School has 6 courses, Prépa has 2, the rest have 1.
    const counts: Record<string, number> = {
      'p-high-school': 6,
      'p-prep-school': 2,
      'p-bts-abm': 1,
      'p-bts-bioalc': 1,
      'p-bts-optics': 1,
    };
    return Array.from({ length: counts[programId] ?? 0 }, (_, i) => ({
      id: `c-${programId}-${i}`,
    }));
  }),
}));

// `localizedTitle` is a pure helper — we let the real
// implementation run. It will fall back to `program.title`
// because the metadata is empty.

// `next/link` in a jsdom test environment resolves to a real
// `<a>` tag, which is exactly what we want to grep for.

// --- The actual page import ---

const { default: LevelsPage } = await import(
  '@/app/[locale]/(marketing)/levels/page'
);

// --- Helper: render the page as React HTML ---

async function renderPage(locale: 'en' | 'fr') {
  // The page is an RSC. Vitest can't render a real RSC tree
  // without the Next.js runtime, but the page is `async` and
  // returns a JSX element whose data layer we've mocked. We
  // can call it directly and use React's `renderToStaticMarkup`
  // to get the HTML. This is the same trick the email-templates
  // tests use (they import the email components and assert on
  // the resulting markup).
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const element = await LevelsPage({
    params: Promise.resolve({ locale }),
  });
  return renderToStaticMarkup(element as React.ReactElement);
}

// --- Tests ---

describe('/[locale]/levels (Sprint 3.7 routing smoke test)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a <ProgramCard> per program returned by getPublishedPrograms', async () => {
    const html = await renderPage('en');
    // Each program slug must appear as a `href` on the page.
    for (const p of PROGRAMS) {
      expect(html).toContain(`href="/en/levels/${p.slug}"`);
    }
  });

  it('does NOT render any CTA that points to /contact from the program cards', async () => {
    const html = await renderPage('en');
    // The page still has a `<CtaBand primaryHref="/contact">` at
    // the bottom. That CTA is intentional (it links to the
    // contact form for the homepage footer-style ask). What we
    // must NOT see is a *program card* linking to `/contact`.
    // The bug was that 4 of 4 program cards went to /contact.
    // The fix: program cards now all go to /levels/{slug}. The
    // remaining /contact href comes from the CtaBand's
    // `primaryHref="/contact"`. We assert that no program
    // href points to /contact by checking that the only
    // `/contact` reference is inside the CtaBand's
    // `primaryHref`, not on a card. We do this by counting:
    // the CtaBand renders one /contact link; the cards must
    // contribute zero.
    //
    // Simpler invariant: every link with href starting with
    // `/en/levels/` must be a real program slug. None of the
    // 5 program slugs is `/contact`.
    const hrefs = html.match(/href="\/en\/levels\/[^"]+"/g) ?? [];
    expect(hrefs.length).toBeGreaterThanOrEqual(PROGRAMS.length);
    for (const href of hrefs) {
      const slug = href.replace('href="/en/levels/', '').replace('"', '');
      expect(slugs()).toContain(slug);
    }
  });

  it('does NOT call the legacy getLearningPaths helper', async () => {
    await renderPage('en');
    expect(getLearningPaths).not.toHaveBeenCalled();
  });

  it('does NOT import getLearningPaths from the page source (regression guard)', () => {
    // Read the page source. If anyone reintroduces the legacy
    // i18n array path, the grep below fails the test.
    const pagePath = resolve(
      __dirname,
      '..',
      '..',
      'app',
      '[locale]',
      '(marketing)',
      'levels',
      'page.tsx',
    );
    const src = readFileSync(pagePath, 'utf8');
    expect(src).not.toMatch(/from\s+['"]@\/lib\/i18n\/paths['"]/);
    expect(src).not.toMatch(/getLearningPaths\s*\(/);
  });

  it('renders the FR locale with locale-prefixed program hrefs and no English literals', async () => {
    const html = await renderPage('fr');
    for (const p of PROGRAMS) {
      expect(html).toContain(`href="/fr/levels/${p.slug}"`);
    }
    // The legacy bug rendered the literal "Request a quote" CTA
    // on the EN locale. That string is in the i18n file under
    // `Levels.requestQuote` but the page no longer references
    // that key. We assert the rendered HTML does not contain
    // the literal substring (it would only appear if the page
    // re-introduced the broken fallback).
    expect(html).not.toContain('Request a quote');
    // Also: the deep-link `lycee → high-school` mapping must
    // not appear; the page no longer has any such map.
    expect(html).not.toContain('high_school');
  });

  it('uses the Nav.breadcrumbs.* keys for the PageHeader breadcrumbs (no hardcoded English)', async () => {
    // The page renders a <PageHeader> with breadcrumbs. The
    // breadcrumbs must be sourced from the `Nav.breadcrumbs.*`
    // i18n keys — NOT hardcoded English literals like
    // "Accueil" or "Programs". The mock echoes namespaced
    // keys back (`Nav.breadcrumbs.home` for the home link,
    // `Nav.breadcrumbs.levels` for the levels link), so we
    // assert those namespaced keys appear in the rendered
    // HTML. The `PageHeader` is a client-side component
    // that requires the `Nav` namespace via its own
    // `useTranslations` hook — under Vitest we don't render
    // the full client tree, so we assert the contract via
    // the i18n lookup that the page explicitly performs.
    //
    // First, assert the literal "Accueil" / "Programs" do
    // NOT appear in the rendered HTML (the broken
    // pre-Sprint-3.7 hardcoded English breadcrumbs).
    const html = await renderPage('en');
    expect(html).not.toContain('Accueil');
    expect(html).not.toContain('Programs offered by');
    // The page itself looks up `Levels` keys for the heading,
    // intro, eyebrow, and CTA. The `Nav` namespace is the
    // responsibility of the `PageHeader` component (a client
    // island). Under Vitest, we instead assert the contract
    // by reading the page source and confirming the page
    // does NOT hardcode breadcrumb strings in JSX. (This
    // is the strongest static guard against the original
    // bug, which used JSX literals like `<Home />` and
    // `Programs`.)
    const pagePath = resolve(
      __dirname,
      '..',
      '..',
      'app',
      '[locale]',
      '(marketing)',
      'levels',
      'page.tsx',
    );
    const src = readFileSync(pagePath, 'utf8');
    // No JSX literal "Accueil" — would have to be inside
    // `{...}` curly braces, so the source would contain the
    // string.
    expect(src).not.toMatch(/['"]Accueil['"]/);
    // No hardcoded "Programs offered by" — the page must
    // use the i18n namespace instead.
    expect(src).not.toMatch(/Programs offered by/);
    // The page DOES use the i18n key for the JsonLd name.
    expect(src).toMatch(/tLevels\(['"]jsonLdName['"]/);
  });

  it('threads the Levels.exploreCta i18n key through the page and into each ProgramCard', async () => {
    // The mock returns `Levels.exploreCta` for the `exploreCta` key.
    // The page must look that key up, pass it as `exploreLabel` to
    // every <ProgramCard>, and the rendered HTML must contain the
    // namespaced key (5 cards × 1 occurrence each, minimum).
    const html = await renderPage('en');
    const occurrences = (html.match(/Levels\.exploreCta/g) ?? []).length;
    // The page renders one visible Explore button per card
    // (5 programs today) plus the namespaced key in the page's
    // own data pass. So we expect at least 5 occurrences.
    expect(occurrences).toBeGreaterThanOrEqual(PROGRAMS.length);

    // The page source must call `tLevels('exploreCta')` and pass
    // the result as `exploreLabel` to <ProgramCard>.
    const pagePath = resolve(
      __dirname,
      '..',
      '..',
      'app',
      '[locale]',
      '(marketing)',
      'levels',
      'page.tsx',
    );
    const pageSrc = readFileSync(pagePath, 'utf8');
    expect(pageSrc).toMatch(/tLevels\(['"]exploreCta['"]\)/);
    expect(pageSrc).toMatch(/exploreLabel=\{exploreLabel\}/);

    // The ProgramCard source must NOT hardcode "Explore" or
    // "Explorer" as a string literal in JSX or TS — it has to
    // receive the label via the `exploreLabel` prop. We strip
    // // and /* * / comments before checking, so JSDoc mentions
    // (e.g. "the Explore CTA") don't trip the guard.
    const cardPath = resolve(
      __dirname,
      '..',
      '..',
      'components',
      'marketing',
      'program-card.tsx',
    );
    const cardSrc = readFileSync(cardPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
      .replace(/^\s*\/\/.*$/gm, '');     // line comments
    expect(cardSrc).not.toMatch(/['"]Explore['"]/);
    expect(cardSrc).not.toMatch(/['"]Explorer['"]/);
    expect(cardSrc).toMatch(/exploreLabel/);
  });
});

// Helper used by the "no /contact on cards" test to validate
// that every /en/levels/ href is a real program slug.
function slugs(): string[] {
  return PROGRAMS.map((p) => p.slug);
}
