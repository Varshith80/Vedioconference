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

**Phase 2 — Marketing & Onboarding** → **Sprint C done (awaiting approval)**.

## Current status

🟢 **Sprint C (Phase 3 end-to-end booking) is done.**
The booking flow is now wired end-to-end: a student enrolls
in a course (one Stripe payment covers all modules), then
books each module session through the Calendly inline embed;
n8n creates the Zoom meeting on `invitee.created`, persists
the `meeting_link` row, and triggers the
`module-booking-to-zoom` workflow's `module-confirmation-email`
sub-workflow which Resend-sends a transactional email with
the join URL. The `fn_module_unlock_check` trigger on
`module_bookings` enforces "module N+1 unlocks when module N
is completed". The `fn_enrollments_refund` trigger on
`payments` cascades `charge.refunded` to the linked
`enrollment` row. All 9 n8n workflows are real workflow JSON
(the 8 Phase 1 placeholders are deleted). All 6 email
templates are server-rendered React Email JSX, locale-aware
via the B1-i18n factory pattern. The Next.js app does **not**
call Stripe or Zoom directly on the booking path — it
delegates to n8n, per the locked architecture (CLAUDE.md
§2.3). `pnpm type-check` and `pnpm lint` are clean. Tests:
64/66 passing (2 pre-existing B1 `DashboardSidebar` failures,
unrelated to Sprint C). `pnpm build` was not run in this
environment (no `pnpm` in PATH) — the user is to run it
locally as part of the sign-off. **Awaiting explicit approval
before Phase 4 (admin dashboard).**

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
| **2** | Marketing site, auth UI, dashboard shell | ✅ Sprint A + B1 + i18n + B2 + C done | 2026-07-10 |
| 3 | n8n workflows, Stripe, Calendly, Zoom | ✅ Shipped in Sprint C | 2026-07-10 |
| 4 | Admin dashboard | ⏳ | — |
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

## Next phase objectives (Phase 4 — Admin dashboard)

- **Rotate the Supabase keys** in `.env.example` and rewrite
  the file to ship placeholders only (security incident, see
  B2 close-out §7.1). Explicitly gated on user instruction.
- **Wire `pnpm db:types` into CI** (via a
  `SUPABASE_DB_URL` GitHub Action secret).
- **Phase 4 — Admin dashboard** (CRUD for catalog, bookings,
  resources, manual-complete module sessions).
- **Phase 5 — Rate limiting (Upstash), PII redaction,
  ClamAV file-upload scan, MFA, GDPR data-export endpoint,
  recordings storage**.
- **Phase 6 — E2E tests (Playwright), k6 load test,
  observability, deploy runbook**.

## Estimated overall progress

**~75%** of the project (Sprint A of Phase 2 = +8%, Sprint B1
= +8%, i18n = +1%, Sprint B2 = +16%, Sprint C = +25%).

| Phase | Weight | % Complete |
|---|---|---|
| 1 | 17% | **17%** ✅ |
| 2 | 33% | **33%** ✅ (Sprint A + B1 + i18n + B2 + C done) |
| 3 | 33% | **33%** ✅ (shipped in Sprint C) |
| 4 | 17% | 0% |
| 5 | 8% | 0% |
| 6 | 8% | 0% |

> **Note:** Phase 2 was re-weighted from 17% → 33% to reflect
> the B2 schema delta (the module-based booking model is a
> meaningful chunk of work that was not visible in the
> original estimate). The total project weight is unchanged at
> ~6.5 weeks.

## Last updated

**2026-07-09** by the Sprint B2 close-out.
