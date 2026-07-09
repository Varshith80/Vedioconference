# CHANGELOG

> All notable changes to this project are documented in this file.
> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0-phase2-sprint-b1] — 2026-07-09

### Added — Marketing & Onboarding (Sprint B1)

#### Brand system (Intégrale)
- `apps/web/lib/constants/brand.ts` — single source of truth for
  the Intégrale brand (palette, IBM Plex Serif/Sans/Mono, name,
  tagline, primary nav, footer links, 4 learning paths, 3 method
  steps, 3 key figures, copyright 2026).
- `apps/web/styles/globals.css` — refreshed HSL tokens to the
  client palette, `--brand-primary` / `--brand-accent` /
  `--brand-warning` CSS variables, `bg-paper-grid` (papier
  millimétré), `live-pill-dot` keyframes.
- `apps/web/tailwind.config.ts` — `fontFamily` extended with
  `serif` (Plex Serif) and `mono` (Plex Mono) stacks.
- `apps/web/app/layout.tsx` — `next/font/google` loads IBM Plex
  Sans / Serif / Mono and exposes them as CSS variables.
- `apps/web/components/layout/brand-mark.tsx` — `'Int∫grale'`
  wordmark; the `∫` is a *letter* (font-serif), not a
  decorative icon. `tone: 'default' | 'invert'`, three sizes.
  Single `aria-label` on the root, inner spans `aria-hidden`.
- `apps/web/public/{favicon,icon,logo}.svg` — Vélin/light and
  Bleu Plan/dark `∫` glyph variants.
- `apps/web/app/opengraph-image.tsx` — 1200×630 with Bleu Plan
  gradient, `∫` glyph card, wordmark, tagline, Ambre Surligneur
  accent dot.

#### Marketing primitives
- `apps/web/components/marketing/{section-eyebrow,level-chip,stat,method-step,live-pill,hero-curve}.tsx`.

#### Marketing sections & homepage
- `apps/web/components/marketing/{hero,learning-paths,teaching-method,key-figures-band}.tsx` —
  all composed verbatim from the client brief.
- `apps/web/app/(marketing)/page.tsx` — new homepage on the
  brief: Hero, Section 01 (Parcours), Section 02 (Méthode),
  Chiffres clés, CTA. FeaturesGrid / TutorPreview /
  Testimonials removed from the page (components still in the
  codebase for future sprints).

#### Marketing pages
- `apps/web/app/(marketing)/about/page.tsx` — full rewrite on
  Intégrale copy.
- `apps/web/app/(marketing)/levels/page.tsx` (new) — one card
  per learning path with a 'Demander un devis' CTA.
- `apps/web/app/(marketing)/{pricing,contact,tutors,courses}/page.tsx`
  — metadata + page-header copy refreshed for the Intégrale brand.
- `apps/web/components/layout/site-footer.tsx` — full rewrite
  to a flat single-line footer per the brief.
- `apps/web/components/layout/site-header.tsx` — brand link
  aria-label is now 'Intégrale — Accueil'.

#### SEO
- `apps/web/app/sitemap.ts` — `/levels` added to the static
  pages list.
- `apps/web/app/(marketing)/levels/page.tsx` — `ItemList`
  JSON-LD listing the four learning paths.

#### Auth abstraction
- `apps/web/types/{auth,user,errors}.ts` — `AuthProvider`
  interface, discriminated `AuthResult<T>`, `AuthSession`,
  `AuthSubscription`, input payloads, `User`, `AuthError` +
  `AuthErrorCode`.
- `apps/web/services/auth/local-stub-auth-provider.ts` — B1
  implementation: persists users to `localStorage`, enforces an
  8-char minimum password, rejects duplicate e-mails, fakes
  250ms latency, emits state changes to subscribers. Stub-only.
- `apps/web/services/auth/auth-provider-factory.ts` —
  `getAuthProvider()` with a module-level cache.
- `apps/web/services/auth/{auth-context,auth-react-provider,use-auth}.{ts,tsx}` —
  the React provider, context, and `useAuth()` hook.

#### Auth UI
- `apps/web/components/forms/{login,register,forgot-password,reset-password}-form.tsx`
  — every form now uses `useAuth()` (the reset-password form is
  new).
- `apps/web/app/auth/layout.tsx` (new) — wraps every auth page
  in `<AuthProvider>`, renders a minimal header + centred
  `<main>`.
- `apps/web/app/auth/{login,register,forgot-password}/page.tsx`
  — stripped to bare page → form.
- `apps/web/app/auth/reset-password/page.tsx` (new).
- `apps/web/app/auth/verify-email/page.tsx` (new).

#### API route handlers (on the auth provider)
- `apps/web/app/api/auth/route.ts` — POST sign-in, DELETE
  sign-out delegate to the provider.
- `apps/web/app/api/auth/register/route.ts` — POST sign-up,
  PUT password-reset delegate to the provider.
- `apps/web/app/api/auth/verify-email/route.ts` — accepts
  `{ email, type, token }` and delegates to `verifyOtp`.
- `apps/web/app/api/auth/callback/route.ts` — validates `?code=`
  and redirects; B2 will add the real `exchangeCodeForSession`.

#### Dashboard shell
- `apps/web/components/dashboard/{sidebar,top-nav,header,breadcrumbs}.tsx`.
- `apps/web/app/dashboard/layout.tsx` — wraps the tree in
  `<AuthProvider>`, redirects to /auth/login when signed out,
  shows a loading state while the session is being read.
- `apps/web/app/dashboard/page.tsx` — full rewrite: greeting +
  3 quick-link cards.
- `apps/web/app/dashboard/bookings/page.tsx` — placeholder
  EmptyState (replaces the Sprint A Supabase-driven page).
- `apps/web/app/dashboard/resources/page.tsx` (new) — placeholder.
- `apps/web/app/dashboard/profile/page.tsx` (new) — reads the
  auth session.

#### Tests
- `apps/web/components/layout/{brand-mark,site-footer}.test.tsx`
  — 6 tests.
- `apps/web/components/marketing/primitives.test.tsx` — 9 tests.
- `apps/web/services/auth/local-stub-auth-provider.test.ts` —
  11 tests.
- `apps/web/components/dashboard/sidebar.test.tsx` — 2 tests.
- `apps/web/lib/constants/brand.test.ts` — 10 tests.
- `apps/web/tests/setup.ts` — vitest setup that clears
  `localStorage` between tests.

### Changed
- Dashboard and admin pages opt out of static generation via
  `export const dynamic = 'force-dynamic'` so the build is
  offline-tolerant until B2 provisions the real Supabase env.

### Removed
- `apps/web/lib/constants/marketing.ts` — replaced by
  `brand.ts`.

### Quality gates
- `pnpm type-check`: ✅
- `pnpm lint`: ✅
- `pnpm test`: ✅ 48/48
- `pnpm build`: ✅ 31 routes

## [1.1.0-phase2-sprint-a] — 2026-07-07

### Added
- **Supabase schema** — 8 idempotent migrations, 18 tables, 7 enums,
  RLS on every public table, 5 triggers, 3 storage buckets.
- **Next.js 15** application skeleton — App Router, RSC, typed routes.
- **Auth** — Supabase Auth, JWT in `httpOnly Secure SameSite=Lax` cookies,
  middleware + admin layout + role helpers.
- **API surface** — 21 route handlers (auth, profile, courses, tutors,
  bookings, resources, admin, webhooks, health).
- **Forms** — login, register, forgot-password (react-hook-form + Zod).
- **UI primitives** — Button, Toaster; Tailwind + shadcn design tokens.
- **n8n** — 8 workflows designed and documented
  (`n8n/docs/WORKFLOWS.md`); 8 JSON placeholders in
  `n8n/workflows/`.
- **Documentation** — README, PROJECT_STATE, PROJECT_INDEX,
  PROJECT_HEALTH, PHASES, DECISIONS, architecture (4 Mermaid
  diagrams), database, API, folder structure, deployment,
  environment, security, coding standards, error handling,
  logging, monitoring, disaster recovery, booking flow, technical
  debt, Phase 1 review + remediation.
- **CI** — GitHub Actions: `ci.yml` (lint, type-check, test, build),
  `codeql.yml` (weekly + per-PR), `secret-scan.yml` (gitleaks).
- **Scripts** — `db-push.sh`, `db-types.sh`, `db-url.sh`,
  `deploy-n8n.sh`.
- **Security** — CSP, HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  in `next.config.mjs`; signature verification on Stripe, Calendly,
  n8n webhooks; `webhook_events` table for replay safety;
  constant-time responses on `register` and `forgot-password` to
  prevent user enumeration.

## [1.1.0-phase2-sprint-a] — 2026-07-07

### Added — Marketing & Onboarding (Sprint A)
- **Design system & shared atoms** — `Container`, `Section`,
  `Heading`, `PageHeader`, `EmptyState`, `LoadingSpinner`,
  `ErrorState` under `apps/web/components/shared/`. shadcn-style
  `Button`, `Card`, `Badge`, `Input`, `Textarea`, `Label`, `Alert`,
  `Avatar`, `Separator`, `DropdownMenu`, `Dialog`, `Skeleton`
  primitives under `apps/web/components/ui/`.
- **Tailwind theme** — `sm/md/lg/xl/2xl` mobile-first breakpoints,
  brand-indigo + success + warning tokens, `fade-in` / `fade-up` /
  `accordion-down` animations, container config in
  `tailwind.config.ts`.
- **Global CSS** — HSL design tokens, `prefers-reduced-motion`,
  `brand-gradient` / `mesh-gradient` utilities, `text-balance`,
  `text-pretty`, skip-link utility in `styles/globals.css`.
- **Layout** — `BrandMark` (inline-SVG logo), `SiteHeader` (sticky
  transparent-to-solid with mobile sheet), `SiteFooter` with legal
  links.
- **Marketing routes** — landing, about, pricing, contact, courses
  list & detail, tutors directory & detail under
  `apps/web/app/(marketing)/`. RSC, `revalidate=60`,
  `generateMetadata` for SEO, `generateStaticParams` for catalogs.
- **Marketing components** — `Hero`, `FeaturesGrid`, `TutorPreview`,
  `Testimonials`, `CtaBand`, `PricingTable`, `CourseCard`,
  `CourseDetail`, `TutorCard`, `TutorDetail`, `ContactForm`,
  `JsonLd`.
- **Contact API** — `POST /api/contact` with Zod validation,
  in-memory rate limit (5/hr/IP), honeypot field, Resend send.
- **SEO** — `app/sitemap.ts` (static + dynamic `courses`/`tutors`
  slugs), `app/robots.ts` (disallows `/dashboard`, `/admin`,
  `/api`, `/auth`), `app/opengraph-image.tsx` (1200×630 Edge
  runtime), `Organization` / `Course` / `Person` JSON-LD.
- **Type safety boundary** — `apps/web/types/domain.ts` (strong
  `Course`, `Tutor`, `Profile`, `Booking`, `Payment`, `Resource`,
  `MeetingLink`, `Notification` types). `apps/web/types/database.generated.ts`
  permissive stand-in with `Relationships: []` to keep postgrest-js
  type machinery stable until `pnpm db:types` runs against a live
  database.
- **Build-time safety** — `createSupabaseServerClient` is now
  `async` (Next 15 `cookies()` is async) and falls back to a
  no-op cookie adapter outside a request scope. Public-data
  queries (`getAllPublishedCourseSlugs`,
  `getAllPublishedTutorSlugs`, `getCurrentUser`) wrapped in
  `try/catch` returning safe defaults so the build is offline-
  tolerant. Data-driven marketing pages opt out of static
  generation with `export const dynamic = 'force-dynamic'`.
- **Tests** — `vitest.config.ts` + 10 unit tests across
  `rate-limit`, `format`, `contact-schema`. All passing.

### Changed
- **Form components** (`login`, `register`, `forgot-password`) —
  import the browser Supabase client directly (`@/lib/supabase/client`)
  instead of the barrel, avoiding `next/headers` in the client
  bundle. `z` is now type-only.
- **Marketing forms** — `import type { z }` and `use client`
  directive in `contact-form.tsx`.
- **Pricing table** — removed unused `Container` / `Section` /
  `Heading` imports.
- **Webhook handlers** (`stripe`, `calendly`, `n8n`) — `as never`
  boundary casts on Supabase mutations to bridge the permissive
  `Database` type until generated types land; Calendly signature
  parser is now type-safe.
- **Route handlers** (`bookings/[id]/cancel`, `courses/[slug]`) —
  Next 15 `params: Promise<{...}>` awaited.
- **`pnpm` config** — added `@typescript-eslint/eslint-plugin` and
  `@typescript-eslint/parser` (the ESLint config referenced these
  rules but the plugins were missing). `next.config.mjs` keeps
  `serverActions.bodySizeLimit = '2mb'`; `typedRoutes` experimental
  flag turned off until href unions are typed end-to-end.
- **`PROJECT_STATE.md`** — phase table updated, Sprint A
  deliverables listed, known limitations surfaced.

### Removed
- `apps/web/app/page.tsx` — replaced by the `(marketing)` route
  group.
- `apps/web/app/marketing/` — leftover Phase 1 path that conflicted
  with the new `(marketing)` group.

### Quality gates
- `pnpm type-check` → exit 0.
- `pnpm lint` → exit 0 (1 warning on `console.log` in
  `lib/utils/logger.ts` — by design).
- `pnpm test` → 10/10 passing.
- `pnpm build` → exit 0 (31 routes, mix of static and dynamic).

[Unreleased]:                  # phase-2 / sprint-b
[1.0.0-phase1]: 2026-07-07
[1.1.0-phase2-sprint-a]: 2026-07-07
