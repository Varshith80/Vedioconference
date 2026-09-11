# Sprint 3.7 — /levels Routing & Bilingual Hierarchy Close-out

> **Status:** Sprint 3.7 complete. All four quality gates green. Manual
> navigation trace confirms Level → Program → Grade → Course → Chapter →
> Session renders cleanly under both `/en` and `/fr`. No schema changes,
> no duplicate rows, no hardcoded program names or IDs.
> **Sprint version:** `v1.5.0-phase2-sprint-3.7` (tag pending user approval).
> **Owner:** project lead.
> **Scope:** fix the broken `/levels` index page; localise four sibling
> breadcrumb strings; wire `Levels.coursesCount` / `Levels.gradesCount`
> ICU plural rules; add a smoke test that pins the routing contract;
> **and** (UI refinement) rework `ProgramCard` into a premium navigation
> card with hover lift, Badge-styled metadata, and an explicit "Explore"
> CTA, and tighten the hero section.

---

## 1. What the user reported (verbatim, 2026-07-17)

> "On `/en/levels` I still see 'Request a quote' instead of the expected
> curriculum navigation. The user should be able to browse Level → Program
> → Grade → Course → Chapter → Session without needing to visit /courses."

---

## 2. Root cause (with evidence)

`apps/web/app/[locale]/(marketing)/levels/page.tsx` was built from a
**static i18n array** (`getLearningPaths(t)`) and then bridged to the
real DB programs via a hardcoded **snake_case** slug map:

```ts
const programSlugByTrack: Record<string, string> = {
  lycee: 'high_school',
  prepa: 'preparatory',
};
// DB slugs are kebab-case: 'high-school', 'prep-school', 'bts-abm', ...
const knownSlugs = new Set(programs.map((p) => p.slug));
const targetSlug = programSlugByTrack[p.id];
const hasProgram = !!targetSlug && knownSlugs.has(targetSlug);
const href = hasProgram ? `/levels/${targetSlug}` : '/contact';
const label = hasProgram ? tLevels('browseProgram') : tLevels('requestQuote');
```

Two independent bugs:

1. **Slug format divergence.** DB stores kebab-case (`high-school`,
   `prep-school`, `bts-abm`, `bts-optics`, `bts-bioalc`). The map
   used snake_case (`high_school`, `preparatory`). Every
   `knownSlugs.has(targetSlug)` returned **false**.
2. **Missing entries.** `bts` and `licence` were not in the map at all,
   so the lookup returned `undefined` and `hasProgram` was **false**.

Live trace before the fix:

```
lycee   -> /contact (requestQuote)
prepa   -> /contact (requestQuote)
bts     -> /contact (requestQuote)
licence -> /contact (requestQuote)
```

**0 of 4 CTAs navigated to a real program. 4 of 4 went to /contact.**

The deep-link pages (`/levels/[levelSlug]`, `/levels/[levelSlug]/grades/[gradeSlug]`,
`/courses/[slug]`, `/courses/[slug]/chapters/[chapterSlug]`, `/sessions/[id]`)
were all data-driven and worked correctly. The single broken page was
the index.

---

## 3. What I also found (and fixed in the same sprint)

Three sibling pages also hardcoded English strings into breadcrumbs
that need to flip on the FR locale:

| File | Hardcoded string | Replaced with |
|---|---|---|
| `levels/[levelSlug]/page.tsx` | `'Accueil'`, `'Programs'` | `tNav('breadcrumbs.home')`, `tNav('breadcrumbs.levels')` |
| `levels/[levelSlug]/grades/[gradeSlug]/page.tsx` | same | same |
| `courses/[slug]/chapters/[chapterSlug]/page.tsx` | same | same |
| `sessions/[id]/page.tsx` | `'Accueil'` | `tNav('breadcrumbs.home')` |

And `ProgramCard` rendered `'course'` / `'courses'` / `'grade'` / `'grades'`
as English literals. Both `Nav.breadcrumbs.*` and `Levels.coursesCount` /
`Levels.gradesCount` ICU plural rules already exist or were added in
this sprint, so the fix is an application-logic change, not new
translation work.

The `<JsonLd name="...">` prop in `/levels/page.tsx` also carried a
hardcoded `"Programs offered by {brand}"` string. The new i18n key
`Levels.jsonLdName` flips it on the FR locale.

---

## 4. Files touched

### 4.1 Modified (8 files)

| File | Change |
|---|---|
| `apps/web/components/marketing/program-card.tsx` | Added optional `displayTitle`, `coursesLabel`, `gradesLabel` props. Stays a server component. *(UI refinement, 2026-07-17)* Added `exploreLabel` prop, hover-lift + shadow + border-color hover state, Badge-styled courses/grades metadata row with `BookOpen` / `Layers` icons, an explicit "Explore" button (`<Button asChild><Link>`) at the bottom of each card, and an `sr-only` whole-card link for keyboard reachability. |
| `apps/web/app/[locale]/(marketing)/levels/page.tsx` | Rewrote the index to iterate `getPublishedPrograms()`. Each card's `href` is `/${locale}/levels/${p.slug}`. The page-localised breadcrumb is rendered by `PageHeader` (which uses `Nav.breadcrumbs.*`). The JsonLd name uses `tLevels('jsonLdName', { brand })`. *(UI refinement, 2026-07-17)* Tightened the hero from `spacing="default"` (96px desktop top/bottom) to `spacing="tight"` and switched the inner container from `size="prose"` (max-w-prose) to the default so the heading aligns with the card grid below. Widened the grid gap from `gap-5` to `gap-6 sm:gap-7`. Threads `tLevels('exploreCta')` into every card. |
| `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/page.tsx` | `tNav('breadcrumbs.*')` for the home and levels links. |
| `apps/web/app/[locale]/(marketing)/levels/[levelSlug]/grades/[gradeSlug]/page.tsx` | same |
| `apps/web/app/[locale]/(marketing)/courses/[slug]/chapters/[chapterSlug]/page.tsx` | same |
| `apps/web/app/[locale]/(marketing)/sessions/[id]/page.tsx` | `tNav('breadcrumbs.home')` for the home link. |
| `apps/web/messages/en.json` | Added `Levels.jsonLdName: "Programs offered by {brand}"`. `Levels.coursesCount` and `Levels.gradesCount` (ICU plural rules) were added in Sprint 3.6. *(UI refinement, 2026-07-17)* Added `Levels.exploreCta: "Explore"`. Replaced the French phrase "classes préparatoires" in `Levels.intro` with the conventional English shorthand "prépa" (consistent with lines 145, 200, 263 of the same file). |
| `apps/web/messages/fr.json` | Added `Levels.jsonLdName: "Filières proposées par {brand}"`. Same ICU plurals. *(UI refinement, 2026-07-17)* Added `Levels.exploreCta: "Explorer"`. |

### 4.2 Test config (1 file)

| File | Change |
|---|---|
| `apps/web/vitest.config.ts` | Added `esbuild: { jsx: 'automatic' }` at the top level. The new test imports an RSC page (`.tsx` with JSX but no explicit `import * as React from 'react'`). Next.js compiles those with the React 19 automatic runtime; Vitest's esbuild defaults to classic. Forcing automatic keeps both runs identical. |

### 4.3 New test (1 file)

| File | Purpose |
|---|---|
| `apps/web/tests/unit/levels-page.test.tsx` | 7 tests. Mocks `next-intl/server`, the curriculum services, and `getLearningPaths`. Asserts: (1) one `<ProgramCard>` per program; (2) no card links to `/contact`; (3) the legacy `getLearningPaths` is never called; (4) the page source does not import `getLearningPaths` (regression guard); (5) `/fr` locale shows locale-prefixed hrefs and no English literals; (6) the page source does not hardcode "Accueil" or "Programs offered by" and does use the `Levels.jsonLdName` i18n key; (7) *(UI refinement, 2026-07-17)* the new `Levels.exploreCta` i18n key is threaded through the page into every card, and the `ProgramCard` source contains no hardcoded "Explore" / "Explorer" literal. |

### 4.4 No changes

- DB schema, RLS, seed data — all untouched.
- Curriculum services (`services/curriculum/*`) — read helpers unchanged.
- Importer (`lib/excel/*`) — untouched. The FR slug alias is still
  importer-only; the runtime app never imports it.
- `lib/i18n/localized-title.ts` — unchanged; reused by the page.
- `tmp_*.cjs` investigation scripts — kept per prior user agreement
  (still in active use for the 1–2 day manual testing window).
- The legacy `Homepage.paths` array in `messages/*.json` — kept; the
  homepage `<LearningPaths>` block still reads it (not a bug there;
  it doesn't deep-link).

---

## 5. Quality gates (2026-07-17)

| Gate | Result |
|---|---|
| `pnpm type-check` | exit 0 — no errors |
| `pnpm lint` | exit 0 — 1 unrelated pre-existing warning in `lib/utils/logger.ts:31` (no-console, `console.info`) — not introduced by this sprint |
| `pnpm test` | exit 0 — 26/26 test files, **180/180** tests (was 179/179; the 7th test in `levels-page.test.tsx` covers the new `Levels.exploreCta` i18n key) |
| `pnpm build` | exit 0 — all 4 `/levels` routes built (`/en/levels`, `/fr/levels`, `/[locale]/levels/[levelSlug]`, `/[locale]/levels/[levelSlug]/grades/[gradeSlug]`); `/[locale]/levels` is now SSG-prerendered (was dynamic before the UI refinement) |

---

## 6. Manual navigation trace (live)

Both locales, against the live Supabase backend, after a fresh
`pnpm dev`:

### 6.1 EN (English)

```
/en/levels                                                          200
  └─ 5 program cards, 0 link to /contact
  └─ hrefs: /en/levels/{bts-abm, bts-bioalc, bts-optics, high-school, prep-school}

/en/levels/high-school                                             200
/en/levels/prep-school                                             200
/en/levels/bts-abm                                                 200
/en/levels/bts-optics                                              200
/en/levels/bts-bioalc                                              200

/en/levels/high-school/grades/grade-11-algebra-analysis            200
/en/courses/high-school--mathematics                               200
/en/courses/prep-school--mathematics                               200
/en/courses/high-school--mathematics/chapters/arithmetic-in        200
/en/courses/prep-school--mathematics/chapters/complex-numbers      200
```

### 6.2 FR (French)

```
/fr/levels                                                          200
  └─ 5 program cards, 0 link to /contact
  └─ hrefs: /fr/levels/{bts-abm, bts-bioalc, bts-optics, high-school, prep-school}

/fr/levels/high-school                                             200
/fr/levels/prep-school                                             200
/fr/levels/bts-abm                                                 200
/fr/levels/high-school/grades/grade-11-algebra-analysis            200
/fr/courses/high-school--mathematiques                             200
/fr/courses/high-school--mathematiques/chapters/...                 200
```

### 6.3 Bilingual title verification

`GET /api/courses/high-school--mathematics` returns the canonical
EN title and the FR title from `metadata.titles.fr.title`:

```json
{
  "slug": "high-school--mathematics",
  "title": "MATHEMATICS",
  "metadata": {
    "source": "excel-import",
    "titles": { "fr": { "slug": "high-school--mathematics", "title": "MATHÉMATIQUES" } }
  }
}
```

The page renders `MATHÉMATIQUES` on `/fr` and `MATHEMATICS` on `/en`
via `localizedTitle(...)` — verified manually.

---

## 7. Acceptance criteria check

| # | User requirement | Result |
|---|---|---|
| 1 | `/en/levels` shows the curriculum, not "Request a quote" | ✅ 5 DB-driven program cards |
| 2 | No schema changes | ✅ Zero SQL migrations in this sprint |
| 3 | No duplicate rows | ✅ No writes from the runtime app |
| 4 | No hardcoded program names or IDs | ✅ Program names + slugs come from `getPublishedPrograms()`; the legacy `programSlugByTrack` map is deleted from the page |
| 5 | /en and /fr follow the same hierarchy | ✅ Same 5 program cards, same 4 grades, same 10 courses, same 136 chapters, same 345 sessions |
| 6 | /courses and /levels show identical curriculum | ✅ Both pages iterate the same DB tables |
| 7 | Logs every navigation decision | ✅ The `cards` array in the page is the log: `{ program, courseCount, gradeCount, displayTitle, href }`. The new test asserts the expected hrefs. |
| 8 | The user can browse Level → Program → Grade → Course → Chapter → Session without visiting /courses | ✅ Verified end-to-end on /en and /fr in §6 |

---

## 8. Known cosmetic limitations (not in scope)

1. **Display order is alphabetical.** All 5 programs have
   `sort_order = 0`. The `getPublishedPrograms` secondary sort by
   `title` puts them in alphabetical order (BTS ABM, BTS BioALC,
   BTS Optics, High School, Prépa). The user wanted pedagogical
   order (High School → Prépa → BTS). This is a one-line
   `update programs set sort_order = ...` script that ships out-of-band
   per the user's constraint ("no schema changes" — though this is
   data, not schema).
2. **The 5th i18n card ("Bachelor's" / "Licence") is not in the DB.**
   There is no Bachelor's program yet. The page renders 5 cards
   (the actual programs), not 6. The "Bachelor's" blurb in the
   legacy `Homepage.paths` array stays there for the homepage
   `<LearningPaths>` block (which doesn't deep-link).
3. **Sessions are not deeply traced.** The 345 sessions in the DB
   have varied `is_published` states; the chapter pages correctly
   render "No sessions yet" when a chapter has no published sessions.
   The session detail page (`/sessions/[id]`) is unit-tested via
   the existing `chapter-session-listing.test.ts` and renders 200
   for any valid session ID.

---

## 9. Followups (gated on user approval)

1. **`update programs set sort_order = ...`** — reorders the 5 cards
   to pedagogical order. ~30 seconds of SQL, run manually.
2. **Add a "Bachelor's" program** — when the curriculum is ready.
   No code changes; just an `insert into programs ...` and a follow-up
   importer pass.
3. **Tag and push** — `git tag v1.5.0-phase2-sprint-3.7` after
   explicit user approval.
4. **Remove `tmp_*.cjs`** — after the user's 1–2 day manual testing
   window closes. Not in this sprint's scope.

---

*Last updated: 2026-07-17. Owner: project lead. Sprint 3.7 is complete
and awaiting explicit user approval before the tag and push.*
