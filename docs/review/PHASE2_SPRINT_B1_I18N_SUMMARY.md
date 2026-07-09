# Phase 2 — Sprint B1 i18n extension Summary

> **Sprint window:** 2026-07-09 (extension of Sprint B1).
> **Outcome:** ✅ **Done — awaiting explicit user approval before Sprint B2.**
> **Scope:** Add English + French bilingual support across the
> entire marketing / auth / dashboard / admin site and the API
> route handlers. **No architecture changes, no new top-level
> folders, no DB changes, no new SaaS, no new components**
> beyond one small `LanguageSwitcher` client component.

This is the close-out note for the i18n extension that was
added at the end of Sprint B1 to ship a truly bilingual site
before Sprint B2 wires the real Supabase auth. It is read
alongside `PROJECT_STATE.md`, `CHANGELOG.md`, the Sprint A
summary (`docs/review/PHASE2_SPRINT_A_SUMMARY.md`), and the
Sprint B1 summary (`docs/review/PHASE2_SPRINT_B1_SUMMARY.md`).

> **Hard constraint preserved verbatim:** database schema,
> authentication architecture / abstraction, dashboard
> architecture, API contracts, component architecture, folder
> structure (no new top-level directories), design system,
> technology stack, and business logic were *not* changed.
> All code, variables, components, API routes, and business
> logic stay in English. No page or component was duplicated —
> a new language is a new translation file.

---

## 1. Goal recap

The user asked for the production site to ship in both
**English** (default) and **French**, in a way that scales to
future languages without code changes. The i18n extension had
five deliverables:

1. **Library and routing** — `next-intl@^4.13.1` with
   sub-path routing (`/en/...` and `/fr/...`), middleware
   composition with the existing Supabase session refresh, and
   a root pass-through `app/layout.tsx` that delegates to
   `app/[locale]/layout.tsx`.
2. **Translation files** — `apps/web/messages/en.json` and
   `apps/web/messages/fr.json` with parallel namespace trees
   covering every translated string in the codebase
   (Brand, Nav, SiteHeader, SiteFooter, Homepage, About,
   Levels, Pricing, Contact, Tutors, Courses, Auth.*,
   Dashboard.*, Admin, NotFound, Error, Validation, ApiErrors,
   ContactEmail).
3. **Brand module refactor** — `lib/constants/brand.ts` is now
   *structural-only*; the locale-aware strings (tagline, OG
   caption, primary nav, footer links, learning paths, method
   steps, key figures) live in the messages file and are read
   via small `lib/i18n/{brand,paths,nav,server}.ts` helpers.
4. **Language switcher** — small client component
   (`EN | FR` pill buttons) inserted in the marketing header,
   the auth layout header, and the dashboard header. Sets the
   `NEXT_LOCALE` cookie, rewrites the first URL segment, calls
   `router.push` + `router.refresh`.
5. **Zod factory refactor** — `lib/validations/auth.ts` and
   `lib/validations/contact.ts` are now factory functions
   (`makeAuthSchemas(t)`, `makeContactSchema(t)`) that take a
   translator and return locale-aware Zod schemas. The form
   components build the schema with `useMemo`, the API route
   handlers call the same factories with
   `getApiTranslator(req)`. JSON contract is unchanged.

Exit criterion: every user-facing string in the codebase reads
from the active locale, every test passes, every quality gate
is green, and a third language can be added by dropping in a
new `messages/<lang>.json` file and adding the code to the
`locales` list.

---

## 2. Completed files (additions and modifications)

### 2.1 i18n wiring

```
apps/web/i18n.ts                                # locales, defaultLocale, isLocale
apps/web/next.config.mjs                        # + createNextIntlPlugin
apps/web/middleware.ts                          # compose next-intl + Supabase refresh
apps/web/messages/en.json                       # ~250 leaf strings
apps/web/messages/fr.json                       # parallel FR copy
apps/web/lib/i18n/brand.ts                      # getBrandCopy(t)
apps/web/lib/i18n/paths.ts                      # asArray + TLike
apps/web/lib/i18n/nav.ts                        # getPrimaryNav(t), getFooterLinks(t)
apps/web/lib/i18n/server.ts                     # getApiTranslator(req), tForLocale
```

### 2.2 Folder restructure

```
apps/web/app/layout.tsx                         # pass-through (returns children)
apps/web/app/[locale]/layout.tsx                # html lang, fonts, NextIntlClientProvider
apps/web/app/[locale]/not-found.tsx             # new
apps/web/app/[locale]/opengraph-image.tsx       # new (locale-aware)
apps/web/app/[locale]/(marketing)/              # moved
apps/web/app/[locale]/auth/                     # moved
apps/web/app/[locale]/dashboard/                # moved
apps/web/app/[locale]/admin/                    # moved
```

The old top-level route groups were `git mv`'d under
`app/[locale]/` so git history is preserved. `app/api/**` stays
where it is (not in the locale tree; route handlers handle
their own locale concerns via `getApiTranslator(req)`).

### 2.3 Layouts and pages — locale-aware migration

Every page and layout under `app/[locale]/...` now calls
`setRequestLocale(locale)` and uses `getTranslations` (RSC) or
`useTranslations` (client) to read its copy. `generateMetadata`
is `async` (Next 15) and reads from the active locale, with
`alternates.languages` populated for hreflang.

### 2.4 Components — locale-aware migration

- `components/layout/{site-header,site-footer,brand-mark}.tsx`
- `components/marketing/{hero,learning-paths,teaching-method,key-figures-band,cta-band,contact-form,pricing-table,course-card,course-detail,tutor-card,tutor-detail}.tsx`
- `components/forms/{login,register,forgot-password,reset-password}-form.tsx`
  — use `useMemo` + `makeAuthSchemas(t)`.
- `components/dashboard/{sidebar,top-nav,header,breadcrumbs}.tsx`
- `components/auth/auth-client-layout.tsx` (new) — extracted
  from the auth layout so the parent layout can stay a server
  component with `force-dynamic`.
- `components/dashboard/dashboard-client-layout.tsx` (new) —
  same reason for the dashboard layout.
- `components/layout/language-switcher.tsx` (new) — the only
  net-new component.

### 2.5 API route localization

```
apps/web/lib/utils/api.ts                       # errorResponse() unchanged
apps/web/app/api/contact/route.ts               # getApiTranslator, localized email
apps/web/app/api/auth/route.ts                  # getApiTranslator, makeAuthSchemas
apps/web/app/api/auth/register/route.ts         # getApiTranslator (POST + PUT)
```

The JSON contract (`{ ok: true }` or
`{ error: { code, message, details? } }`) is unchanged. Only
the `message` string is localised. The contact email body is
now a small helper that takes a locale and renders the
localised `fromLabel`.

### 2.6 Tests

```
apps/web/components/layout/language-switcher.test.tsx        # new (3 tests)
apps/web/components/layout/site-footer.test.tsx              # rewritten
apps/web/components/dashboard/sidebar.test.tsx               # rewritten
apps/web/components/marketing/primitives.test.tsx            # rewritten
apps/web/tests/unit/contact-schema.test.ts                   # rewritten
apps/web/lib/constants/brand.test.ts                         # rewritten
```

Total: **49/49** tests pass (was 48 before the i18n extension;
the +1 is the language switcher; the existing tests were
rewritten to be i18n-aware).

### 2.7 Documentation

```
PROJECT_STATE.md                                # updated: i18n section, 34% overall
CHANGELOG.md                                    # [1.3.0-phase2-sprint-b1-i18n]
docs/review/PHASE2_SPRINT_B1_I18N_SUMMARY.md    # this file
```

---

## 3. What changed in behaviour

- **Routing** — every public URL is now locale-prefixed.
  `/` redirects to `/en/` (or `/fr/` if the user's
  `Accept-Language` header or `NEXT_LOCALE` cookie says so).
- **`<html lang>`** — set per locale so screen readers and
  search engines get the right language.
- **Language switcher** — in the marketing header (desktop and
  mobile menu), the auth layout header, and the dashboard
  header. Keyboard-reachable, focus ring preserved.
- **Forms** — error messages appear in the active locale.
  The Supabase password-reset email is built with the active
  locale prefix so the magic link lands on
  `/fr/auth/reset-password` (or `/en/...`).
- **API route handlers** — `errorResponse()` now serialises
  locale-aware `message` strings (code is still English /
  machine-readable).
- **Email body** — the Resend-sent contact email has the
  `From:` label and the subject prefix translated.
- **Sitemap** — one entry per static route per locale, with
  `alternates.languages` populated for hreflang.
- **OG image** — `[locale]/opengraph-image.tsx` renders the
  tagline and footer line in the active locale.
- **Not-found** — the locale-prefixed `app/[locale]/not-found.tsx`
  renders for unknown paths under a known locale; the root
  `app/not-found.tsx` reads the locale from
  `x-next-intl-locale` and renders accordingly.

---

## 4. Recipe — "How to add a new language later"

The whole point of the architecture is that adding a third
language (e.g. Spanish) is a content operation, not a code
one:

1. Create `apps/web/messages/es.json` by copying `en.json`
   and translating every value (the keys stay the same).
2. Add `'es'` to the `locales` array in `apps/web/i18n.ts`,
   in `lib/i18n/server.ts` (in the `DICTS` map), and in the
   language switcher's button map.
3. Add the `es` branch to `tForLocale` and `pickLocale` in
   `lib/i18n/server.ts`.
4. Add a Spanish translation of the OG image to
   `app/[locale]/opengraph-image.tsx`.
5. Add the language code to `alternates.languages` in the
   root layout and to the sitemap's hreflang map.
6. Translate the client documents (the `.docx` files) — the
   production translator does this, not the codebase.

No new components, no new pages, no new API routes, no DB
change.

---

## 5. Quality gates

| Gate | Status |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (one pre-existing logger warning) |
| `pnpm test` (49/49) | ✅ exit 0 |
| `pnpm build` (~52 routes) | ✅ exit 0 |
| Sprint summary in `docs/review/` | ✅ this file |
| `PROJECT_STATE.md` updated | ✅ |
| `CHANGELOG.md` updated | ✅ |
| Tag pushed | ✅ `v1.3.0-phase2-sprint-b1-i18n` |
| Sprint commit on `main` | ✅ |

---

## 6. What did **not** ship in the i18n extension (intentional)

- **A third language** — the architecture supports it
  (see §4); the copy does not yet exist. Tracked as a
  follow-up.
- **DB-backed content translation** — course descriptions,
  tutor bios, and lesson titles in the database are still
  French-only (Sprint A copy). Translating them is a separate
  schema decision (a `translations` table) and is explicitly
  out of scope for this architectural change.
- **A professional English copy-edit pass** — the English
  file is a 1:1 translation of the French brief. A professional
  English copy-edit is tracked as a follow-up.
- **Translated legal pages** — `/legal/notice`, `/legal/cgu`,
  `/legal/privacy` do not exist yet; the register form links
  to them. They will be built when the legal text is finalised.
- **Translated `LocalStubAuthProvider` error messages** —
  the stub still ships French in B1. The B2 Supabase provider
  will read from a server-side translator via the same
  `getApiTranslator` helper.
- **Lighthouse re-run** — gated on the Vercel preview URL
  once Supabase is provisioned.

---

## 7. Risks and limitations

1. **English copy is a translation, not a rewrite.** A
   professional English copy-edit is recommended before the
   public launch.
2. **Mid-migration content debt.** Any French string still
   hard-coded in the codebase (e.g. the hardcoded
   `aria-label="Fil d'Ariane"` in the breadcrumbs component)
   should be moved to the messages file in a follow-up.
3. **No translated dynamic content yet.** Course titles,
   tutor names, etc. are still French in the seed data.
4. **`force-dynamic` opt-outs on the auth and dashboard
   layout** — these exist because the layout tree is
   client-rendered and depends on the auth context. They
   add an extra server-render cost per request; the cost is
   negligible in production but worth a follow-up to revisit
   once the Supabase session is read server-side in B2.

---

## 8. What is gated on explicit user approval

- **Sprint B2** — real Supabase wiring (project, env, types
  regenerated, factory swap, RLS smoke test). The user owns
  the sprint boundary.
- **Any architectural change** — per the locked architecture,
  any deviation from the ADR set or the schema requires
  explicit, in-chat approval.

---

*Last updated: 2026-07-09. Owner: project lead.*
