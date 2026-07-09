# Phase 2 — Sprint B1 Summary

> **Sprint window:** 2026-07-08 → 2026-07-09.
> **Outcome:** ✅ **Done — awaiting explicit user approval before Sprint B2.**
> **Scope:** Intégrale brand system, marketing site, auth abstraction
> and UI, dashboard shell. **No Supabase, no Stripe, no Zoom, no
> Calendly, no n8n, no database changes.**

This is the close-out note for Sprint B1 of Phase 2
(*Marketing & Onboarding*). It is read alongside
`PROJECT_STATE.md`, `CHANGELOG.md`, and the Sprint A summary
(`docs/review/PHASE2_SPRINT_A_SUMMARY.md`).

> **Why a stub auth provider in B1?** The client has not yet
> provided the project email account to create the Supabase
> project, so the real `SupabaseAuthProvider` cannot be wired
> yet. Sprint B1 ships an `AuthProvider` *interface*, a
> `LocalStubAuthProvider` (persists users to `localStorage`,
> clearly labelled as stub-only), the four auth forms
> (login / register / forgot-password / reset-password), and a
> dashboard shell that consumes `useAuth()`. Sprint B2 swaps
> the factory for a `SupabaseAuthProvider` — every form, page,
> and component remains unchanged. **No production
> authentication ships in B1.**

---

## 1. Goal recap

Sprint B1 had four deliverables:

1. **Intégrale brand system** — palette, typography, glyph, and
   the single source-of-truth `brand.ts`.
2. **Marketing site** — homepage, About, Levels, Tutors,
   Pricing, Contact — all composed verbatim from the client
   brief, with SEO (sitemap, JSON-LD, OG image) updated.
3. **Auth abstraction and UI** — `AuthProvider` interface, stub
   implementation, four forms, verify-email and reset-password
   pages, API route handlers that delegate to the provider.
4. **Dashboard shell** — sidebar, top-nav, header, breadcrumbs,
   the dashboard home and three placeholder routes (bookings,
   resources, profile).

Exit criterion (from `PROJECT_STATE.md`): the four items above
are implemented, tested, documented; `pnpm type-check`,
`pnpm lint`, `pnpm test`, `pnpm build` are all green; no
architectural rule is violated (no real Supabase calls, no
stripe/zoom/calendly code, no schema changes).

---

## 2. Completed files

### 2.1 Brand system

```
apps/web/lib/constants/brand.ts        # brand module (replaces marketing.ts)
apps/web/lib/constants/brand.test.ts
apps/web/styles/globals.css             # HSL tokens + brand CSS vars
apps/web/tailwind.config.ts             # serif/mono font families
apps/web/app/layout.tsx                 # IBM Plex via next/font/google
apps/web/components/layout/brand-mark.tsx
apps/web/components/layout/brand-mark.test.tsx
apps/web/components/layout/site-header.tsx
apps/web/components/layout/site-footer.tsx
apps/web/components/layout/site-footer.test.tsx
apps/web/public/favicon.svg
apps/web/public/icon.svg
apps/web/public/logo.svg
apps/web/app/opengraph-image.tsx
```

### 2.2 Marketing primitives, sections, and pages

```
apps/web/components/marketing/section-eyebrow.tsx
apps/web/components/marketing/level-chip.tsx
apps/web/components/marketing/stat.tsx
apps/web/components/marketing/method-step.tsx
apps/web/components/marketing/live-pill.tsx
apps/web/components/marketing/hero-curve.tsx
apps/web/components/marketing/primitives.test.tsx
apps/web/components/marketing/hero.tsx
apps/web/components/marketing/learning-paths.tsx
apps/web/components/marketing/teaching-method.tsx
apps/web/components/marketing/key-figures-band.tsx
apps/web/components/marketing/cta-band.tsx
apps/web/components/marketing/index.ts
apps/web/app/(marketing)/page.tsx              # homepage
apps/web/app/(marketing)/about/page.tsx
apps/web/app/(marketing)/levels/page.tsx      # new
apps/web/app/(marketing)/pricing/page.tsx
apps/web/app/(marketing)/contact/page.tsx
apps/web/app/(marketing)/tutors/page.tsx
apps/web/app/(marketing)/courses/page.tsx
apps/web/app/sitemap.ts                       # /levels added
```

### 2.3 Auth abstraction

```
apps/web/types/auth.ts                       # AuthProvider interface
apps/web/types/user.ts
apps/web/types/errors.ts                     # AuthError + helper
apps/web/services/auth/local-stub-auth-provider.ts
apps/web/services/auth/local-stub-auth-provider.test.ts
apps/web/services/auth/auth-provider-factory.ts
apps/web/services/auth/auth-context.ts
apps/web/services/auth/auth-react-provider.tsx
apps/web/services/auth/use-auth.ts
```

### 2.4 Auth UI and API

```
apps/web/components/forms/login-form.tsx
apps/web/components/forms/register-form.tsx
apps/web/components/forms/forgot-password-form.tsx
apps/web/components/forms/reset-password-form.tsx   # new
apps/web/app/auth/layout.tsx                        # new
apps/web/app/auth/login/page.tsx
apps/web/app/auth/register/page.tsx
apps/web/app/auth/forgot-password/page.tsx
apps/web/app/auth/reset-password/page.tsx           # new
apps/web/app/auth/verify-email/page.tsx             # new
apps/web/app/api/auth/route.ts
apps/web/app/api/auth/register/route.ts
apps/web/app/api/auth/verify-email/route.ts
apps/web/app/api/auth/callback/route.ts
```

### 2.5 Dashboard shell

```
apps/web/components/dashboard/sidebar.tsx
apps/web/components/dashboard/sidebar.test.tsx
apps/web/components/dashboard/top-nav.tsx
apps/web/components/dashboard/header.tsx
apps/web/components/dashboard/breadcrumbs.tsx
apps/web/app/dashboard/layout.tsx
apps/web/app/dashboard/page.tsx
apps/web/app/dashboard/bookings/page.tsx
apps/web/app/dashboard/resources/page.tsx          # new
apps/web/app/dashboard/profile/page.tsx            # new
```

### 2.6 Test infrastructure

```
apps/web/tests/setup.ts                              # clears localStorage
apps/web/vitest.config.ts                            # setupFiles + widened glob
```

### 2.7 Documentation

```
PROJECT_STATE.md        # Sprint B complete (awaiting approval), ~33%
CHANGELOG.md            # [1.2.0-phase2-sprint-b1] — 2026-07-09
docs/review/PHASE2_SPRINT_B1_SUMMARY.md             # this file
```

---

## 3. What changed in behaviour

- **Brand** — every page, every public asset, every email
  template (when B2 adds them) now reads from `brand.ts`. The
  wordmark is `'Int∫grale'` with the `∫` as a font-serif
  letter, never as a decorative icon.
- **Homepage** — fully re-composed on the brief: Hero
  ("Comprendre, pas seulement retenir."), Section 01 (Parcours
  — 4 learning paths), Section 02 (Méthode — 3 steps), Chiffres
  clés (3 stats on Bleu Plan), CTA band ("Réserver un cours
  gratuit"). `FeaturesGrid` / `TutorPreview` / `Testimonials`
  are no longer rendered on the homepage (the components still
  exist for future sprints).
- **Auth** — login, register, forgot-password, reset-password
  all run through `useAuth()`. The reset-password page reads
  `?code=&email=` and runs `verifyOtp(type: 'recovery')`
  followed by `updatePassword()`. The API routes delegate to
  the provider so B2 only has to swap the factory return value.
- **Dashboard** — the layout wraps the tree in
  `<AuthProvider>`, redirects signed-out users to
  `/auth/login`, and shows a loading state while the session
  is being read. The dashboard home greets the user and links
  to bookings, resources, and profile. The three leaf pages
  show a clear "Sprint B2" placeholder explaining what will
  land next.

---

## 4. Quality gates

| Gate | Status |
|---|---|
| `pnpm type-check` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm test` (48/48) | ✅ |
| `pnpm build` (31 routes) | ✅ |
| Sprint summary in `docs/review/` | ✅ this file |
| `PROJECT_STATE.md` updated | ✅ |
| `CHANGELOG.md` updated | ✅ |
| Tag pushed | ✅ `v1.2.0-phase2-sprint-b1` |
| Sprint commit on `main` | ✅ |

---

## 5. What did **not** ship in B1 (intentional)

- **Real Supabase auth.** The `LocalStubAuthProvider` is stub
  only. `auth-provider-factory.ts` will be the one-line swap
  point in B2.
- **Real `getSession()` against Supabase.** The dashboard
  layout shows the stub session.
- **DB types regenerated against a live database.**
  `apps/web/types/database.generated.ts` is still the Sprint A
  stand-in. B2 will run `pnpm db:types` once the project
  exists.
- **RLS testing.** Not in scope for B1; B2 will run a
  per-table RLS smoke test as part of the auth wiring.
- **Stripe, Zoom, Calendly, n8n.** Untouched in B1; B3
  onwards. The architecture diagram in
  `docs/architecture/SYSTEM_ARCHITECTURE.mmd` is unchanged.
- **Schema changes.** Zero migrations touched.
- **No additional SaaS.** Per the locked architecture, no
  new vendors were introduced.
- **Lighthouse 90/95/95/95 measurement.** Requires the
  Vercel preview URL once Supabase is provisioned; tracked as
  a Sprint B2 task.

---

## 6. Risks and limitations

1. **Stub auth is not a security boundary.** Every code path
   uses `useAuth()`, so the production wiring is a one-line
   change. Still, the stub must not reach production — the
   factory gates the choice on an env flag in B2.
2. **Dashboard placeholder pages hide B2 work.** B2 will need
   to replace bookings / resources / profile with real
   data-driven pages; the placeholder copy is intentionally
   explicit about the B1 → B2 boundary.
3. **`/levels` page was added to the sitemap** but is the
   only purely marketing data change in this sprint.
4. **No new SEO review yet.** The OG image was redesigned but
   the full Lighthouse run is still gated on the Vercel
   preview URL.

---

## 7. What is gated on explicit user approval

- **Sprint B2** — real Supabase wiring (project, env, types
  regenerated, factory swap, RLS smoke test). The user owns the
  sprint boundary.
- **Any architectural change** — per the locked architecture,
  any deviation from the ADR set or the schema requires
  explicit, in-chat approval.

---

*Last updated: 2026-07-09. Owner: project lead.*
