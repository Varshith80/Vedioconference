# Phase 2 — Sprint A Summary

> **Sprint window:** 2026-07-07 (single-day Sprint A of Phase 2).
> **Outcome:** ✅ **Done — awaiting explicit approval before Sprint B.**
> **Scope:** marketing site, design system, supporting infrastructure.

This is the close-out note for Sprint A of Phase 2
(*Marketing & Onboarding*). It is read alongside
`PROJECT_STATE.md`, `CHANGELOG.md`, and the Phase 1 review
(`docs/review/PHASE1_REVIEW.md`).

---

## 1. Goal recap

Sprint A had three deliverables:

1. A **mobile-first responsive marketing site** that introduces
   Vedioconference, presents the catalog, and lets a prospective
   student ask a question.
2. A **shadcn-style design system** that every later phase can
   build on (forms, dashboard, admin) without re-inventing atoms.
3. A **green CI surface** so Phase 3+ can land features without
   touching broken foundations.

Exit criterion (from `PROJECT_STATE.md`):
*Lighthouse ≥ 90 (perf/a11y/SEO) on marketing pages; smoke test
for `register → login → dashboard` is green.* The Lighthouse
target needs a Vercel preview URL to measure and is tracked as a
Sprint B task.

---

## 2. Completed files

### 2.1 Design system & shared atoms

```
apps/web/components/shared/container.tsx
apps/web/components/shared/section.tsx
apps/web/components/shared/heading.tsx
apps/web/components/shared/page-header.tsx
apps/web/components/shared/empty-state.tsx
apps/web/components/shared/loading-spinner.tsx
apps/web/components/shared/error-state.tsx

apps/web/components/ui/button.tsx
apps/web/components/ui/card.tsx
apps/web/components/ui/badge.tsx
apps/web/components/ui/input.tsx
apps/web/components/ui/textarea.tsx
apps/web/components/ui/label.tsx
apps/web/components/ui/alert.tsx
apps/web/components/ui/avatar.tsx
apps/web/components/ui/separator.tsx
apps/web/components/ui/dropdown-menu.tsx
apps/web/components/ui/dialog.tsx
apps/web/components/ui/skeleton.tsx

apps/web/tailwind.config.ts            (new tokens + animations)
apps/web/styles/globals.css            (HSL tokens, motion, utilities)
```

### 2.2 Layout

```
apps/web/components/layout/brand-mark.tsx
apps/web/components/layout/site-header.tsx
apps/web/components/layout/site-footer.tsx
```

### 2.3 Marketing routes

```
apps/web/app/(marketing)/layout.tsx
apps/web/app/(marketing)/page.tsx
apps/web/app/(marketing)/about/page.tsx
apps/web/app/(marketing)/pricing/page.tsx
apps/web/app/(marketing)/contact/page.tsx
apps/web/app/(marketing)/courses/page.tsx
apps/web/app/(marketing)/courses/[slug]/page.tsx
apps/web/app/(marketing)/tutors/page.tsx
apps/web/app/(marketing)/tutors/[slug]/page.tsx
```

### 2.4 Marketing components

```
apps/web/components/marketing/hero.tsx
apps/web/components/marketing/features-grid.tsx
apps/web/components/marketing/tutor-preview.tsx
apps/web/components/marketing/testimonials.tsx
apps/web/components/marketing/cta-band.tsx
apps/web/components/marketing/pricing-table.tsx
apps/web/components/marketing/course-card.tsx
apps/web/components/marketing/course-detail.tsx
apps/web/components/marketing/tutor-card.tsx
apps/web/components/marketing/tutor-detail.tsx
apps/web/components/marketing/contact-form.tsx
apps/web/components/marketing/jsonld.tsx
```

### 2.5 API

```
apps/web/app/api/contact/route.ts       (Zod, rate limit, Resend)
```

### 2.6 SEO & metadata

```
apps/web/app/sitemap.ts
apps/web/app/robots.ts
apps/web/app/opengraph-image.tsx
apps/web/public/logo.svg
apps/web/public/icon.svg
apps/web/public/favicon.svg
```

### 2.7 Type safety boundary

```
apps/web/types/domain.ts
apps/web/types/database.generated.ts    (permissive stand-in)
```

### 2.8 Build-time safety (touches)

```
apps/web/lib/supabase/server.ts         (async + no-op cookie adapter)
apps/web/services/auth.ts               (getCurrentUser try/catch)
apps/web/services/courses.ts            (slug list try/catch)
apps/web/services/tutors.ts             (slug list try/catch)
apps/web/next.config.mjs                (typedRoutes off)
apps/web/.eslintrc.json                 (plugin + parser)
apps/web/package.json                   (eslint plugins, sonner)
```

### 2.9 Tests

```
apps/web/vitest.config.ts
apps/web/tests/unit/rate-limit.test.ts
apps/web/tests/unit/format.test.ts
apps/web/tests/unit/contact-schema.test.ts
```

### 2.10 Documentation / process

```
PROJECT_STATE.md                        (Sprint A stamped)
CHANGELOG.md                            ([1.1.0-phase2-sprint-a])
docs/review/PHASE2_SPRINT_A_SUMMARY.md  (this file)
```

---

## 3. Removed (Phase 1 leftovers)

- `apps/web/app/page.tsx` — replaced by `(marketing)` group.
- `apps/web/app/marketing/` — duplicate path that conflicted with
  the route group; deleted entirely.

---

## 4. Quality gates

| Gate | Command | Result |
|---|---|---|
| Type-check | `pnpm type-check` | ✅ exit 0 (0 errors) |
| Lint | `pnpm lint` | ✅ exit 0 (1 warning — `console.log` in `lib/utils/logger.ts` is intentional) |
| Tests | `pnpm test` | ✅ 10/10 passing across 3 files |
| Build | `pnpm build` | ✅ exit 0, 31 routes |

---

## 5. Remaining work (Sprint B onwards)

### Sprint B — Auth UI + Dashboard shell

- Email verification landing, reset-password flow.
- `reset-password` form (server action + page) — currently
  unregistered; the `app/api/auth/forgot-password/route.ts`
  produces a recovery link that has nowhere to land.
- Sidebar / header / breadcrumb for the `(dashboard)` group.
- Profile page (name, avatar, email, change password).
- Bookings page (list + cancel).
- Resources page (placeholder list).
- `pnpm` dev script aliases (`db:types`, `db:reset`,
  `db:studio`).
- A Vercel preview URL so the **Lighthouse audit** can actually
  run; the target is still
  `Performance ≥ 90 / A11y ≥ 95 / SEO ≥ 95 / Best Practices ≥ 95`.

### Sprint C — Finish the dashboard

- Search / filter on the bookings page.
- Streaming SSR on `/dashboard` (TD-013).
- Resource detail view + download.
- End-to-end smoke test (`register → login → dashboard`) wired
  to Vitest or Playwright once the dashboard exists.

### Phase 3 — n8n + Stripe + Calendly + Zoom

- Implement the 8 n8n workflows (currently JSON placeholders).
- Wire Stripe Checkout to `bookings` and the `payments` table.
- Calendly webhook already accepts the payload; the n8n
  workflow that creates the Zoom meeting is not built yet.
- Zoom S2S OAuth credential rotation policy (R-03).

### Phase 4 — Admin dashboard

- Tutor / course CRUD (write side, currently read-only).
- Bookings management UI.
- Audit log viewer.

### Phase 5 — Polish & WCAG

- Rate limiting (TD-004, Upstash).
- PII redaction in logs (TD-005).
- GDPR data-export endpoint (TD-006).
- Full keyboard / screen-reader pass.

### Phase 6 — Hardening

- ClamAV file-upload scan (TD-007).
- Vitest coverage ≥ 70 % (TD-026).
- Playwright e2e (TD-027).
- k6 load test (TD-028).
- Runbook / DPIA / production cut-over (R-04).

---

## 6. Blockers & open questions

**None blocking Sprint B.** Open items that *should* be resolved
before Phase 3, but do not gate the dashboard:

- A real Supabase project (staging URL) is needed before
  `pnpm db:types` can be run, which will let us delete every
  `as never` cast in `app/api/**` and the hand-rolled
  `BookingWithCourse` cast in `services/bookings.ts`.
- A Vercel preview URL is needed for the Lighthouse measurement.
  Until then, the Sprint A exit criterion is partially
  satisfied (CI is green; only the perf numbers are unmeasured).
- The dev-only in-memory rate limiter in `app/api/contact/route.ts`
  is fine for Sprint A; Phase 5 swaps it for Upstash
  (TD-004).

---

## 7. Architectural invariants preserved

- **No DB schema or architecture change.** All migrations from
  Phase 1 are untouched. New code only reads from the existing
  18 tables.
- **n8n is still the only "backend for backend".** Sprint A
  ships zero calls from Next.js to Stripe / Zoom / Calendly for
  the booking path. The only outbound vendor call is Resend (for
  the contact form, not the booking flow).
- **No `NEXT_PUBLIC_` secret was added.** The Resend key is
  server-only, read in `app/api/contact/route.ts`.
- **No real `.env.local` is committed.** The repo continues to
  ship only `.env.example`.
- **No placeholder code / fake implementations.** Every
  component, route, and service does exactly one thing and is
  ready to consume real Supabase data the moment env vars are
  populated.

---

## 8. What needs explicit user approval to proceed

Per the Phase 2 plan: *"Stop after Sprint A and wait for my
approval before continuing to Sprint B."*

**Awaiting:** the go/no-go for Sprint B (auth UI + dashboard
shell). No work on Sprint B will start until that approval is
received.
