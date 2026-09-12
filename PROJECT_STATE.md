# PROJECT STATE

> **Single source of truth for "where the project is right now".**
> Update this file at the end of every milestone (or weekly,
> whichever is shorter). It is the file a new developer reads first
> when they join the team.

---

## Project name

**Intégrale** — Course Platform
Internal codename: `vedioconference` (kept for the monorepo name; the brand is Intégrale).
Repository: `C:\Vedioconference`

## Current phase

**Phase 2 — Marketing & Onboarding** → **Sprint 11 (R-3 — Zoom recording write-back & read path) implementation complete locally; awaiting explicit user approval before Sprint 11 Git commit / tag / push and before any production/operator action**.

## Current status

🟢 **Sprint 11 (R-3 — Zoom `recording.completed` → `meeting_links.recording_url` write-back + student + admin read path) is implementation-complete locally.** Six slices (11-A through 11-F) ship:
- **11-A** — `n8n/workflows/session-reminder-scheduler.json` dead-letter body no longer carries `$env.ADMIN_NOTIFY_EMAIL`.
- **11-B** — `meeting_links.recording_url text NULL` migration (forward-only, no index, no RLS, no GRANT, no trigger) + `ZOOM_WEBHOOK_SECRET` in `apps/web/lib/env.ts` and `apps/web/.env.example` (server-side only, never `NEXT_PUBLIC_*`, never in n8n, never logged).
- **11-C** — `POST /api/webhooks/zoom/` (the **Zoom trust boundary**). Raw body + `v0:{ts}:{raw}` HMAC-SHA256 + `crypto.timingSafeEqual` + ±5 min replay window + `endpoint.url_validation` echo + `webhook_events(provider, event_id)` UNIQUE idempotency + service-role admin client used **only** inside this route.
- **11-D** — `n8n/workflows/zoom-recording-completed.json` (10th workflow). **Transparent transport**: forwards the raw body + the original `x-zm-signature` and `x-zm-request-timestamp` headers verbatim. No awareness of `ZOOM_WEBHOOK_SECRET`. Does NOT verify, does NOT re-sign. Trust boundary stays at the route.
- **11-E** — student + admin read path. New `RecordingLinkCard` on `/dashboard/sessions/[id]`, inline `Badge` on `/dashboard/sessions`, and an inline pill on `/admin/bookings` (mirrored muted "Recording not available yet" pill for the null state; `data-recording-state="available" | "pending"` for symmetric test queries). EN + FR. The 10-cell admin row contract is preserved (no new column, no layout change).
- **11-F** — local Supabase migration apply via `supabase db push --local` (the project's `pnpm db:push` script targets the remote project and was NOT run); `pnpm db:types` regeneration (`meeting_links.recording_url: string | null` now in the generated `Row` / `Insert` / `Update`); 5 pre-migration defensive casts removed (the `as never` cast on the route's `update` is gone; the dashboard's `as unknown` casts on `booking.meeting.recording_url` are gone; `.trim()` runtime defence preserved). Close-out docs landed.
**No new SaaS, no new top-level folder, no new env var beyond the pre-authorized `ZOOM_WEBHOOK_SECRET`, no service-role-key workaround outside `app/api/webhooks/**`, no RLS change, no schema change beyond the single nullable column.** **The migration is applied to LOCAL Supabase only.** Remote Supabase, Zoom Marketplace, Vercel secrets, and production n8n are **operator actions** that remain separately gated. All four quality gates are green: `pnpm type-check` ✓, `pnpm lint` ✓ (1 pre-existing `lib/utils/logger.ts:31` warning unchanged), `pnpm test` ✓ (**688 / 688** across **69** files — +20 tests in Sprint 11: 23 new in `zoom-webhook-route.test.ts`, 15 new in `n8n-workflows-shape.test.ts`, 14 new in `recording-link-card.test.tsx` (incl. L/M/N admin dual-state), 6 new in `recording-link-i18n.test.ts`), `pnpm build` ✓ (the 11-C `/api/webhooks/zoom` route is registered; no other route table change). Full close-out: `docs/review/PHASE2_SPRINT_11_SUMMARY.md`. **Sprint 11 is UNSTAGED in the working tree**; the final `feat(sprint-11): …` commit, the `v1.11.0-phase2-sprint-11` tag, and the push to `origin/main` remain pending a separate explicit user authorization.

🟢 **Sprint 10 (I-1 — n8n v2 webhook parity & admin recipient hard-code) is done.** A new
`POST /api/n8n/notify` v2 email renderer + a new
`POST /api/enrollments/by-calendly-invitee` Calendly → student resolver
land behind the existing `X-Webhook-Secret` contract (matches `N8N_WEBHOOK_SECRET`).
The 6 booking-path email templates now render server-side; the
`admin_dead_letter` and `admin_booking_confirmed` templates **ignore the
body `to` field** — the recipient is the new hard-coded
`ADMIN_NOTIFY_EMAIL = 'admin@coursenligne.fr'` constant in
`apps/web/lib/constants/index.ts`. 8 of 9 n8n workflow JSON exports were
rewritten to the v2 shape (v1 `module_*` / `enrollment_*` discriminators
gone, v1 `/api/meetings/by-booking/*` URL gone, `$env.ADMIN_NOTIFY_EMAIL`
read gone); the 9th (`session-reminder-scheduler.json`) is the v2 live
workflow and is **untouched** by design. The deprecated v1
`module-reminder-scheduler.json` is deleted. The existing
`/api/webhooks/n8n` route gains two new v2 event branches —
`session_booking_rescheduled` and `session_completed` — both with the
`status IN ('scheduled', 'confirmed')` in-band idempotency guard.
**No migration, no new SaaS, no new env var, no `.env.example` key
change, no new top-level folder, no service-role-key workaround, no RLS
weakening, no remote Supabase touch, no production n8n touch.** R-3 is
**not** implemented (the `meeting_links.recording_url` schema column is
not added; the Zoom `recording.completed` write-back is not authored).
All four quality gates are green: `pnpm type-check` ✓, `pnpm lint` ✓
(1 pre-existing `lib/utils/logger.ts:31` warning unrelated to Sprint
10), `pnpm test` ✓ (**609 / 609** across **65** files — **97 new I-1
tests** across 5 new test files; Sprint 9 close-out ended at 512 / 512
across 59), `pnpm build` ✓ (the 2 new routes are registered: 285 B +
286 B). Full close-out: `docs/review/PHASE2_SPRINT_10_SUMMARY.md`.
**Sprint 10 has not been committed, pushed, or tagged yet** — that is
the next gated step on user approval.

🟢 **Sprint 9 (Homepage Student Progress hero integration — Task #524-NEW) is done.** A new
`apps/web/components/marketing/student-progress-hero-card.tsx` Server Component branches on the 5
product states (visitor, 0 %, partial, 100 %, no-enrollment) and replaces the existing decorative
`<HeroCurve />` only when the visitor is an authenticated student with real learning data. Visitors
keep the curve unchanged. The new card reuses the existing `getStudentProgress` service
(RLS-respecting, `React.cache`-wrapped), the existing `ProgressBar` component, and a new
`Homepage.progress` sub-namespace in `messages/{en,fr}.json`. `<Hero />` gained a single optional
`progressCard?: React.ReactNode` prop with a `progressCard ?? <HeroCurve />` ternary — no other
change. The marketing layout's `revalidate = 60` is preserved (no `force-dynamic` switch). Two new
test files lock the contract: 12 `student-progress-hero-card` tests + 6 `homepage-progress-i18n`
tests. **No migration, no new SaaS, no new env var, no `.env.example` key change, no new top-level
folder, no service-role-key workaround, no RLS weakening, no remote Supabase touch.** All four
quality gates are green: `pnpm type-check` ✓, `pnpm lint` ✓ (same 1 pre-existing
`lib/utils/logger.ts:31` warning unrelated to Sprint 9), `pnpm test` ✓ (**512 / 512** across
**59** files), `pnpm build` ✓. Full close-out: `docs/review/PHASE2_SPRINT_9_SUMMARY.md`. **Sprint 9
has not been committed, pushed, or tagged yet** — that is the next gated step on user approval.

🟢 **Sprint 8 (Resources delivery + Manual-Complete + Cursor pagination) is done.** Three sub-sprints
landed end-to-end (S8-A Resources delivery surface R-1 + R-2, S8-B Manual-complete session B-19, S8-C
Cursor-based pagination N-3); one sub-sprint (S8-D Recordings dashboard read-path) was **dropped** pending
explicit user authorisation of a forward-only `meeting_links.recording_url` schema change per
CLAUDE.md §3.2. No migration, no new SaaS, no new env var, no `.env.example` key change, no new
top-level folder were introduced by Sprint 8. All four quality gates are green: `pnpm type-check` ✓,
`pnpm lint` ✓ (1 pre-existing `lib/utils/logger.ts` warning unrelated to Sprint 8), `pnpm test` ✓
(454 / 454 across 53 files), `pnpm build` ✓. Full close-out:
`docs/review/PHASE2_SPRINT_8_SUMMARY.md`. The
commit (`06a3a4d feat: complete Sprint 8 close-out`) is on `main` and pushed to `origin/main` as
fast-forward (`3297c6e..06a3a4d`). The Sprint 8 tag `v1.9.0-phase2-sprint-8` already exists locally
and on `origin` (per `git tag -l` + `git ls-remote`).

🟢 **Sprint 3.8 (Admin Manual CRUD) is done.** A post-sprint debug
+ i18n audit + Create-tutor pass is also done. The admin dashboard
is now a full CRUD console for the entire curriculum hierarchy
(programs → grades → courses → chapters → sessions) plus a dedicated
tutors directory with a working "Create tutor" dialog. Every list
page exposes Create + Edit + Delete with the typed-slug
confirmation dialog; the Excel import is preserved and remains
the bulk path on the same natural keys. The new
`sessions.tutor_id` FK (one forward-only migration) lets an admin
assign a tutor per session; new bookings inherit that tutor via
`createSessionBooking`, historical bookings keep theirs. The
booking detail page is polished: the tutor "View" link now goes
to `/admin/tutors/{id}` (was a copy-paste bug to `/admin/students`),
the meeting card shows the host `start_url` with a CopyButton and
a "Zoom link created" / "Awaiting Zoom link" status badge.

🟢 **Standalone-tutor refactor (2026-07-19, follow-up to Sprint 3.8) is done.** The Tutor model is now a flat reference table with **zero dependency on `auth.users`, `profiles`, `course_tutors`, or any auth flow**. There is no `auth.admin.createUser()` call anywhere that creates a tutor. The `createTutor` service inserts directly into the standalone `tutors` table using the regular server client (admin-only RLS). The `fn_lock_tutor_profile_id()` trigger and the `trg_tutors_lock_profile` trigger are removed from the schema; all RLS policies that referenced `t.profile_id = auth.uid()` or the `course_tutors` join are rewritten. The marketing "Tuteurs qui enseignent ce cours" block on the course detail page is removed; the persona-style tutor card (avatar / bio / rating / years_experience) is replaced with an operational contact card. **Tutor scope reminder preserved verbatim:** tutors are admin-managed reference records only — no Tutor Dashboard, no tutor auth, no tutor-side flows, no tutor RLS, no tutor JWT. **i18n:** every server + client `t('...')` call has a matching key in **both** `en.json` and `fr.json`; raw keys no longer appear in the UI. **Quality gates after the refactor:** `pnpm type-check` ✓, `pnpm lint` ✓, `pnpm test` ✓ (35 files / 276 tests), `pnpm build` ✓. **Awaiting explicit approval before the next sprint.**

> **Known security follow-up (B2 close-out):**
> `apps/web/.env.example` contains real Supabase keys. These
> must be rotated by the project lead and the file rewritten
> to ship placeholders only. The B2 close-out deliberately
> does not modify the file; the follow-up is gated on
> explicit user instruction. See
> `docs/review/PHASE2_SPRINT_B2_SUMMARY.md` §7.1.

## Phase completion summary

| Phase | Scope | Status | Date |
|---|---|---|---|
| **1** | Foundation, schema, docs, n8n plan | ✅ Approved | 2026-07-07 |
| **2** | Marketing site, auth UI, dashboard shell | ✅ Sprint A + B1 + i18n + B2 + C + 3.5 + 3.6 + 3.8 + 7 + 8 + 9 + 10 done | 2026-09-12 |
| 3 | n8n workflows, Stripe, Calendly, Zoom | ✅ Shipped in Sprint C | 2026-07-10 |
| 4 | Admin dashboard + manual CRUD + Excel curriculum import | ✅ Shipped in Sprints 3.6 + 3.8 + 8 (S8-A / S8-B) | 2026-08-27 |
| 5 | Resources, notifications, polish | ⏳ | — |
| 6 | E2E tests, observability, deploy | ⏳ | — |

## Completed deliverables (Phase 1)

### Repository scaffolding

- pnpm monorepo (`apps/web`, scripts, n8n, supabase, docs).
- EditorConfig, Prettier, ESLint, TypeScript strict mode.
- 3 GitHub Actions workflows (`ci`, `codeql`, `secret-scan`).

### Supabase

- 8 SQL migrations (`20260707000001_…` → `…_0008_…`), idempotent.
- 18 tables, 4 enums, RLS on every public table, 3 storage
  buckets, 5 triggers (audit, late-cancel, tutor-overlap, role
  self-escalation, tutor immutability).
- `supabase/config.toml` (auth, JWT, password policy).
- `supabase/seed/000_seed.sql` (idempotent dev data).

### Next.js application

- App Router, RSC, typed routes.
- Supabase clients: `client` (browser), `server` (RLS), `admin`
  (webhook / register only).
- Auth: middleware + admin layout + role helpers.
- API surface: 21 route handlers (auth, profile, courses, tutors,
  bookings, resources, admin, webhooks, health).
- Forms: login, register, forgot-password (react-hook-form + Zod).
- UI primitives: Button, Toaster; Tailwind + shadcn design tokens.

### n8n

- 8 workflows documented (`n8n/docs/WORKFLOWS.md`) and exported
  as JSON placeholders.
- 5 credentials defined.
- Deploy script (`scripts/deploy-n8n.sh`).

### Documentation (24 files)

- 4 architecture documents + 4 Mermaid diagrams.
- 1 database reference.
- 1 API reference.
- 1 folder-structure reference.
- 1 development roadmap.
- 1 deployment + 1 environment reference.
- 1 security reference + 1 coding-standards reference.
- 1 booking-flow walkthrough.
- 1 error-handling reference, 1 logging reference, 1 monitoring
  reference, 1 disaster-recovery reference.
- 1 technical-debt register.
- 1 phase-1 review + 1 remediation note.
- 1 n8n workflow reference.

### Reviews & sign-off

- `docs/review/PHASE1_REVIEW.md` — formal architecture review.
- `docs/review/REMEDIATION.md` — every change that the review
  forced, with reasons.

## Remaining phases (preview)

| Phase | Scope | Target | Exit criterion |
|---|---|---|---|
| 2 | Marketing, auth UI, dashboard shell | 1 wk | Sign up → log in → empty dashboard live |
| 3 | Stripe + Calendly + Zoom + n8n | 2 wk | Book → pay → Zoom → email end-to-end |
| 4 | Admin dashboard | 1.5 wk | Catalog + bookings managed from admin |
| 5 | Resources, notifications, polish | 1 wk | WCAG 2.1 AA, 0 critical Sentry issues |
| 6 | Hardening, E2E, deploy | 1 wk | e2e green, runbook signed off |

Total: ~6.5 weeks (one full-stack engineer).

## Current tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router, RSC) | TypeScript strict |
| Styling | Tailwind CSS 3 + shadcn/ui design tokens | — |
| Forms | react-hook-form + Zod | — |
| Server | Next.js Route Handlers | App Router |
| Auth | Supabase Auth | JWT in httpOnly cookies |
| Database | Supabase Postgres 15 | RLS, PITR, EU region |
| Storage | Supabase Storage | 3 buckets (avatars, course-covers, resources) |
| Automation | n8n | Self-hosted or n8n.cloud |
| Scheduling | Calendly Standard | embed + webhook |
| Payments | Stripe Checkout | webhook signed + idempotent |
| Video | Zoom (Server-to-Server OAuth) | — |
| Email | Resend | transactional |
| Hosting | Vercel | EU region (cdg1) |
| Versioning | Git + GitHub | `main` / `staging` / `feat/*` |
| CI | GitHub Actions | lint, type-check, test, build, codeql, gitleaks |
| Package manager | pnpm 9 | workspaces |

## Current architecture

Locked. See `docs/architecture/Architecture.md`. The full diagram is
in `docs/architecture/SYSTEM_ARCHITECTURE.mmd`. The data flow is:

```
Student → Next.js 15 (Vercel)
              ↘ SSR + RSC
                Supabase (Auth + Postgres + RLS + Storage)
              ↗ webhooks
            n8n
              ↘
                {Calendly, Stripe, Zoom, Resend}
              ↗
            Supabase write-back  → Dashboard reflects the new state
```

Key invariants:

- n8n is the **only** system that calls Stripe / Zoom for the
  critical booking path. The Next.js app holds no Zoom secret and
  no service-role key for booking mutations.
- Every external call is **idempotent** (Stripe `idempotency_key`,
  `webhook_events` table, `meeting_links.booking_id` UNIQUE,
  `notifications` dedupe).
- Every public table is RLS-protected. Admin powers go through
  `public.is_admin()` / `public.is_super_admin()` helper functions.
- Service-role key is restricted to `app/api/webhooks/**` and
  `app/api/auth/register/**` by layer rules (see FolderStructure.md).

## Current folder structure

See `docs/FolderStructure.md` for the annotated tree. The skeleton
is finalised; Phase 2 adds marketing-page files, components and
tests under the existing folders — no new top-level folders.

```
vedioconference/
├── apps/web/                  # Next.js 15
│   ├── app/(marketing|auth|dashboard|admin|api)
│   ├── components/(ui|layout|marketing|dashboard|admin|forms|shared)
│   ├── hooks, lib, services, types, styles, public, tests
│   ├── middleware.ts
│   ├── next.config.mjs (CSP, HSTS, security headers)
│   └── .env.example
├── supabase/                  # config.toml + migrations/* + seed/*
├── n8n/                       # workflows/* + docs/WORKFLOWS.md
├── docs/                      # 24 .md / .mmd files
├── scripts/                   # db-push, db-url, db-types, deploy-n8n
└── .github/workflows/         # ci, codeql, secret-scan
```

## Current database status

- **Postgres 15** (Supabase, EU region).
- **18 tables** in production schema:
  `profiles`, `tutors`, `courses`, `course_tutors`, `bookings`,
  `payments`, `meeting_links`, `resources`, `resource_grants`,
  `notifications`, `audit_logs`, `subscriptions`, `coupons`,
  `invoices`, `webhook_events`, `n8n_executions`, `n8n_dead_letters`,
  `+ auth.users` (Supabase-managed).
- **4 enums** (`user_role`, `booking_status`, `payment_status`,
  `payment_provider`, `subscription_status`, `coupon_kind`,
  `invoice_status`).
- **RLS enabled on every public table** with explicit policies
  documented in `docs/database/Database.md`.
- **5 triggers** (auto-updated_at, audit, tutor-overlap, role
  self-escalation, tutor-profile immutability, late-cancel).
- **3 storage buckets** (avatars / course-covers / resources).
- **Type generation:** `pnpm db:types` writes
  `apps/web/types/database.generated.ts`.
- **Migrations are forward-only.** New SQL changes ship as new
  files; never edit an applied migration.

## Current API status

- **21 route handlers** under `apps/web/app/api/**`.
- All mutating bodies validated with **Zod**; errors converted to
  a typed JSON envelope by `errorResponse()`.
- **Webhooks signed**: Stripe (`stripe-signature`), Calendly
  (`Calendly-Webhook-Signature`), n8n (`X-Webhook-Secret`).
- **Idempotent**: Stripe via `webhook_events.event_id UNIQUE`,
  Calendly via the same table, n8n via `event_id` when present.
- **Health endpoint:** `GET /api/health` (liveness + readiness).
- **Auth endpoint:** sign up forces `email_confirm: false` and
  re-sends the verification email; forgot-password returns
  identical responses with a constant-time delay.
- **Business rule:** a student cannot cancel a booking less than
  1 hour before the start time (enforced server-side and by a
  trigger).

## Current security status

- **OWASP ASVS L1** audit completed (see `docs/review/PHASE1_REVIEW.md` §5).
- **RLS** on every table; **no** policy allows anonymous reads of
  PII.
- **JWT** in `httpOnly Secure SameSite=Lax` cookies; rotating
  refresh tokens.
- **CSP**, **HSTS**, **X-Frame-Options**, **X-Content-Type-Options**,
  **Referrer-Policy**, **Permissions-Policy** emitted from
  `next.config.mjs`.
- **Secret-scan** in CI (gitleaks).
- **CodeQL** weekly + on every PR.
- **No secrets in the repo**; only `.env.example`.
- **Audit log** on `bookings`, `payments`, `profiles` (append-only).
- **Account-lockout, MFA, full rate limiting** → Phase 5
  (tracked in `docs/TechnicalDebt.md`).

## Current n8n status

- 8 workflows **designed and documented** in
  `n8n/docs/WORKFLOWS.md`. JSON exports in
  `n8n/workflows/*.json` are placeholders that the deploy script
  will install in Phase 3.
- Triggers / actions / credentials / retries / dead-letter all
  specified.
- **Implementation starts in Phase 3.**

## Current deployment status

- **Local:** `pnpm dev` (Next.js) + `supabase start` (DB, auth,
  storage).
- **Preview:** Vercel auto-deploys every PR.
- **Staging:** Vercel `staging` branch → linked Supabase staging
  → n8n staging.
- **Production:** Vercel `main` → Supabase production (EU) →
  n8n production.
- **No production deployment yet** (Phase 6 deliverable).
- **CI:** green-on-PR required for merge to `main`.

## Current documentation status

- 24 documents / diagrams under `docs/`.
- Cross-references validated (`PROJECT_INDEX.md` is the navigation
  hub).
- Every doc is dated and versioned implicitly through the git
  history.
- **No broken links** as of this commit (validated by the
  consistency audit on 2026-07-07).

## Completed deliverables (Phase 2 — Sprint A)

### Design system & shared atoms

- `apps/web/components/shared/{container,section,heading,page-header,empty-state,loading-spinner,error-state}.tsx` — mobile-first responsive atoms.
- `apps/web/components/ui/{button,card,badge,input,textarea,label,alert,avatar,separator,dropdown-menu,dialog,skeleton}.tsx` — shadcn-style primitives.
- `apps/web/tailwind.config.ts` — `sm/md/lg/xl/2xl` breakpoints, brand-indigo + success + warning tokens, container config, `fade-in` / `fade-up` / `accordion-down` animations.
- `apps/web/styles/globals.css` — HSL tokens, focus-visible ring, `prefers-reduced-motion`, `brand-gradient` and `mesh-gradient` utilities, `text-balance/pretty`, `skip-link` utility.

### Layout

- `apps/web/components/layout/{brand-mark,site-header,site-footer}.tsx` — inline-SVG brand mark, sticky transparent-to-solid header with mobile sheet, footer with legal links.

### Marketing pages (`/`, `/about`, `/pricing`, `/contact`, `/courses`, `/courses/[slug]`, `/tutors`, `/tutors/[slug]`)

- `app/(marketing)/layout.tsx` — RSC, `revalidate=60`, skip-to-content link.
- `app/(marketing)/page.tsx` — landing (hero + features + tutor preview + testimonials + CTA band + Organization JSON-LD).
- `app/(marketing)/{about,pricing,contact}/page.tsx` — content + FAQ / contact form / pricing table.
- `app/(marketing)/courses/page.tsx` + `[slug]/page.tsx` — list and detail with `generateStaticParams` and `generateMetadata`.
- `app/(marketing)/tutors/page.tsx` + `[slug]/page.tsx` — directory and detail.
- `app/(marketing)/courses/[slug]/page.tsx` — joined `course_tutors(tutor:tutors(*, profile:profiles(*)))` query.

### Marketing components

- `apps/web/components/marketing/{hero,features-grid,tutor-preview,testimonials,cta-band,pricing-table,course-card,course-detail,tutor-card,tutor-detail,contact-form,jsonld}.tsx`.

### API

- `apps/web/app/api/contact/route.ts` — POST with Zod, in-memory rate limit (5/hr/IP), honeypot, Resend send.

### SEO & metadata

- `apps/web/app/sitemap.ts` — static routes + dynamic `courses` and `tutors` slugs.
- `apps/web/app/robots.ts` — disallows `/dashboard`, `/admin`, `/api`, `/auth`.
- `apps/web/app/opengraph-image.tsx` — Edge runtime, 1200×630, gradient + wordmark.
- `apps/web/public/{logo,icon,favicon}.svg` — inline SVG brand assets.
- `Organization` / `Course` / `Person` JSON-LD on landing + detail pages.

### Type safety boundary

- `apps/web/types/domain.ts` — strongly-typed `Course`, `Tutor`, `Profile`, `Booking`, `Payment`, etc., derived from the SQL schema. Services cast Supabase rows to these types at the boundary.
- `apps/web/types/database.generated.ts` — permissive placeholder until `pnpm db:types` runs. `Relationships: []` is intentional so postgrest-js doesn't fall through to `SelectQueryError` (i.e. `never`).

### Build-time safety

- `apps/web/lib/supabase/server.ts` — `createSupabaseServerClient` is now `async` (Next 15 `cookies()` is async) and build-time safe (falls back to a no-op cookie adapter when called from `generateStaticParams`).
- `apps/web/services/{auth,courses,tutors}.ts` — wrapped the public-data queries in `try/catch` that return `[]` on error so the build is offline-tolerant.
- `apps/web/services/auth.ts` — `getCurrentUser` returns `null` on error so the marketing layout can render during build.
- Dynamic routes use `export const dynamic = 'force-dynamic'` so the catalog renders on demand (no static generation against unreachable Supabase in CI).

### Tests

- `apps/web/vitest.config.ts`.
- `apps/web/tests/unit/{rate-limit,format,contact-schema}.test.ts` — 10 tests, all passing.

### Code quality

- `apps/web/.eslintrc.json` — added the missing `plugins` and `parser` entries (the previous config referenced `@typescript-eslint/*` rules without the plugin installed).
- `apps/web/components/marketing/contact-form.tsx` — `import type { z }` (the rule flagged it).
- `apps/web/components/forms/{login,forgot-password,register}-form.tsx` — `import type { z }`, switched from the `@/lib/supabase` barrel to `@/lib/supabase/client` to avoid pulling `next/headers` into the client bundle.
- `apps/web/components/marketing/pricing-table.tsx` — removed unused `Container` / `Section` / `Heading` imports.
- `apps/web/app/admin/page.tsx` — escaped the apostrophe in `Vue d'ensemble`.
- `apps/web/app/api/auth/register/route.ts` — removed unused imports.
- `apps/web/app/api/courses/route.ts` — removed unused `getCurrentUser` / `Unauthorized`.
- `apps/web/app/api/webhooks/stripe/route.ts` — `import type Stripe` (used only as a type), removed unused `BadRequest`.
- `apps/web/app/api/bookings/[id]/cancel/route.ts` — Next 15 async `params`, and `as never` casts on Supabase mutations (see Known limitations).
- `apps/web/app/api/profile/route.ts` — `as never` cast on `.update()`.
- `apps/web/app/api/admin/overview/route.ts` — `role` cast.
- `apps/web/app/admin/layout.tsx` — `role` cast.
- `apps/web/app/dashboard/page.tsx` — `full_name` cast.
- `apps/web/app/dashboard/bookings/page.tsx` — defensive cast on the booking row.
- `apps/web/app/api/webhooks/{calendly,stripe,n8n}/route.ts` — `as never` casts and the Calendly signature parser is now type-safe.

### Removed

- `apps/web/app/page.tsx` — replaced by the `(marketing)` route group.
- `apps/web/app/marketing/` — a leftover Phase 1 path that conflicted with the new `(marketing)` group.
- `apps/web/lib/constants/marketing.ts` — replaced by `brand.ts` (Sprint B1).

## Completed deliverables (Phase 2 — Sprint B)

Sprint B was split into **B1** (UI, brand, auth abstraction, dashboard
shell) and **B2** (real Supabase wiring + smoke test). B2 cannot start
until the client provides the project e-mail account required to
create the Supabase project. B1 is complete and gated on user
approval.

### Brand (Sprint B1)

- `apps/web/lib/constants/brand.ts` — single source of truth for
  the Intégrale brand (palette hex, IBM Plex Serif/Sans/Mono type
  stack, name, tagline, primary nav, footer links, 4 learning
  paths, 3 method steps, 3 key figures, copyright year 2026).
- `apps/web/styles/globals.css` — refreshed HSL tokens to the
  client palette, added `--brand-primary` / `--brand-accent` /
  `--brand-warning` CSS variables, `bg-paper-grid` (papier
  millimétré) and `live-pill-dot` keyframes.
- `apps/web/tailwind.config.ts` — `fontFamily` extended with
  `serif` (Plex Serif) and `mono` (Plex Mono) stacks.
- `apps/web/app/layout.tsx` — `next/font/google` loads IBM Plex
  Sans / Serif / Mono and exposes them as CSS variables.
- `apps/web/components/layout/brand-mark.tsx` — `'Int∫grale'`
  wordmark; the `∫` is a *letter* (font-serif, not a decorative
  icon). `tone: 'default' | 'invert'`, three sizes. Single
  `aria-label` on the root, inner spans `aria-hidden`.
- `apps/web/public/{favicon,icon,logo}.svg` — Vélin/light and
  Bleu Plan/dark `∫` glyph variants.
- `apps/web/app/opengraph-image.tsx` — 1200×630 with Bleu Plan
  gradient, `∫` glyph card, wordmark, tagline, Ambre Surligneur
  accent dot, 'Cours en direct · Lycée → Licence'.

### Marketing primitives (Sprint B1)

- `apps/web/components/marketing/section-eyebrow.tsx`
- `apps/web/components/marketing/level-chip.tsx`
- `apps/web/components/marketing/stat.tsx`
- `apps/web/components/marketing/method-step.tsx`
- `apps/web/components/marketing/live-pill.tsx`
- `apps/web/components/marketing/hero-curve.tsx`

### Marketing sections (Sprint B1)

- `apps/web/components/marketing/hero.tsx` — fully rewritten
  on the brief: 'Comprendre, pas seulement retenir.' with a
  LivePill badge, 'Réserver un cours gratuit' → /contact,
  'Voir les niveaux' → /levels, social proof, and the
  HeroCurve on a paper-grid background.
- `apps/web/components/marketing/learning-paths.tsx` — 4
  path cards reading from `LEARNING_PATHS`.
- `apps/web/components/marketing/teaching-method.tsx` — 3
  step cards reading from `METHOD_STEPS`.
- `apps/web/components/marketing/key-figures-band.tsx` — 3
  stats on a Bleu Plan surface, reading from `KEY_FIGURES`.
- The homepage `app/(marketing)/page.tsx` composes the new
  sections verbatim from the brief. FeaturesGrid /
  TutorPreview / Testimonials are no longer used.

### Marketing pages (Sprint B1)

- `apps/web/app/(marketing)/page.tsx` — new homepage (replaces
  the Sprint A version).
- `apps/web/app/(marketing)/about/page.tsx` — full rewrite on
  Intégrale copy.
- `apps/web/app/(marketing)/levels/page.tsx` (new) — one card
  per learning path with a 'Demander un devis' CTA.
- `apps/web/app/(marketing)/{pricing,contact,tutors,courses}/page.tsx`
  — metadata + page-header copy refreshed for the Intégrale brand.
- `apps/web/app/(marketing)/{tutors,courses}/[slug]/page.tsx`
  unchanged in shape (still backed by `services/{tutors,courses}.ts`).
- `apps/web/components/layout/site-footer.tsx` — full rewrite
  to a flat single-line footer per the brief ('Niveaux ·
  Tarifs · Contact · Mentions légales · © 2026 Intégrale').
- `apps/web/components/layout/site-header.tsx` — brand link
  aria-label is now 'Intégrale — Accueil'.

### SEO (Sprint B1)

- `apps/web/app/sitemap.ts` — `/levels` added to the static
  pages list.
- `apps/web/app/(marketing)/levels/page.tsx` — `ItemList`
  JSON-LD listing the four learning paths.

### Auth abstraction (Sprint B1)

- `apps/web/types/auth.ts` — `AuthProvider` interface, discriminated
  `AuthResult<T>`, `AuthSession`, `AuthSubscription`, input
  payloads (`SignInInput`, `SignUpInput`, `ResetPasswordInput`,
  `UpdatePasswordInput`, `VerifyOtpInput`).
- `apps/web/types/user.ts` — minimal `User` (id, email, fullName,
  createdAt) — kept separate from the richer `Profile`.
- `apps/web/types/errors.ts` — `AuthError` + `AuthErrorCode` + helper.
- `apps/web/services/auth/local-stub-auth-provider.ts` — B1
  implementation: persists users to `localStorage`, enforces an
  8-char minimum password, rejects duplicate e-mails, fakes 250ms
  latency, and emits state changes to subscribers. Stub-only —
  not a security boundary.
- `apps/web/services/auth/auth-provider-factory.ts` —
  `getAuthProvider()` with a module-level cache.
- `apps/web/services/auth/auth-context.ts` + `auth-react-provider.tsx`
  — the React provider and context.
- `apps/web/services/auth/use-auth.ts` — the `useAuth()` hook
  (the only public surface). Throws if used outside `<AuthProvider>`.

### Auth UI (Sprint B1)

- `apps/web/components/forms/login-form.tsx` — uses `useAuth()`.
- `apps/web/components/forms/register-form.tsx` — uses `useAuth()`.
- `apps/web/components/forms/forgot-password-form.tsx` — uses
  `useAuth()`.
- `apps/web/components/forms/reset-password-form.tsx` (new) —
  reads `?code=&email=`, runs `verifyOtp(recovery)`, then
  `updatePassword`.
- `apps/web/app/auth/layout.tsx` (new) — wraps every auth page
  in `<AuthProvider>`, renders a minimal header + centred `<main>`.
- `apps/web/app/auth/{login,register,forgot-password}/page.tsx` —
  stripped to bare page → form.
- `apps/web/app/auth/reset-password/page.tsx` (new).
- `apps/web/app/auth/verify-email/page.tsx` (new).

### API route handlers (Sprint B1)

- `apps/web/app/api/auth/route.ts` — POST (sign-in) and
  DELETE (sign-out) now delegate to the provider.
- `apps/web/app/api/auth/register/route.ts` — POST (sign-up)
  and PUT (password-reset) delegate to the provider.
- `apps/web/app/api/auth/verify-email/route.ts` — accepts
  `{ email, type, token }` and delegates to `verifyOtp`.
- `apps/web/app/api/auth/callback/route.ts` — validates
  `?code=` and redirects; B2 will add the real
  `exchangeCodeForSession`.

### Dashboard shell (Sprint B1)

- `apps/web/components/dashboard/sidebar.tsx` — vertical nav
  with `aria-current="page"` on the active item.
- `apps/web/components/dashboard/top-nav.tsx` — horizontal
  tab nav for screens < md.
- `apps/web/components/dashboard/header.tsx` — top bar with
  user name + 'Se déconnecter' button.
- `apps/web/components/dashboard/breadcrumbs.tsx` — a11y
  breadcrumb trail.
- `apps/web/app/dashboard/layout.tsx` — wraps the tree in
  `<AuthProvider>`, redirects to /auth/login when signed out,
  shows a loading state while the session is being read.
- `apps/web/app/dashboard/page.tsx` — full rewrite: greeting
  + 3 quick-link cards.
- `apps/web/app/dashboard/bookings/page.tsx` — placeholder
  EmptyState (replaces the Sprint A Supabase-driven page).
- `apps/web/app/dashboard/resources/page.tsx` (new) — placeholder.
- `apps/web/app/dashboard/profile/page.tsx` (new) — reads
  the auth session, renders the user info.

### Build-time safety (Sprint B1)

- `apps/web/app/dashboard/{page,bookings/page}.tsx` and
  `apps/web/app/admin/layout.tsx` opt out of static generation
  via `export const dynamic = 'force-dynamic'` so the build
  is offline-tolerant until B2 provisions the real Supabase
  env.

## Completed deliverables (Phase 2 — Sprint B1 i18n extension)

The i18n extension was added at the end of Sprint B1 to ship a
truly bilingual site (English + French) before Sprint B2 wires
the real Supabase auth. **Nothing architectural moved** — every
constraint in the original brief is preserved. Adding a third
language is a content operation (drop in `messages/<lang>.json`
and add the code to the locales list).

### i18n library + routing

- `apps/web/i18n.ts` — single source of truth: `locales =
  ['en', 'fr'] as const`, `defaultLocale = 'en'`,
  `Locale` type, `isLocale` type guard.
- `apps/web/package.json` — `next-intl@^4.13.1` installed.
- `apps/web/next.config.mjs` — `createNextIntlPlugin('./i18n.ts')`.
- `apps/web/middleware.ts` — composes `next-intl`
  (`createMiddleware`) with the existing Supabase session
  refresh. Matcher excludes `/api/*` and static assets.
- Sub-path routing: every marketing / auth / dashboard / admin
  page lives under `apps/web/app/[locale]/...`. The root
  `app/layout.tsx` becomes a pass-through; `app/[locale]/layout.tsx`
  owns `<html lang>`, fonts, the `<NextIntlClientProvider>` and
  the per-locale `<head>` metadata with `alternates.languages`
  hreflang.

### Translation files

- `apps/web/messages/en.json` and `apps/web/messages/fr.json`
  — parallel namespace trees: `Brand`, `Nav`, `SiteHeader`,
  `SiteFooter`, `Homepage`, `About`, `Levels`, `Pricing`,
  `Contact`, `Tutors`, `Courses`, `Auth.*` (login, register,
  forgot-password, reset-password, verify-email, layout),
  `Dashboard.*` (welcome, cards, sidebar, topNav, header,
  bookings, resources, profile), `Admin`, `NotFound`, `Error`,
  `Common`, `Validation`, `ApiErrors`, `ContactEmail`. Keys
  are stable; only values are translated.

### Brand module refactor

- `apps/web/lib/constants/brand.ts` is now *structural-only*:
  palette, fonts, legal name, contact/support emails, address,
  copyright year, social URLs. **No French copy.**
- `apps/web/lib/i18n/brand.ts` — `getBrandCopy(t)` reads the
  locale-specific tagline and OG copy from the messages map.
- `apps/web/lib/i18n/paths.ts` — `asArray` + `TLike` helpers
  (used by every component that needs to read a translated
  array).
- `apps/web/lib/i18n/nav.ts` — `getPrimaryNav(t)` and
  `getFooterLinks(t)` produce the locale-aware nav and footer
  link lists.
- `apps/web/lib/i18n/server.ts` — `getApiTranslator(req)` for
  route handlers that need to localise response strings; the
  locale is picked from the `NEXT_LOCALE` cookie (set by
  `next-intl` middleware) or the `Accept-Language` header.

### Language switcher

- `apps/web/components/layout/language-switcher.tsx` — small
  client component with two pill buttons (EN | FR). Active
  locale gets `aria-current="true"`. On click, it sets the
  cookie, strips the current locale prefix from the pathname,
  prepends the new locale, and calls `router.push` + `router.refresh`.
- Inserted in three places: the marketing header (desktop and
  mobile menu), the auth layout header, and the dashboard
  header. Keyboard-reachable, focus ring preserved,
  `aria-label="Language"` / `"Langue"`.

### Form / validation refactor

- `apps/web/lib/validations/auth.ts` and
  `apps/web/lib/validations/contact.ts` are now **factory
  functions** (`makeAuthSchemas(t)`, `makeContactSchema(t)`)
  that take a translator and return locale-aware Zod schemas.
  The structural shapes are preserved; only the error messages
  are now produced from the active locale.
- The form components build the schema with
  `useMemo(() => makeAuthSchemas(t), [t])` so the schema is
  stable per locale.
- The API route handlers (`/api/contact`, `/api/auth`,
  `/api/auth/register`) call the same factories with
  `getApiTranslator(req)`. JSON contract is unchanged
  (`{ ok: true }` or `{ error: { code, message } }`); only the
  `message` string is localised.

### Locale-aware middleware + redirects

- `apps/web/hooks/use-require-user.ts` — `requireUser()` and
  `requireProfile()` now redirect to `/${locale}/auth/login`
  where the locale is read from the `x-next-intl-locale`
  request header.
- `apps/web/app/[locale]/dashboard/layout.tsx` and
  `app/[locale]/admin/layout.tsx` — the client-side
  `router.replace` and the server-side `redirect` are
  locale-aware.
- `apps/web/components/forms/{login,register,forgot-password,reset-password}-form.tsx`
  — the `redirectTo` for the Supabase password-reset email is
  built with the active locale prefix so the magic link lands
  on `/fr/auth/reset-password` (or `/en/...`).

### Sitemap, robots, OG image, not-found

- `apps/web/app/sitemap.ts` — emits one entry per static
  route per locale, with `alternates.languages` populated for
  hreflang.
- `apps/web/app/[locale]/opengraph-image.tsx` — locale-aware
  1200×630 image; the tagline and footer line are translated.
- `apps/web/app/[locale]/not-found.tsx` — locale-aware 404
  with the active language.
- `apps/web/app/not-found.tsx` — root 404 reads the locale
  from the `x-next-intl-locale` header and renders the
  matching language.
- `apps/web/app/error.tsx` — global error boundary uses
  `useTranslations('Error')`.

### Tests

- `apps/web/components/layout/site-footer.test.tsx` —
  rewritten to wrap in `NextIntlClientProvider` and assert
  both EN and FR footer copy.
- `apps/web/components/dashboard/sidebar.test.tsx` —
  rewritten with the same wrapper; asserts `aria-current`
  on the active link.
- `apps/web/components/marketing/primitives.test.tsx` —
  rewritten to use the English translation file for the
  presentational labels.
- `apps/web/tests/unit/contact-schema.test.ts` — uses
  `makeContactSchema(fakeT)` with a fake translator.
- `apps/web/components/layout/language-switcher.test.tsx`
  (new) — 3 tests covering rendering, `aria-current` on the
  active locale, and the navigation on click.
- `apps/web/lib/constants/brand.test.ts` — rewritten to
  assert the structural brand fields only (palette, fonts,
  legal name, contact email) and the English translation file.

### Total tests

- **49/49** unit tests pass (10 previously, +3 for the
  language switcher; the existing tests were rewritten to be
  i18n-aware).

## Completed deliverables (Phase 2 — Sprint B2)

Sprint B2 wired the real Supabase project behind the B1
`AuthProvider` abstraction and reshaped the booking model
into the module-based design approved in the B2-3 schema
delta. The work splits into five pieces: schema, types,
provider, RLS tests, and integration test.

### Schema (B2-3)

- `supabase/migrations/20260709000000_booking_status_scheduled.sql`
  — adds `scheduled` to `booking_status`.
- `supabase/migrations/20260709000001_modules_enrollments.sql`
  — module-based model: 4 new tables (`modules`,
  `enrollments`, `module_progress`, `module_bookings`),
  `_bookings_legacy` (RLS off), reshape of `meeting_links`
  and `resource_grants`, 11 new RLS policies, 2 SECURITY
  DEFINER helpers (`is_admin`, `is_tutor_of_course`).

### Supabase wiring (B2-4 + B2-5)

- `apps/web/lib/env.ts` — central `publicEnv()` / `serverEnv()`.
  No other file calls `process.env` directly.
- `apps/web/lib/supabase/{client,server,admin}.ts` — every
  Supabase client reads from `lib/env.ts`. Browser + admin
  clients are untyped at the boundary; the read paths keep
  the typed `<Database>` generic.
- `apps/web/middleware.ts` — added the
  `SUPABASE_AUTH_PROVIDER` switch + optional-env defaults.
- `apps/web/services/auth/supabase-auth-provider.ts` —
  implements the B1 `AuthProvider` interface against
  `@supabase/supabase-js` 2.110.x. Returns the discriminated
  `AuthResult<T>` shape.
- `apps/web/services/auth/auth-provider-factory.ts` —
  selects `SupabaseAuthProvider` when
  `SUPABASE_AUTH_PROVIDER=supabase` (default), falls back to
  `LocalStubAuthProvider` when `local`.

### Module-based API (B2-4)

- `apps/web/services/enrollments.ts` +
  `apps/web/services/module-bookings.ts` — service layer.
- `apps/web/app/api/enrollments/route.ts` +
  `apps/web/app/api/enrollments/[id]/modules/route.ts` —
  enrollments + module list endpoints.
- `apps/web/app/api/module-bookings/route.ts` +
  `apps/web/app/api/module-bookings/[id]/cancel/route.ts` —
  booking + cancellation endpoints.
- The legacy `apps/web/app/api/bookings/**` routes are kept
  for the read-only transition window; they map to
  `_bookings_legacy`.

### Generated types

- `apps/web/types/database.generated.ts` — regenerated by
  `pnpm db:types` against the live database (18 tables,
  fully typed Row/Insert/Update).
- `apps/web/types/domain.ts` — adds `Module`, `Enrollment`,
  `ModuleBooking`, `ModuleProgress`,
  `EnrollmentWithCourse`, `ModuleBookingWithMeeting`.

### RLS smoke tests (B2-7)

- `supabase/tests/rls_smoke_setup.sql` — idempotent fixture
  (4 users, 1 course, 1 module, 2 enrollments, 1 booking,
  1 payment, 1 meeting link, 1 resource + grant).
- `supabase/tests/rls_smoke_assertions.sql` — 11 policy
  blocks; impersonates admin / tutor / student A / student B
  via `set_config('request.jwt.claim.sub', …, true)`.
- `supabase/tests/rls_smoke_teardown.sql` — drops the
  `rls_smoke` schema and the fixture rows.
- `supabase/tests/README.md` — how to run.
- `scripts/rls-smoke.sh` — CI wrapper
  (`scripts/rls-smoke.sh <env>`).

### Auth integration test (B2-8)

- `apps/web/tests/integration/auth-smoke.ts` — 9 assertions
  against the live Supabase project. Loads `.env.local`
  directly (no `dotenv`). Unique e-mail per run. Cleans up
  the test user on success.
- `apps/web/tests/integration/README.md` — how to run.

### Server-side session read

- `apps/web/app/[locale]/admin/layout.tsx` — server-side
  `requireProfile()` via `createSupabaseServerClient`; no
  more client-side bounce.
- `apps/web/app/[locale]/layout.tsx` — the
  `dynamic = 'force-dynamic'` opt-out is removed.

### Documentation

- `docs/architecture/Architecture.md` — B2-3 schema delta.
- `docs/architecture/{SYSTEM,AUTH,USER,ER}*.mmd` — updated
  diagrams.
- `docs/database/Database.md` — B2-3 tables + RLS.
- `docs/api/API.md` — 25 routes (was 21).
- `docs/BookingFlow.md` — module-based flow.
- `n8n/docs/WORKFLOWS.md` — module_*_id field shape.
- `supabase/config.toml` — B2-3 auth hooks.

### Total tests

- **49/49** unit tests pass (no new unit tests in B2 — the
  new test surface is integration, not unit).
- The live `auth-smoke.ts` (9 assertions) and
  `rls-smoke.sh` (11 policy blocks) are run on demand by
  the project lead against staging.

### Quality gates

- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (one pre-existing logger warning).
- `pnpm test` → 49/49 pass.
- `pnpm build` → 54 routes, exit 0.
- `scripts/rls-smoke.sh staging` → all 11 B2 RLS policies
  pass.
- `tests/integration/auth-smoke.ts` → all 9 assertions pass.

## Outstanding technical debt

See `docs/TechnicalDebt.md` for the full list (34 items). The
highest-impact items:

| ID | Item | Plan |
|---|---|---|
| TD-004 | Rate limiting (Upstash) | Phase 5 |
| TD-005 | PII redaction in logs | Phase 5 |
| TD-006 | GDPR data-export endpoint | Phase 5 |
| TD-007 | ClamAV file-upload scan | Phase 6 |
| TD-013 | Streaming SSR on `/dashboard` | Phase 2 |
| TD-015 | shadcn component set | Phase 2 |
| TD-026 | Vitest coverage ≥ 70% | Phase 6 |
| TD-027 | Playwright e2e | Phase 6 |
| TD-028 | k6 load test | Phase 6 |

## Known limitations (Sprint B → Sprint B2 → Sprint C)

- **Auth is real.** `SupabaseAuthProvider` (B2) is selected
  by the factory when the env is configured; the B1
  `LocalStubAuthProvider` is the fallback when
  `SUPABASE_AUTH_PROVIDER=local`. UI code is unchanged. The
  factory cache is preserved.
- **Dashboard redirect is server-side.** The B2 dashboard
  and admin layouts read the Supabase session cookie via
  `createSupabaseServerClient` and `redirect()` to the
  locale-aware `/auth/login` before the page tree is
  rendered. No more client-side `useEffect` bounce.
- **`Database` type is generated.** `pnpm db:types` against
  the live database writes a fully-typed
  `apps/web/types/database.generated.ts` (18 tables). The
  browser and admin clients are intentionally untyped at the
  factory boundary; the read paths in services cast to the
  strong `domain` types per CLAUDE.md §3.9.
- **Booking model is module-based.** `bookings` →
  `_bookings_legacy` (RLS off, retained read-only). The
  `enrollments` + `module_bookings` pair drive the student
  experience. 13 RLS policies (was 11 in B2) + 2 triggers
  (`fn_enrollments_refund`, `fn_module_unlock_check`) back
  the model and are verified by `scripts/rls-smoke.sh`.
- **End-to-end booking is wired (Sprint C).** Stripe
  Checkout (delegated to n8n), Calendly inline embed,
  Zoom S2S OAuth, Resend transactional email — the full
  flow runs against a mock-gated execution path (no
  destructive call when env is unset). The Next.js app
  does not call Stripe or Zoom directly on the booking
  path; it delegates to n8n per the locked architecture
  (CLAUDE.md §2.3).
- **No Lighthouse run yet.** Sprint B targets
  `Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, Best
  Practices ≥ 95`; this needs a Vercel preview URL to
  measure. The Calendly inline embed loads third-party JS
  (`assets.calendly.com`), which must be allowed by the
  CSP — `next.config.mjs` is updated in Sprint C to allow
  `script-src` and `frame-src` for that domain.
- **`pnpm db:types` is not run in CI.** It needs a live
  Supabase project. Tracked as a follow-up to add a
  `SUPABASE_DB_URL` GitHub Action secret.
- **`.env.example` contains real keys** (security incident,
  see `PHASE2_SPRINT_B2_SUMMARY.md` §7.1). The follow-up
  rotation + placeholder rewrite is **gated on explicit user
  instruction**.

## Known risks

| ID | Risk | Owner | Mitigation |
|---|---|---|---|
| R-01 | n8n becomes a SPOF | DevOps | Self-hosted + S3 backup + n8n.cloud fallback |
| R-02 | Stripe rate limits under load | Tech Lead | Restricted keys + n8n queue + Phase 5 rate limit |
| R-03 | Zoom S2S credential leak | SRE | Quarterly rotation + secret-scan in CI |
| R-04 | GDPR non-compliance at launch | PM | DPIA + Operations Guide in Phase 6 |
| R-05 | Tutor double-booking under high load | DBA | Trigger `fn_no_tutor_overlap` (in place) |
| R-06 | Zoom misses `meeting.ended` event | Tech Lead | Admin manual-complete route in Phase 4 |

## Next phase objectives (Phase 5 — Resources, polish, security)

- **Rotate the Supabase keys** in `.env.example` and rewrite
  the file to ship placeholders only (security incident, see
  B2 close-out §7.1). Explicitly gated on user instruction.
- **Wire `pnpm db:types` into CI** (via a
  `SUPABASE_DB_URL` GitHub Action secret).
- **Phase 5 — Resources + notifications + manual-complete
  session + Recordings storage** (the price-cents source of
  truth; the Excel importer is the v1 entry point; manual
  complete from the admin dashboard is in place).
- **Phase 6 — Rate limiting (Upstash), PII redaction,
  ClamAV file-upload scan, MFA, GDPR data-export endpoint**.
- **Phase 7 — E2E tests (Playwright), k6 load test,
  observability, deploy runbook**.

## Estimated overall progress

**~92%** of the project (Sprint A of Phase 2 = +8%, Sprint B1
= +8%, i18n = +1%, Sprint B2 = +16%, Sprint C = +25%,
Sprint 3.5 = +8%, Sprint 3.6 = +9%).

| Phase | Weight | % Complete |
|---|---|---|
| 1 | 17% | **17%** ✅ |
| 2 | 25% | **25%** ✅ (Sprint A + B1 + i18n + B2 + C done) |
| 3 | 25% | **25%** ✅ (shipped in Sprint C) |
| 4 | 17% | **17%** ✅ (shipped in Sprint 3.6 — admin dashboard + Excel import + v1 retirement) |
| 5 | 8% | 0% |
| 6 | 8% | 0% |

> **Note:** Phase 2 was re-weighted from 17% → 33% to reflect
> the B2 schema delta (the module-based booking model is a
> meaningful chunk of work that was not visible in the
> original estimate). The total project weight is unchanged at
> ~6.5 weeks.

## Sprint 8 plan

> **Read alongside `docs/review/PHASE2_SPRINT_8_SUMMARY.md`.**
> This section is the planning record; the summary file is the
> close-out record. Both live in the same project so the
> planning intent is preserved next to the actual result.

Sprint 8 is a **client-feature focused, low-risk completion
slice** that finishes three Phase-5 roadmap milestones (M5.1,
M5.3 read-path, M5.4) plus one notification-scale follow-on,
without touching any blocked business decision, any new SaaS,
or any client-owned legal process.

### S8-A — R-1 + R-2 Resources delivery surface

- **Goal.** Students see resources they are entitled to; admins
  manage resources.
- **Reuse.** `resources` + `resource_grants` schema (v2;
  `resource_grants.session_grant_id` FK is already in place per
  Sprint 3.6). The v2 `resources_select_visible` RLS policy
  joins `resource_grants.session_grant_id → session_grants
  → student_id = auth.uid()`. Existing `/api/resources` GET
  handles admin-all. Existing `/dashboard/resources/page.tsx`
  is the student page (currently shows only EmptyState — to be
  re-wired to fetch + render).
- **Add.** (1) `apps/web/services/resources.ts` — pure service
  layer with `listResourcesForCurrentUser()` (student scope) +
  `listAllResources()` (admin scope) + `createResource()` +
  `updateResource()` + `deleteResource()`. (2) `POST /api/admin
/resources` route (admin-only) and `PATCH /api/admin/resources
/[id]` + `DELETE /api/admin/resources/[id]`. (3) Re-wire
  `/dashboard/resources/page.tsx` to call the service and
  render the resource list (no schema change). (4) Add admin
  `/admin/resources/page.tsx` reusing `admin-list-page.tsx`.
- **No schema change. No new SaaS. No new env var.**

### S8-B — B-19 Manual-complete session

- **Goal.** Admins can mark a session booking as `completed`
  when Zoom misses `meeting.ended` (R-06 mitigation).
- **Reuse.** The `booking_status` enum already contains
  `completed`. `cancelSessionBooking` (services/curriculum
/session-bookings.ts) is the model for an update-with-status-
flip. The existing RSC pages for booking detail are dirty and
  out of scope for Sprint 8 — we add a dedicated
  `/admin/session-bookings` listing that exposes the manual-
  complete button, avoiding the dirty detail pages.
- **Add.** (1) `manualCompleteSessionBooking(id)` in services
/curriculum/session-bookings.ts — admin-only UPDATE that flips
  status from `scheduled`/`confirmed` to `completed`. (2)
  `POST /api/admin/session-bookings/[id]/complete` route with
  `requireAdminRoute()`. (3) Client component
  `manual-complete-button.tsx` that POSTs and refreshes. (4)
  A new admin RSC page `/admin/session-bookings/page.tsx` that
  lists bookings in `scheduled`/`confirmed` status with the
  manual-complete action.
- **No new status value. No schema change.**

### S8-C — N-3 Cursor-based pagination

- **Goal.** Add cursor pagination to `notifications` and
  `audit_logs` endpoints without breaking existing callers.
- **Reuse.** Sprint 7 already accepts `?before=<iso>` as a
  cursor on `/api/notifications`. We add an opaque
  base64-encoded `cursor` query parameter (preferred) AND
  keep the existing `before` parameter as a deprecated alias
  for backward compatibility. The cursor encodes the last
  seen `(sent_at, id)` tuple — `(id, created_at)` for
  audit_logs — so the page boundary is stable even when two
  rows share the same timestamp.
- **Add.** (1) New Zod schemas in `lib/validations/cursor.ts`
  for `cursorQuery` (base64-encoded JSON `{ts, id}` shape).
  (2) New helper functions `encodeCursor()` / `decodeCursor()`
  with strict size + shape checks. (3) Update
  `listMyNotifications` to accept `cursor` (preferred) and
  `before` (deprecated). (4) Add a new
  `listAuditLogs({ cursor, limit })` service in
  `services/admin/audit-logs.ts` plus
  `GET /api/admin/audit-logs`. (5) The GET `/api/notifications`
  response includes a `nextCursor: string | null` field;
  existing clients that ignore it keep working.
- **No schema change. No new SaaS. No new env var.**

### S8-D — R-3 Recordings dashboard read-path

- **Status.** **BLOCKED pending schema-change authorisation.**
  The current `meeting_links` table does NOT have a
  `recording_url` column (verified against
  `apps/web/types/database.generated.ts`). The Sprint 8 plan
  is to add one nullable column via a forward-only migration
  IF the user approves.
- **What will ship in S8-D (if the column is approved).** (1)
  A nullable column `meeting_links.recording_url text`. (2)
  Update `database.generated.ts` (regenerated via the project
  `pnpm db:types` flow; not via Sprint 8). (3) Read-path UI on
  the student session-detail page and (separately) on the
  admin session-booking-detail page — display the recording
  URL when present, "Recording not available yet" when null.
- **What is explicitly NOT in S8-D.** The Zoom
  `recording.completed` → n8n → `meeting_links.recording_url`
  write-back workflow. That work is deferred to a Phase 3
  sprint; we do NOT author n8n workflow JSON in Sprint 8.
- **STOP condition.** If the schema change is NOT authorised,
  S8-D is dropped from Sprint 8 entirely and the close-out
  reports it as deferred.

### Sprint 8 explicit non-goals (gated on prior decisions)

Per the Sprint 8 reconciliation report §B:

- No Upstash rate limiting (TD-004) — hardening, not client-
  facing, and requires a §2.4 SaaS exception.
- No `.env.example` key rotation (B2 §7.1 follow-up) —
  project-lead owned, not Sprint 8 scope.
- No `pnpm db:types` in CI — CI hygiene, not client delivery.
- No MFA, account-lockout, PII redaction, ClamAV, GDPR
  export, Vitest coverage project, Playwright suite, k6 load
  test — deferred to hardening sprints.
- No rebrand, no Tuteurs index/detail, no Tarifs page, no
  About page, no legal pages — all blocked on P0.x / P1.x /
  P2.x client decisions.
- No Pack 10 / Suivi mensuel / Stage / first-trial-free /
  discovery call / at-home — blocked on P1.x decisions.
- No breach-notification email mirror (D-7) and no late-cancel
  / no-show handling (E-1 / E-2 / E-3).
- No tutor-intake form (P3.2).
- No "Become a tutor" page.
- No n8n workflow JSON authoring for the deferred Phase 3
  items.
- No Sprint 9 work begins in Sprint 8.

### Schema-change gate encountered

- **S8-D recording_url column.** The migration is NOT written
  or applied in Sprint 8 without explicit user authorisation
  in this session. The close-out will document the gate.
- **S8-A / S8-B / S8-C.** No schema change required; all use
  existing tables, columns, and RLS policies.

---

## Last updated

**2026-09-12** by Sprint 10 close-out — I-1 n8n v2 webhook parity
and admin recipient hard-code. New `/api/n8n/notify` v2 email
renderer (admin_* templates ignore body `to`; recipient is the
hard-coded `ADMIN_NOTIFY_EMAIL` constant in
`apps/web/lib/constants/index.ts`). New
`/api/enrollments/by-calendly-invitee` Calendly → student
resolver. 8 of 9 n8n workflow JSON exports rewritten to the v2
shape (the 9th, `session-reminder-scheduler.json`, is the v2
live workflow and is **untouched** by design). Deprecated v1
`module-reminder-scheduler.json` is deleted. Two new v2 event
branches on `/api/webhooks/n8n` (`session_booking_rescheduled`,
`session_completed`) with the `IN ('scheduled', 'confirmed')`
idempotency guard. **R-3 is not implemented** (the
`meeting_links.recording_url` schema column is not added; the
Zoom `recording.completed` write-back is not authored) — the
S8-D gate from the Sprint 8 close-out remains open. **No
migration, no new SaaS, no new env var, no `.env.example`
change, no remote Supabase touch, no production n8n touch.**
All four quality gates are green: `pnpm type-check` ✓, `pnpm
lint` ✓ (1 pre-existing `lib/utils/logger.ts:31` warning
unrelated), `pnpm test` ✓ (**609 / 609** across **65** files,
**97 new I-1 tests** across 5 new test files; Sprint 9 ended
at 512 / 512 across 59), `pnpm build` ✓ (2 new routes
registered: 285 B + 286 B). Full close-out:
`docs/review/PHASE2_SPRINT_10_SUMMARY.md`. Tag
`v1.9.0-phase2-sprint-10` pending user approval.

### Sprint 10 — what landed (close-out summary)

- **I-1 n8n v2 webhook parity.** Two new server routes
  (`/api/n8n/notify` v2 email renderer +
  `/api/enrollments/by-calendly-invitee` Calendly → student
  resolver) replace the 6 workflow-managed Resend sends and
  the n8n-side invitee → student derivation. The
  `admin_dead_letter` + `admin_booking_confirmed` templates
  ignore the body `to` and use the hard-coded
  `ADMIN_NOTIFY_EMAIL` constant. **8 of 9** n8n workflow
  JSON exports rewritten to the v2 shape (v1 `module_*` /
  `enrollment_*` discriminators gone; v1
  `/api/meetings/by-booking/*` URL gone; `$env.ADMIN_NOTIFY_EMAIL`
  read gone). The 9th `session-reminder-scheduler.json` is
  the v2 live workflow and is **untouched** by design. The
  deprecated v1 `module-reminder-scheduler.json` is
  deleted. `/api/webhooks/n8n` gains two new v2 branches
  (`session_booking_rescheduled`, `session_completed`) with
  the `IN ('scheduled', 'confirmed')` in-band idempotency
  guard. **97 new I-1 tests** across 5 new test files
  (`n8n-webhook-v2.test.ts` × 11, `webhooks-stripe.test.ts`
  × 3, `webhooks-calendly.test.ts` × 5,
  `n8n-notify-route.test.ts` × 16, `n8n-workflows-shape.test.ts`
  × ~62, plus `by-calendly-invitee-route.test.ts`). Final
  total: **65 test files / 609 tests**. All four quality
  gates green. **No migration, no new SaaS, no new env
  var, no `.env.example` change, no remote Supabase touch,
  no production n8n touch.** **R-3 not implemented** — the
  `meeting_links.recording_url` column is not added; the
  Zoom `recording.completed` write-back workflow is not
  authored. R-3 remains a forward-only schema change gated
  on explicit user approval per CLAUDE §3.2.

---

**2026-08-27** by Sprint 8 close-out — Resources delivery
surface (R-1 + R-2), Manual-complete session booking (B-19),
and Cursor-based pagination for notifications + audit_logs
(N-3). **S8-D (R-3 Recordings read-path) was DROPPED from
Sprint 8** — it requires a `meeting_links.recording_url`
column addition that needs explicit user authorisation per
CLAUDE §3.2 (forward-only schema changes). The gate is
documented in §Schema-change gate below and re-stated in the
close-out. Full close-out:
`docs/review/PHASE2_SPRINT_8_SUMMARY.md`. Tag
`v1.9.0-phase2-sprint-8` pending user approval.

### Sprint 8 — what landed (close-out summary)

- **S8-A — Resources delivery surface (R-1 + R-2).** New
  `services/resources.ts` with `listResourcesForCurrentUser()`,
  `listAllResources()`, `createResource()`, `updateResource()`,
  `deleteResource()`. New admin API: `GET/POST /api/admin/resources`,
  `PATCH/DELETE /api/admin/resources/[id]`. New admin pages:
  `/admin/resources` (list) + create dialog. Student-facing
  `/dashboard/resources` page lists all visibility tiers the
  current user is entitled to (public + their own session-grant
  joins + admin).
- **S8-B — Manual-complete session booking (B-19).** New
  `manualCompleteSessionBooking()` in
  `services/curriculum/session-bookings.ts` returns a tagged
  union (`ok | already_terminal | not_found`). Idempotent —
  re-running on a completed booking is a no-op (`already_terminal`).
  New API: `POST /api/admin/session-bookings/[id]/complete`.
  New admin page: `/admin/session-bookings` lists non-terminal
  bookings (pending_payment/scheduled/confirmed) with a
  per-row "Mark complete" button.
- **S8-C — Cursor-based pagination (N-3).** New
  `lib/validations/cursor.ts` with base64-url opaque cursor
  encoding of `{ts, id}` tuples. Service layer emits the
  strict total-order predicate
  `(created_at < ts) OR (created_at = ts AND id < id)` to
  handle same-microsecond rows. Sprint 7's `?before=`
  parameter is preserved as deprecated (one release).
  Notifications + admin audit-logs surfaces return
  `{data, nextCursor}`. New admin API:
  `GET /api/admin/audit-logs` (admin-only, paginated, with
  optional `table_name` / `action` filters).
- **S8-D — Recordings dashboard read-path.** **NOT
  implemented in Sprint 8.** The schema column does not
  exist; per CLAUDE §3.2 the user must explicitly authorise
  a new migration. Plan remains documented at §S8-D above
  for a future sprint.

---

> **Sprint 7 (In-app Notification Feed — M5.2) is complete.**
> The `notifications` table is now consumed by the platform UI:
> every authenticated user (student + admin) sees a bell in the
> header with an unread count badge, a popover preview of the 5
> most recent notifications, and a "See all" link to the full
> feed at `/dashboard/notifications` (or `/admin/notifications`
> for admins). Per-row "mark as read" + bulk "Mark all as read"
> are wired through three new endpoints — `GET /api/notifications`,
> `POST /api/notifications/[id]/read`,
> `POST /api/notifications/read-all` — all backed by the existing
> RLS-respecting Supabase client. The service layer
> (`apps/web/services/notifications.ts`) re-checks ownership at
> the boundary so a future RLS regression does not leak
> ownership logic to the route layer. **No new SaaS, no new
> table, no new migration, no new env var, no change to the
> session-based payment model.** EN + FR translations are
> complete with an ICU-plural subline. E-1 / E-2 / E-3 / P1.2 /
> P1.4 / P1.6 / P3.3 / D-7 remain BLOCKED. All four quality gates
> are green: `pnpm type-check` ✓, `pnpm lint` ✓ (only pre-existing
> logger warning), `pnpm test` ✓ (46 files / **393 tests**, +38
> since Sprint 6 close-out), `pnpm build` ✓ (5 new routes
> registered). The next sprint is gated on explicit user
> approval.

> **Standalone-tutor refactor (2026-07-19) — final tutor
> architecture.** The Tutor model is now a flat reference table
> with **zero dependency on `auth.users`, `profiles`,
> `course_tutors`, or any auth flow**. There is no
> `auth.admin.createUser()` call anywhere that creates a tutor;
> the `createTutor` service inserts directly into the standalone
> `tutors` table using the regular server client. The
> `fn_lock_tutor_profile_id()` and `trg_tutors_lock_profile` are
> removed from the schema; every RLS policy that referenced
> `t.profile_id = auth.uid()` or the `course_tutors` join is
> rewritten. The session-booking flow reads
> `sessions.tutor_id` directly and 409s with
> `session_has_no_tutor` if the session is unassigned. The
> marketing persona surface (avatar / bio / rating / years /
> headline) is replaced with an operational contact card
> (full_name, email, phone, status, notes) on the public
> `/tutors/[uuid]` page. The course detail page no longer
> renders a "Tuteurs qui enseignent ce cours" block. The
> tutor RLS is admin-only. The full file list and rationale
> are in
> `docs/review/PHASE2_SPRINT_3.8_STANDALONE_TUTORS_SUMMARY.md`.
> All four quality gates are green after the refactor:
> `pnpm type-check` ✓, `pnpm lint` ✓, `pnpm test` ✓
> (35 files / 276 tests), `pnpm build` ✓. **The next sprint
> is gated on explicit user approval.**

> **Sprint 3.8 — Admin Manual CRUD is complete.** The admin
> dashboard is now a full CRUD console for the entire curriculum
> hierarchy plus a dedicated tutors directory. The post-sprint
> debug pass fixed all runtime errors (35 × `MISSING_MESSAGE:
> Admin.sessionCreate.fields.description`), added the missing
> i18n keys (6 × `Dashboard.labels.*`, `Admin.tutorCreate` full
> namespace, 4 × FR-only `programCreate/gradeCreate/programEdit/
> gradeEdit` namespaces brought to parity, 5 × `Checkout.*` /
> `Dashboard.module.*` keys), and shipped the **Create tutor**
> flow (validation schema + `createTutor` service using the
> service-role client to provision an `auth.users` row + a
> `profiles` row via the existing `handle_new_user` trigger +
> a `tutors` row + a `POST /api/admin/tutors` route + a Radix
> Dialog trigger wired into the `/admin/tutors` page header).
> The migration index
> (`docs/database/MIGRATIONS.md`) is now a single source of
> truth listing every forward-only migration in apply order.
> All four quality gates are green after the pass:
> `pnpm type-check` ✓, `pnpm lint` ✓, `pnpm test` ✓ (35 files /
> 276 tests), `pnpm build` ✓. The tutor scope reminder is
> preserved verbatim (no tutor dashboard, no tutor auth, no
> tutor-side flows in this version). **The next sprint is
> gated on explicit user approval.**

> **Sprint 3.6 — Admin Dashboard & Excel Curriculum Import is
> complete.** The platform has a working admin dashboard
> backed by the v2 session hierarchy and a one-shot Excel
> importer that bulk-inserts the real curriculum from the
> two `Integrale_cours_visio_130726_*.xlsx` workbooks. The
> admin shell (sidebar + top-nav + header + client layout)
> mirrors the dashboard pattern; the overview re-anchors on
> v2 counters; the catalog list + detail pages for
> `programs`, `grades`, `courses`, `chapters`, `sessions`,
> `payments`, `students` are all read-only; the catalog has
> create / edit forms for `courses`, `chapters`, `sessions`.
> Three new admin API endpoints (`POST /api/courses`,
> `POST /api/chapters`, `PATCH /api/sessions/[id]`) close
> the read-write loop. The Excel importer is fully
> data-driven (no hardcoded curriculum tokens), session
> prices are `NULL` for any cell with no price, and the
> importer is fully idempotent. The v1 module-based
> hierarchy is retired in a single forward-only migration
> (`20260715000000_drop_v1_back_compat_tables.sql`): 5 v1
> tables + 7 v1 triggers + 2 v1 functions + 9 v1 RLS
> policies + 13 v1 indexes + 6 v1 FK columns + the v1
> `module_progress_status` type + the `_bookings_legacy`
> view are all dropped. 16 v1 source files (services /
> components / email templates / tests) are deleted;
> `resource_grants` PK is re-anchored from `(resource_id,
> enrollment_id)` to `(resource_id, session_grant_id)`.
> The 3 `/api/bookings/*` 410 shims now point to v2
> endpoints. RLS v2 suite is wired into
> `scripts/rls-smoke.sh`. All four quality gates are green
> (`type-check`, `lint`, `test` = 153/153 pass across 24
> test files, `build` = ~70 static pages). See
> `docs/review/PHASE2_SPRINT_3_6_SUMMARY.md` for the full
> close-out. **The next sprint is gated on explicit user
> approval.**



