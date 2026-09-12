# Phase 2 — Sprint 9 — Close-out

**Sprint window.** 2026-09-12.
**Author.** Sprint 9 implementation; this summary is auto-generated
from the close-out checks.
**Tag.** `v1.9.0-phase2-sprint-9` (pending user approval).
**Status.** Single-task sprint complete. No schema change, no new
SaaS, no new env var.

---

## 1. Sprint scope (recap)

The repository held a single approved Sprint 9 plan at
`C:\Users\Maniv\.claude\plans\glistening-finding-teacup.md` —
**Homepage Student Progress hero integration (Task #524-NEW)**.
No other Sprint 9 spec or roadmap entry exists in the repo.

The plan replaces the existing decorative `<HeroCurve />` visual
on the public homepage **only when the visitor is an authenticated
student with real learning data**, by mounting a new
`<StudentProgressHeroCard />` Server Component in its place.
Visitors keep the curve untouched. No schema change is required:
the data model and the components needed to render the card
already exist (see §1.2 below).

### 1.1 Hard constraints (verbatim from the plan)

- DO NOT hard-code any progress percentage.
- DO NOT use a random / demo percentage.
- DO NOT calculate progress from unrelated data.
- DO NOT create a speculative migration.
- DO NOT modify database schema, RLS, auth, or `.env.local`.
- DO NOT use the service-role key as an authorization workaround.
- DO NOT weaken RLS; do not grant public access to progress tables.
- DO NOT redesign the homepage.
- DO NOT change authentication.
- DO NOT touch remote Supabase.
- DO NOT commit or push.
- DO NOT merely audit and report — implement the integration
  *if* the existing data model supports it.

All twelve constraints are honoured — see §6 "What this sprint
did NOT do" for the matching negative evidence.

### 1.2 What the existing data model already provided

- `apps/web/services/student/progress.ts` — `getStudentProgress(studentId): Promise<StudentProgressSummary>`,
  `React.cache()`-wrapped, RLS-respecting via
  `createSupabaseServerClient()`. Returns
  `{ programs, totals: { purchased, booked, completed }, hasAny }`
  with `percent` already calculated per program. The service is
  reused by the dashboard unchanged.
- `apps/web/services/auth.ts` — `getCurrentUser()`,
  `React.cache()`-wrapped, returns `data.user ?? null` (null at
  build time so `generateStaticParams` does not break).
- `apps/web/components/dashboard/progress-bar.tsx` — pure,
  presentational, accessible progress meter (rounded-full track
  + accent fill, native `role="progressbar"` + `aria-valuenow/min/max`,
  with `value` clamped to `0..100` at render time). Reusable on
  any surface (no client directive, no data fetch).
- `Dashboard.home.progress` (in `apps/web/messages/{en,fr}.json`)
  already carries the dashboard-side progress copy.

**Conclusion:** the existing data model *fully supports* all 5
states. No schema change, no migration, no new service, no new
calculation. The work is (a) call the existing service from the
homepage, (b) render a new hero card that branches on the 5
states, and (c) reuse the existing `ProgressBar` and existing
i18n keys.

---

## 2. What landed

### 2.1 The 5 product states

| # | State | What renders |
|---|---|---|
| 1 | Visitor / not signed-in | The existing `<HeroCurve />` keeps rendering (the homepage never mounts the new card when `user == null`). |
| 2 | Authenticated, 0 % progress | Card with `data-progress-state="not-started"`, "Your progress" / "Votre progression" title, `0 %` on the right, empty bar (`aria-valuenow="0"`, `style="width:0%"`), "Not started yet" / "Pas encore commencé" status. |
| 3 | Authenticated, partial progress (1–99 %) | Card with `data-progress-state="in-progress"`, live percent, accent-filled bar, `{n} completed · {n} scheduled` and `{n} sessions purchased` / `{n} séances achetées` counts. |
| 4 | Authenticated, 100 % ("completed") | Card with `data-progress-state="completed"`, full bar (`aria-valuenow="100"`, `style="width:100%"`), "Completed" / "Terminé" status, green check icon. |
| 5 | Authenticated, no enrollment yet | Card with `data-progress-state="no-enrollment"`, "Start your learning journey" / "Commencez votre parcours" CTA, single "Explore courses →" / "Voir les cours →" link to `/{locale}/courses` (real anchor, not a button — Cmd+Click / middle-click work). |

### 2.2 Files added

- `apps/web/components/marketing/student-progress-hero-card.tsx` —
  Server Component. Pure presentation. No `"use client"`
  directive. Branches on the 5 states. Reuses `<ProgressBar>` from
  `apps/web/components/dashboard/progress-bar.tsx`. Renders a
  `<Button asChild>` + `<Link>` for the no-enrollment CTA.
  Includes a defence-in-depth `clampPercent()` that handles
  `purchased <= 0`, `!Number.isFinite()`, and out-of-range ratios
  by re-clamoing to `0..100`.
- `apps/web/tests/unit/student-progress-hero-card.test.tsx` —
  12 tests in 2 `describe` blocks. Pins all 5 states (visitor,
  0 %, partial, 100 %, no-enrollment), EN + FR copy, the
  accessibility contract (`role="progressbar"`,
  `aria-valuemin="0"`, `aria-valuemax="100"`,
  `aria-valuenow="<expected>"`), the CTA href to
  `/{locale}/courses`, percent clamping under a malformed
  summary (`completed=99, purchased=3` still renders 100 %),
  and a source-level guard that the card has no `"use client"`
  directive. The second `describe` pins the visitor path:
  `<Hero />` with no `progressCard` prop still emits an `<svg>`
  from `<HeroCurve />` and never contains `data-progress-state`.
- `apps/web/tests/unit/homepage-progress-i18n.test.ts` —
  6 source-level contract tests. Pins the `Homepage.progress`
  sub-namespace in BOTH `en.json` and `fr.json`, the
  `{percent}` and `{count}` ICU variables (real, not
  single-quote-escaped — the homepage always has the values at
  call time), the `ctaNoEnrollment` block, and a regression
  guard that the existing `Homepage.headline / subheadline /
  ctaPrimary / ctaSecondary / socialProof` strings are
  unchanged in both locales.

### 2.3 Files modified

- `apps/web/components/marketing/hero.tsx` — added one optional
  prop `progressCard?: React.ReactNode`. Renders
  `{progressCard ?? <HeroCurve />}` in the right-hand card slot.
  `HeroCurve` import preserved. Left column, `LivePill`, both
  CTA buttons, `Container`, and the responsive 12-column grid
  are **untouched**.
- `apps/web/app/[locale]/(marketing)/page.tsx` — (a) added
  `await getCurrentUser()` and `await getStudentProgress(user.id)`
  (only when `user != null`); (b) added `await getLocale()` so
  the CTA links to `/{locale}/courses`, not always `/en/courses`;
  (c) call `getTranslations('Homepage.progress')` for the copy
  object; (d) pass a `<StudentProgressHeroCard />` to
  `<Hero progressCard={…} />` when `user != null`, leave the
  prop out for visitors. `export const revalidate = 60` is
  **preserved** (no `force-dynamic` switch).
- `apps/web/messages/en.json` — added the `Homepage.progress`
  sub-namespace (8 flat keys + 3 cta keys) under the existing
  `Homepage` object.
- `apps/web/messages/fr.json` — same, French copy.

---

## 3. Quality gates (CLAUDE §7)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (1 pre-existing warning in `lib/utils/logger.ts:31` — unrelated to Sprint 9) |
| `pnpm test` | ✅ **512 / 512** passed across **59** files (includes the 2 new Sprint 9 test files: 12 `student-progress-hero-card` tests + 6 `homepage-progress-i18n` tests) |
| `pnpm build` | ✅ exit 0; compiled successfully; First Load JS shared by all = 99.3 kB (unchanged); all Sprint 8 routes still present |

No new SaaS, no new env var, no `.env.example` key change, no
new top-level folder, no new admin SaaS, no migration.

---

## 4. Schema-change gate — none triggered

Sprint 9 required **no database schema change**. The existing
`getStudentProgress` service, the existing `ProgressBar` component,
and the existing `Homepage.*` + `Dashboard.home.progress` i18n
keys were sufficient to render all 5 product states. No new
columns, no new tables, no new RLS policies, no new GRANTs, no
new indexes. Migrations are **unchanged** vs `HEAD`.

The `homepage-progress-i18n.test.ts` file pins the absence of
regression: existing `Homepage.headline / subheadline / ctaPrimary
/ ctaSecondary / socialProof` strings are unchanged in both
`en.json` and `fr.json`.

---

## 5. Files changed (this sprint)

```
A  apps/web/components/marketing/student-progress-hero-card.tsx
A  apps/web/tests/unit/homepage-progress-i18n.test.ts
A  apps/web/tests/unit/student-progress-hero-card.test.tsx
M  apps/web/app/[locale]/(marketing)/page.tsx
M  apps/web/components/marketing/hero.tsx
M  apps/web/messages/en.json
M  apps/web/messages/fr.json
A  docs/review/PHASE2_SPRINT_9_SUMMARY.md   (this file)
M  PROJECT_STATE.md
M  CHANGELOG.md
```

---

## 6. What this sprint did NOT do

- No new migration. No schema change. No RLS change.
- No `.env.local` edit. No `.env.example` rotation.
- No remote Supabase touch (verified via `git diff`).
- No service-role key as an authorization workaround.
- No weakening of RLS. No public access to progress tables.
  `getStudentProgress` continues to use the RLS-respecting
  `createSupabaseServerClient()` and is scoped by `auth.uid()`
  on the cookie attached to the request.
- No redesign. The existing `Hero` JSX is left 95 % intact; the
  only new prop is `progressCard?: React.ReactNode`. The
  left-hand column, the `LivePill`, the buttons, the `Container`
  wrapper, and the responsive grid are all preserved.
- No authentication change. No SaaS introduction. No new
  state management. No new top-level folders.
- No change to `getCurrentUser`, `getStudentProgress`,
  `ProgressBar`, or `HeroCurve`.
- No change to the dashboard progress card.
- No change to existing pricing. No change to existing marketing
  copy (`headline`, `subheadline`, `ctaPrimary`, `ctaSecondary`,
  `socialProof`).
- No commit, no push, no tag work performed in the implementation
  turn (per the user's guardrails). The commit and the tag are
  gated on explicit user approval, exactly as for every prior
  sprint.

---

## 7. Memory entry

A memory entry was written to
`C:\Users\Maniv\.claude\projects\C--Vedioconference\memory\vedioconference-homepage-progress-hero-card.md`
capturing (a) the visitor vs authed branching at the marketing
edge, (b) the `revalidate = 60` cache decision (do *not* flip to
`force-dynamic`), (c) the `progressCard ?? <HeroCurve />` ternary
in `hero.tsx` as the new extension point for future hero-side
replacements.

---

## 8. Remaining work / explicit deferrals

- **S8-D (R-3 Recordings).** Still blocked on a forward-only
  schema change to add `meeting_links.recording_url text` plus
  the Zoom `recording.completed` → n8n → `meeting_links` write-
  back workflow. Recommended as a future sprint candidate.
- **No new SaaS, no Upstash, no `.env.example` rotation, no MFA,
  no GDPR export, no Playwright suite, no Vitest coverage
  project, no k6 load test** — all deferred per the Sprint 8
  reconciliation report §B.

---

## 9. Approval checklist

- [ ] User confirms Sprint 9 close-out is acceptable as-is.
- [ ] User authorises the `v1.9.0-phase2-sprint-9` tag and the
      push to `main`.
- [ ] Sprint 10 scope is NOT started in this session.

---

*Last updated: 2026-09-12. Owner: project lead.*
