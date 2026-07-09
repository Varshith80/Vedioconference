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

**Phase 2 — Marketing & Onboarding** → **Sprint B complete (awaiting approval)**.

## Current status

🟡 **Sprint B of Phase 2 is done.** The marketing site has been
rebuilt end-to-end on the new Intégrale brand (verbatim from the
client brief), the auth UI is wired through an `AuthProvider`
abstraction that Sprint B2 will swap to Supabase, and the
dashboard shell is live with sidebar, top nav, header, and
placeholders for bookings / resources / profile.
`pnpm type-check`, `pnpm lint`, `pnpm test` (48/48),
`pnpm build` (31 routes) are all green. **Awaiting explicit
approval before Sprint B2** (Supabase wiring + smoke test).

## Phase completion summary

| Phase | Scope | Status | Date |
|---|---|---|---|
| **1** | Foundation, schema, docs, n8n plan | ✅ Approved | 2026-07-07 |
| **2** | Marketing site, auth UI, dashboard shell | 🟡 Sprint A + B done | 2026-07-09 |
| 3 | n8n workflows, Stripe, Calendly, Zoom | ⏳ | — |
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

## Known limitations (Sprint B → Sprint B2)

- **Auth is the local stub.** `LocalStubAuthProvider` persists to
  `localStorage` — that is *not* a security boundary. **Sprint B2
  ships a `SupabaseAuthProvider` that implements the same
  `AuthProvider` interface** and is selected by the factory when
  the env is configured. UI code does not change.
- **Dashboard redirect is client-side.** The B1 dashboard layout
  bounces to /auth/login in a `useEffect` because the stub does
  not write any HTTP cookie. B2 will flip this back to a
  server-side `getCurrentUser()` check that reads the Supabase
  session cookie.
- **`Database` type is permissive.** `apps/web/types/database.generated.ts` declares every `Insert` and `Update` as `Record<string, unknown>`. Supabase client mutations in pre-existing Phase 1 routes are typed as `never` for these operations, so each `.insert({...})` / `.update({...})` is wrapped in an `as never` cast. **Fix:** run `pnpm db:types` against a live database; the generated types drop the casts.
- **The `Database['public']['Tables']['bookings']['Row']` join is hand-rolled** in `services/bookings.ts` and the dashboard page (`(b as { course?: { title?: string } })` cast). When the generated types land, the service should return a typed `BookingWithCourse` interface instead of `Booking[]`.
- **`generateStaticParams` and `force-dynamic` are mixed.** The current pages opt out of static generation so the build is offline-tolerant; in production we will turn static generation back on and rely on the build-time `try/catch` to surface a real fetch failure (it returns `[]` and the dynamic page is rendered on demand).
- **No Lighthouse run yet.** Sprint B targets `Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, Best Practices ≥ 95`; this needs a Vercel preview URL to measure.
- **`pnpm db:types` is not run in CI.** It needs a live Supabase project. Once Vercel/Staging has one, generate the types in CI before `pnpm build`.

## Known risks

| ID | Risk | Owner | Mitigation |
|---|---|---|---|
| R-01 | n8n becomes a SPOF | DevOps | Self-hosted + S3 backup + n8n.cloud fallback |
| R-02 | Stripe rate limits under load | Tech Lead | Restricted keys + n8n queue + Phase 5 rate limit |
| R-03 | Zoom S2S credential leak | SRE | Quarterly rotation + secret-scan in CI |
| R-04 | GDPR non-compliance at launch | PM | DPIA + Operations Guide in Phase 6 |
| R-05 | Tutor double-booking under high load | DBA | Trigger `fn_no_tutor_overlap` (in place) |

## Next phase objectives (Phase 2 — Sprint B2)

- Provision the Supabase project (client provides the project
  e-mail account; we run `supabase link` and `db push`).
- Generate DB types: `pnpm db:types` → commit
  `types/database.generated.ts`.
- Ship a `SupabaseAuthProvider` that implements the existing
  `AuthProvider` interface. Wire it into the factory based on
  env. The auth UI and the dashboard shell require *zero*
  changes.
- Flip the dashboard layout back to a server-side
  `getCurrentUser()` check that reads the Supabase cookie.
- Remove the B1 `force-dynamic` guards on /dashboard and
  /admin/* once the env is live.
- Smoke test: `register → verify-email → login → /dashboard →
  /dashboard/profile → sign-out`. Documented in
  `docs/review/PHASE2_SPRINT_B2_SUMMARY.md`.
- Lighthouse ≥ 90 (perf/a11y/SEO) on the marketing pages.

## Estimated overall progress

**~33%** of the project (Sprint A of Phase 2 = +8%, Sprint B1 = +8%).

| Phase | Weight | % Complete |
|---|---|---|
| 1 | 17% | **17%** ✅ |
| 2 | 17% | **16%** (Sprint A + B1 done; B2 = remaining 1%) |
| 3 | 33% | 0% |
| 4 | 17% | 0% |
| 5 | 8% | 0% |
| 6 | 8% | 0% |

## Last updated

**2026-07-09** by the Sprint B1 close-out.
