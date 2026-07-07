# CHANGELOG

> All notable changes to this project are documented in this file.
> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repository scaffolding (pnpm workspaces, Next.js 15, Supabase, n8n).
- Documentation set (24 docs / diagrams) and 20 ADRs.
- Formal Phase 1 architecture review and remediation.

## [1.0.0-phase1] — 2026-07-07

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
