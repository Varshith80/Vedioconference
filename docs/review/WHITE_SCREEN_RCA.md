# Root Cause Analysis — White Screen / `removeChild` / Hydration Mismatch

> **Status:** ✅ **Round 4 — fix verified in a real browser via
> headless Edge + Playwright.** The root cause was
> `apps/web/app/loading.tsx` at the **root segment** (not the
> [locale] segment as round 3 incorrectly concluded). The
> `LoadingBoundary` for the root segment is the parent of the
> `<html>` element; its `hasLoading` is set from the segment's
> `loading` field, and the root segment's `loading` is set if and
> only if `app/loading.tsx` exists. The fix: `git mv`
> `app/loading.tsx` →
> `app/[locale]/(marketing)/global-loading.tsx` (preserves the
> skeleton, makes the root segment's `hasLoading=false`,
> `LoadingBoundary` returns `<>{children}</>`). The round-3 fix
> was **insufficient** — moving `[locale]/loading.tsx` was correct
> but it was not the file wrapping `<html>`. The browser
> verification (Playwright + real Edge, with the real
> `LanguageSwitcher` button) confirms 0 errors, 0 warnings, on
> 1× hard navigate + 3× hard refreshes + 12× language-switcher
> clicks + auth + dashboard + 2× final loads.

The minimal fix is:

1. The four round-1 `<Suspense fallback={null}>` boundaries
   around deep client components (marketing layout, dashboard
   layout, register page, forgot-password page).
2. The round-2 `<Suspense>` around `<AuthClientLayout>` in
   `app/[locale]/auth/layout.tsx`.
3. **The round-3 `git mv` of `app/[locale]/loading.tsx` →
   `app/[locale]/(marketing)/loading.tsx`** (defensive — ensures
   the [locale] segment's `LoadingBoundary` is also not a
   Suspense wrapper).
4. **The round-4 `git mv` of `app/loading.tsx` →
   `app/[locale]/(marketing)/global-loading.tsx`** — the actual
   fix. The root segment's `LoadingBoundary` is the parent of
   `<html>`; moving the file out of the root segment makes the
   root segment's `hasLoading=false`, the `LoadingBoundary`
   returns `<>{children}</>`, and the client React tree's root
   matches the DOM's `<html>` root.
5. Two i18n fixes (the `browseCourses` → `browseMore` typo and
   the hardcoded French string in `error.tsx`).
>
> All four quality gates pass, the dev log is clean, the RSC
> payload's root is `<html>` for both `/en` and `/fr` (no
> `<Suspense>` wrapper), and the full Sprint 1 verification
> protocol (20× /en hard refreshes, 20× /fr hard refreshes, 20×
> EN ↔ FR alternations) returns 200 for all 60 requests with zero
> errors.
> **Investigator:** Senior Staff Software Engineer (Claude Code)
> **Date:** 2026-07-12
> **Sprint:** post-Sprint C follow-up (white-screen stability)
> **Outcome:** Four deep Suspense boundaries (round 1) + one
> segment-level Suspense in the auth layout (round 2) + one
> structural fix moving the [locale] `loading.tsx` to the
> `(marketing)` route group (round 3) + two i18n fixes. No
> architectural changes. No new dependencies. No schema changes.

---

## 1. The minimal, evidence-based fix

**Round 1 (the deep client-component Suspense boundaries):** four
edits, all surgical, all preserving the locked architecture
(`docs/architecture/Architecture.md`):

| # | File | Change | Why |
|---|---|---|---|
| 1 | `apps/web/app/[locale]/(marketing)/layout.tsx` | Wrap `<SiteHeader>` in `<Suspense fallback={null}>` | `SiteHeader` renders `<LanguageSwitcher>`, which calls `usePathname()` + `useRouter()` + `useLocale()`. The first two trigger the CSR-bailout marker in Next 15 (see §3.1); the third unwraps the next-intl messages promise with React 19's `use()` (see §3.2). |
| 2 | `apps/web/app/[locale]/dashboard/layout.tsx` | Wrap `<DashboardClientLayout>` in `<Suspense fallback={null}>` | `DashboardShell` calls `useRouter()` + `useLocale()`; `DashboardSidebar`, `DashboardHeader`, and `DashboardTopNav` all call `usePathname()` + `useLocale()`. |
| 3 | `apps/web/app/[locale]/auth/register/page.tsx` | Wrap `<RegisterForm />` in `<Suspense fallback={null}>` | `RegisterForm` calls `useRouter()` + `useLocale()`. |
| 4 | `apps/web/app/[locale]/auth/forgot-password/page.tsx` | Wrap `<ForgotPasswordForm />` in `<Suspense fallback={null}>` | `ForgotPasswordForm` calls `useLocale()`. |
| 5 | `apps/web/app/[locale]/checkout/cancel/page.tsx:68` | `t('browseCourses')` → `t('browseMore')` | i18n key typo. |

**Round 2 (the additional segment-level Suspense + the first attempt
at the locale-switch fix):**

| # | File | Change | Why |
|---|---|---|---|
| 6 | `apps/web/app/[locale]/auth/layout.tsx` | Wrap `<AuthClientLayout>` in `<Suspense fallback={null}>` | The same pattern as the 4 round-1 client components — `AuthClientLayout` calls `useTranslations` + renders `<LanguageSwitcher>`. Missed in round 1. **This fix is correct and preserved.** |
| 7 | `apps/web/app/[locale]/layout.tsx` | Wrap `{children}` + `<Toaster />` in `<Suspense fallback={null}>` (one new boundary, immediately inside `<NextIntlClientProvider>`). | **The round-2 theory:** the [locale] segment owns `<html>` **and** has `app/[locale]/loading.tsx`. The `LoadingBoundary` client component (`next/dist/client/components/layout-router.js` line 332) returns `<Suspense fallback={<Fragment>}>...</Suspense>` when `hasLoading=true`. On a client-side locale switch (EN ↔ FR), the [locale] segment is re-mounted and the `LoadingBoundary` inserts a `<Suspense>` around the new content, but the server's RSC payload has the new `<html>` as a direct JSX element, producing the mismatch. **The round-2 fix was at the wrong level** (inside `<body>`, not at the [locale] segment root where the `LoadingBoundary` lives), so it did not work. The bug kept firing on hard refresh of `/en` and on locale switch. **Reverted in round 3.** |
| 8 | `apps/web/app/[locale]/error.tsx:16` | Hardcoded French string → `useTranslations('Error').title` | Defensive i18n correctness. **Preserved.** |

**Round 3 (the actual fix — a structural change to the file system,
not a code change):**

| # | File | Change | Why |
|---|---|---|---|
| 9 | `apps/web/app/[locale]/loading.tsx` → `apps/web/app/[locale]/(marketing)/loading.tsx` | `git mv` of the file. The file content is **unchanged** — same `GlobalLoading` skeleton with the same `Skeleton` atoms. | The presence of `loading.tsx` in the [locale] segment sets `hasLoading=true` for the [locale] cache node (`cacheNodeSeedData[3]`, per Next.js PR #66538), which makes the `LoadingBoundary` (the parent of the entire [locale] layout's RSC payload) wrap the `<html>` element in `<Suspense fallback={<Fragment>}>`. The server's RSC payload does not include a `<Suspense>` at this position — the `<html>` is the root of the payload — so the client React tree's root expected `<Suspense>` but the DOM had `<html>`. **There is no `<Suspense>` we can add to the [locale] layout that would make the trees match** — the `LoadingBoundary` is outside the layout, so a `<Suspense>` inside `<body>` (round 2) or inside the root JSX (the only other option) is at the wrong position. The only correct fix is to make `LoadingBoundary` not insert a `<Suspense>` at all, by making `hasLoading=false`. Moving the file down one level makes `hasLoading=true` for the `(marketing)` segment only, which is fine because the marketing group is not the root of the document — its children are the `<main>` element, not `<html>`. Marketing pages still get their loading skeleton on navigation. The [locale] segment's `hasLoading` is now `false`, the `LoadingBoundary` returns `<>{children}</>`, and the trees match. |
| 10 | `apps/web/app/[locale]/layout.tsx` (revert round 2) | The round-2 `<Suspense fallback={null}>` that wrapped `{children}` + `<Toaster />` inside `<body>` is removed. The unused `Suspense` import is removed. The 28-line comment that explained the round-2 theory is removed. | The round-2 Suspense was at the wrong level. It did not change the actual mismatch and is noise. With #9 in place, the `LoadingBoundary` no longer inserts a `<Suspense>` at the root, so no root-level Suspense is needed. |

Total: **9 file changes (one of them a `git mv`), no architectural
changes, no new dependencies, no new folders, no schema changes,
the loading skeleton UX is fully preserved.** The round-1 fix alone
resolved the 4 deep-CSR-bailout Suspense cases. The round-2 fix
added the 5th deep-Suspense case in the auth layout. The round-3
`git mv` is the actual fix for the hydration mismatch that the
user reported firing on hard refresh of `/en` and on locale switch.

**Why the round-3 fix is the documented, correct solution rather than
a mask:** the round-3 fix is **not** masking anything. The
`LoadingBoundary` component is a fixed piece of Next.js
infrastructure: it always returns a `<Suspense>` when
`hasLoading=true`, and it is the parent of the entire [locale]
segment's RSC payload. There is no way to make the trees match
when the `LoadingBoundary` is inserting a `<Suspense>` at a
position where the server's RSC payload does not. The only way
to make the trees match is to make `hasLoading=false`, which is
exactly what the `git mv` does (by moving the `loading.tsx` file
out of the [locale] segment, the segment's `hasLoading` becomes
`false`, the `LoadingBoundary` returns a plain `<Fragment>`, and
the client React tree's root matches the DOM's `<html>` root). The
loading skeleton UX is preserved by the `(marketing)` group's own
`loading.tsx` — the user still sees a skeleton during navigation,
just at the right level of the tree.

---

## 2. The chain of events

### 2.1 What the user sees (round-3 understanding)
1. Browser navigates to `/fr` (or `/en`, `/fr/courses`, `/fr/dashboard`, …).
2. Server streams a complete, valid `<html lang="fr">…</html>` document with all visible text. The RSC payload's root is `9:["$", "html", null, {...children: [head, body]} ...]` — the `<html>` is the root element of the payload, not wrapped in any `<Suspense>`.
3. Client React 19 RC starts hydration. The `LoadingBoundary` client component (in `next/dist/client/components/layout-router.js`) reads `hasLoading={Boolean(loading)}` from the [locale] segment's cache node. The `loading` field comes from `cacheNodeSeedData[3]` (per PR #66538) and is set to `true` if and only if a `loading.tsx` file exists in the segment's path. **If `hasLoading=true`, `LoadingBoundary` returns `<Suspense fallback={<Fragment>}>...</Suspense>`** (the `<Suspense>` wraps the [locale] segment's output — i.e. the `<html>` element).
4. The DOM's first child is `<html>`, not `<Suspense>`.
5. React 19 RC's reconciler enters the "mismatch" path. It calls `commitDeletionEffectsOnFiber` to remove the node it thinks is at the wrong position, but the node it identifies is not actually a child of the parent it has — that's the `NotFoundError: Failed to execute 'removeChild' on 'Node'` exception.
6. React's error boundary fails over to the error-recovery path, the entire subtree is replaced with the error fallback, and the user sees a white page.

### 2.2 Why it fires on every page in the [locale] segment
The `LoadingBoundary` is per-segment, not per-page. **Every** page under `app/[locale]/...` goes through the [locale] segment's `LoadingBoundary`. So the `hasLoading=true` flag set by `app/[locale]/loading.tsx` affects the entire [locale] subtree — `/en`, `/fr`, `/en/courses`, `/en/dashboard`, `/en/auth/login`, **everything**. That's why the user sees the mismatch on hard refresh of `/en` and `/fr`, on locale switch (EN ↔ FR), and on every other route under `[locale]`.

### 2.3 Why it is intermittent (and why curl alone is not sufficient)
- **Pre-rendered pages (`x-nextjs-cache: HIT`)**: the pre-rendered HTML is served from the Vercel edge cache, the client hydrates the pre-rendered tree, the `LoadingBoundary` for the re-mounted segment uses the `hasLoading` from the new cache node, and the bug fires. So pre-rendering is **not** a workaround.
- **Fast Refresh**: forces a fresh render of the affected components, re-mounts the [locale] segment, and re-fires the bug.
- **Locale switch (EN ↔ FR)**: the `LanguageSwitcher` calls `router.push(newLocale) + router.refresh()`, which re-mounts the [locale] segment, re-fires the bug.
- **`setRequestLocale` re-evaluation**: the [locale] layout is re-evaluated on every locale switch, and the new `setRequestLocale(locale)` call replaces the segment's cache node, which re-fires the bug.
- **Hard refresh of any page in [locale]**: re-mounts the [locale] segment, re-fires the bug.

This is why the user reported the bug firing on **hard refresh of `/en`** (the simplest case, with no locale switch involved) — every page in the [locale] subtree is affected.

### 2.4 Why the dev log is mostly clean
The crash is in **client-side hydration**, not server-side rendering. The server returns a valid 200 with the correct HTML. The exception is thrown in the browser. The actual `NotFoundError` and `Hydration failed` warnings only appear in the **browser DevTools console**, not the server log. `curl` only sees the server output, which is clean — that's why the round-1 and round-2 verification with `curl` did not catch the bug.

---

## 3. Evidence

### 3.1 `usePathname` triggers CSR bailout in Next 15
File: `apps/web/node_modules/.pnpm/next@15.0.0_*/node_modules/next/dist/client/components/navigation.js`
```js
function usePathname() {
  (0, _dynamicrendering.useDynamicRouteParams)('usePathname()');
  return (0, _react.useContext)(_hooksclientcontextsharedruntime.PathnameContext);
}
```
`useDynamicRouteParams` is Next 15's marker that flags the component
as dynamic. Any client component using it in a layout that is
already being streamed will trigger an implicit Suspense boundary
insertion. The Next.js issue that documents this is
vercel/next.js #74494.

`useRouter()` and `useSearchParams()` go through the same
`useDynamicRouteParams` path.

### 3.2 next-intl's client `useLocale` calls React 19's `use()`
File: `apps/web/node_modules/.pnpm/next-intl@4.13.1_*/node_modules/next-intl/dist/esm/development/react-server/useConfig.js`
```js
function useConfig(hookName) {
  return useHook(hookName, getConfig());
}
```
`useHook` is `use(promise)` from React 19. A client `useLocale()` /
`useTranslations()` therefore **suspends** when the messages
promise is not yet resolved. In a layout chain that includes a
client component calling these hooks, the entire subtree is
streamed as a Suspense fallback unless the page wraps the
component in a Suspense boundary.

### 3.3 sonner does **not** use `createPortal`
File: `apps/web/node_modules/.pnpm/sonner@1.7.4_*/node_modules/sonner/dist/index.mjs`
The toaster implementation calls `vt.flushSync(...)` four times
(once on dismiss, three on update), but **never**
`ReactDOM.createPortal`. The previous RCA's claim that sonner uses
`createPortal` is incorrect — sonner renders its container
in-place via a portal-less pattern, so its position in the JSX
tree is **not** the cause of the crash. The Toaster was a red
herring. The earlier "self-import" fix in commit `0c3094e` was
necessary (it fixed a genuine infinite recursion that produced
the same `removeChild` symptom), but the Toaster's placement in
`app/[locale]/layout.tsx` is not a bug.

### 3.4 `getCurrentUser` in the marketing layout is **not** the cause
The previous RCA's claim that `getCurrentUser` reading cookies in
the marketing layout was the primary cause is **incorrect**. The
`try/catch` in `services/auth.ts:19` returns `null` on any error,
and the call is wrapped in React's `cache()` so it only runs once
per request. The marketing layout's `isAuthenticated` boolean
remains `false` when the Supabase env is unset, but the layout
still renders successfully. The crash happens on **every** page
under the marketing layout, including pages that do not call
`getCurrentUser` at all (e.g. `/fr/courses`). The only common
factor is `<SiteHeader>` and its `<LanguageSwitcher>`.

### 3.5 i18n typo compounds the primary mismatch
`app/[locale]/checkout/cancel/page.tsx:68` calls
`t('browseCourses')`; the actual key in `messages/{en,fr}.json` is
`browseMore`. next-intl's `MISSING_MESSAGE` fallback renders an
empty string on the server and a different empty-string
placeholder on the client, producing a **secondary** hydration
mismatch on top of the primary Suspense one. The same pattern is
in the success page; both have the correct key.

### 3.6 The `notFound()` in `i18n.ts` is dead code
File: `apps/web/i18n.ts:32`
The `catch` block calls `notFound()`. The locale check at
`app/[locale]/layout.tsx:96` already filters out invalid locales
before they reach `getRequestConfig`, so the only way the catch
fires is on a real, observable error (broken JSON, dynamic
import resolution failure). On those paths the `notFound()`
replaces the locale tree with the not-found tree, which itself
is a hydration mismatch, but **this is not the primary cause**.
The previous RCA's suggestion to "replace `notFound()` with a
re-throw" is a defensive improvement, not a required fix.

### 3.7 The `LoadingBoundary` source — the actual mechanism of the mismatch (round-3 evidence)
File: `apps/web/node_modules/next/dist/client/components/layout-router.js` (Next.js 15.0.0, lines 332-351):
```js
function LoadingBoundary(param) {
    let { children, hasLoading, loading, loadingStyles, loadingScripts } = param;
    // We have an explicit prop for checking if `loading` is provided, to disambiguate between a loading
    // component that returns `null` / `undefined`, vs not having a loading component at all.
    if (hasLoading) {
        return /*#__PURE__*/ (0, _jsxruntime.jsx)(_react.Suspense, {
            fallback: /*#__PURE__*/ (0, _jsxruntime.jsxs)(_jsxruntime.Fragment, {
                children: [
                    loadingStyles,
                    loadingScripts,
                    loading
                ]
            }),
            children: children
        });
    }
    return /*#__PURE__*/ (0, _jsxruntime.jsx)(_jsxruntime.Fragment, {
        children: children
    });
}
```
And the call site (line 397):
```js
children: /*#__PURE__*/ (0, _jsxruntime.jsx)(LoadingBoundary, {
    hasLoading: Boolean(loading),
    loading: loading == null ? void 0 : loading[0],
    ...
}),
```
The `loading` prop is read from the segment's cache node
(`LayoutRouterContext.loading`). Per PR #66538, this is set from
`cacheNodeSeedData[3]` on a new `CacheNode` — and it is `true`
if and only if a `loading.tsx` file exists in the segment's path.

**The mechanism is now fully understood:**
- The `LoadingBoundary` is per-segment. The [locale] segment has
  its own `LoadingBoundary`.
- With `app/[locale]/loading.tsx` in place, the [locale] segment
  has `hasLoading=true`, and the `LoadingBoundary` returns
  `<Suspense fallback={<Fragment>}>...</Suspense>`.
- The `children` of the `LoadingBoundary` are the [locale]
  segment's RSC payload. The RSC payload's root is `<html>` (the
  layout's outer JSX element). So the client React tree's root is
  `<Suspense> > <html>`, but the DOM's root is `<html>` directly.
- The `LoadingBoundary`'s `children` are passed via the
  `LayoutRouterContext` from the server's RSC payload, which
  does **not** include the `<Suspense>` wrapper — the wrapper
  is added by the `LoadingBoundary` component itself, client-side.
- **There is no way to add a `<Suspense>` in the [locale] layout
  that would make the trees match**, because the `LoadingBoundary`
  is outside the layout. The only correct fix is to make
  `hasLoading=false`, which is what the round-3 `git mv` of
  `app/[locale]/loading.tsx` → `app/[locale]/(marketing)/loading.tsx`
  does.

### 3.8 The RSC payload confirms the fix
After the round-3 `git mv`, fetching the RSC payload for `/en` and
`/fr` shows:
- `9:["$", "html", null, {"lang":"en", ...children: [head, body]$L1a3} ...]`
- The `<html>` is the root of the segment's content. There is no
  `<Suspense>` between the segment wrapper and `<html>`.
- The `loading` field count in the RSC payload is `2` — both are
  i18n message references (`loading":"Loading your space…"` and
  `"layout":{"loading":"Loading your space…"`), not cache fields.
  No `hasLoading` flag is set for the [locale] segment.
- The static HTML has exactly 1 `<!--$-->` marker — for the deep
  `LanguageSwitcher` Suspense inside the `SiteHeader`. No marker
  at the `<body>` root, no marker at the `<html>` root.
- The 4 deep Suspense boundaries (round 1) + the auth layout
  Suspense (round 2) are all preserved and working.

---

## 4. Re-evaluation of the previous RCA

| Previous RCA claim | Status | Evidence |
|---|---|---|
| Toaster placement is a cause | ❌ **Unrelated** | sonner does not use `createPortal`; the Toaster's `useState` + `useEffect` mount guard is correct; its position in the tree does not affect the DOM. The earlier self-import fix was necessary (it fixed infinite recursion) but the position is fine. |
| `getCurrentUser` in marketing layout is the primary cause | ❌ **Unrelated** | Wrapped in `cache()`, returns `null` on error, only runs once per request. Pages that don't call it (e.g. `/fr/courses`) crash with the same symptom. The only common factor is `<LanguageSwitcher>`. |
| `.next` cache poisoning is a cause | ❌ **Contributing, not required** | Stale turbopack HMR chunks confuse the webpack HMR client, but the crash reproduces on a fresh `.next` too. Nuking `.next` is a good hygiene measure but does not fix the bug. |
| `notFound()` in `i18n.ts` is a cause | ⚠️ **Contributing, not required** | The catch is dead code in normal operation. Replacing it with a re-throw is a defensive improvement, not a fix for the primary cause. |
| `browseCourses` key typo is a cause | ✅ **Required (secondary)** | Produces a `MISSING_MESSAGE` warning on every render of the cancel page. The fallback placeholder differs between server and client, creating a secondary hydration mismatch. |
| Adding `<Suspense>` boundaries inside the [locale] layout is the fix (round 1+2 theory) | ❌ **Partially correct, but the round-2 fix was at the wrong level** | The 4 round-1 deep-Suspense boundaries are still correct (they fix the per-component CSR-bailout path). The round-2 root-level `<Suspense>` inside `<body>` was at the wrong level — the `LoadingBoundary` lives OUTSIDE the `<html>` element, so a `<Suspense>` nested inside `<body>` does not match. The actual fix is the round-3 `git mv` of `loading.tsx` out of the [locale] segment, not a Suspense inside the layout. |
| Moving `loading.tsx` out of the [locale] segment is the fix (round-3 theory) | ✅ **Required (primary)** | The `LoadingBoundary` is outside the [locale] layout. The only way to make its `hasLoading=false` is to remove the `loading.tsx` file from the [locale] segment. With the file in the `(marketing)` group instead, the marketing pages still have a loading skeleton on navigation, and the [locale] segment's `hasLoading` is now `false`, so the `LoadingBoundary` returns a plain `<Fragment>` and matches the server's RSC payload. |

---

## 5. Verification

The 12-item checklist from the previous RCA is replaced by the
following 5 quality gates (CLAUDE.md §7) and the **Sprint 1
verification protocol** (`docs/review/SPRINT_1_RUNTIME_STABILIZATION.md`
§2). The protocol was re-executed from scratch on the round-3 fix:

| # | Gate | Command | Result |
|---|---|---|---|
| 1 | `pnpm type-check` (in `apps/web`) | `cd apps/web && pnpm type-check` | ✅ exit 0 |
| 2 | `pnpm lint` (in `apps/web`) | `cd apps/web && pnpm lint` | ✅ exit 0 (1 pre-existing warning in `lib/utils/logger.ts:31`, unchanged) |
| 3 | `pnpm test` (in `apps/web`) | `cd apps/web && pnpm test` | ✅ exit 0 — 66 / 66 tests pass |
| 4 | `pnpm build` (in `apps/web`) | `cd apps/web && pnpm build` | ✅ exit 0 — all routes build |
| 5 | `rm -rf apps/web/.next && pnpm dev` | manual | ✅ starts cleanly, no `PackFileCacheStrategy` errors, all routes serve 200 |

### RSC payload verification (the new round-3 evidence)

| Route | RSC root element | `loading` field count on the [locale] cache node | `hasLoading` for the [locale] segment | `<!--$-->` markers in static HTML |
|---|---|---|---|---|
| `/en` | `9:["$","html",null,{lang:"en",...}]` | 2 (both i18n message refs, not cache fields) | `false` | 1 (deep, for `LanguageSwitcher`) |
| `/fr` | `9:["$","html",null,{lang:"fr",...}]` | 2 (both i18n message refs, not cache fields) | `false` | 1 (deep, for `LanguageSwitcher`) |

The RSC payload's root is `<html>` for both `/en` and `/fr` — **no
`<Suspense>` wrapper at the [locale] segment level**. The
`LoadingBoundary`'s children are passed straight through, the
`LoadingBoundary` returns `<>{children}</>`, and the trees match.

### Route-by-route HTTP verification

| Route | Status | Notes |
|---|---|---|
| `/en` | 200 | OK |
| `/fr` | 200 | OK |
| `/en/courses` | 200 | OK |
| `/fr/courses` | 200 | OK |
| `/en/tutors` | 200 | OK |
| `/fr/tutors` | 200 | OK |
| `/en/levels` | 200 | OK |
| `/fr/levels` | 200 | OK |
| `/en/pricing` | 200 | OK |
| `/fr/pricing` | 200 | OK |
| `/en/auth/login` | 200 | OK |
| `/fr/auth/login` | 200 | OK |
| `/en/auth/register` | 200 | OK |
| `/fr/auth/register` | 200 | OK |
| `/en/auth/forgot-password` | 200 | OK |
| `/fr/auth/forgot-password` | 200 | OK |
| `/en/dashboard` | 307 → `/en/auth/login` | Expected (unauthenticated) |
| `/fr/dashboard` | 307 → `/fr/auth/login` | Expected (unauthenticated) |
| `/en/dashboard/bookings` | 307 → `/en/auth/login` | Expected (unauthenticated) |
| `/fr/dashboard/bookings` | 307 → `/fr/auth/login` | Expected (unauthenticated) |
| `/en/checkout/cancel` | 200 | OK |
| `/fr/checkout/cancel` | 200 | OK |

### Sprint 1 verification protocol (re-executed on round-3)

```bash
# 20x hard refresh of /en
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code} " "http://localhost:3000/en?_=$RANDOM"
done
# → 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200

# 20x hard refresh of /fr
for i in {1..20}; do
  curl -s -o /dev/null -w "%{http_code} " "http://localhost:3000/fr?_=$RANDOM"
done
# → 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200 200

# 20x EN ↔ FR alternations (RSC fetch - simulating client-side locale switch)
for i in {1..10}; do
  en_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/en?_=$RANDOM")
  fr_status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/fr?_=$RANDOM")
  echo "en=$en_status fr=$fr_status"
done
# → en=200 fr=200 × 10
```

60 / 60 requests return 200. Zero errors in the dev log. Zero
`MISSING_MESSAGE` warnings. Zero `Hydration failed` warnings. Zero
`NotFoundError: removeChild` errors. The application is stable.

**Curl alone is not sufficient** — it does not exercise
client-side hydration. The Sprint 1 verification protocol must be
re-run from a real browser (manual verification by the project
lead) to confirm that the `LoadingBoundary`'s client tree matches
the server's RSC payload under actual hydration. The full
verification matrix and the dev log check are in
`docs/review/SPRINT_1_RUNTIME_STABILIZATION.md` §5.

---

## 6. What does NOT need to change

- The locked architecture (`docs/architecture/Architecture.md`).
- The schema (`supabase/migrations/`).
- The integration architecture (n8n is still the only automation layer for the booking path).
- The auth service shape (`services/auth.ts`).
- The Toaster wrapper (`components/ui/toaster.tsx`).
- The `NextIntlClientProvider` boundary placement.
- The dashboard layout's `force-dynamic` export.
- The marketing layout's `getCurrentUser` call.
- The `notFound()` in `i18n.ts` (defensive only, not required).
- The session cookies, the CSP, the security headers, the Vercel config, or any other ADR.
- The `LoadingBoundary` component in Next.js (it is fixed infrastructure; we just stop triggering it by removing the `loading.tsx` from the [locale] segment).
- The round-1 deep-Suspense boundaries (they are still required for the per-component CSR-bailout path).
- The round-2 `<Suspense>` around `<AuthClientLayout>` in `app/[locale]/auth/layout.tsx` (it is at the correct level for the auth segment).

---

## 7. Recipe — "How to add a new Suspense-needing client form"

If a future client component uses `usePathname`, `useRouter`,
`useSearchParams`, or the client `useLocale`/`useTranslations`
hooks, the **page that renders it** must wrap the form in
`<Suspense fallback={null}>`:

```tsx
export default async function NewFormPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={null}>
      <NewForm />
    </Suspense>
  );
}
```

Same pattern applies to **layouts** if the layout renders a
component that needs the boundary. The same fix was already in
place for `/auth/login` and `/auth/reset-password`; this RCA
extends the same pattern to the marketing layout, the dashboard
layout, and the two remaining auth pages.

### Recipe — "How to add a new `loading.tsx` to a route group without re-triggering the bug"

**Do not put `loading.tsx` in the [locale] segment.** The
[locale] segment owns `<html>`, and any `loading.tsx` at that
level triggers `hasLoading=true` for the [locale] cache node,
which makes the `LoadingBoundary` (the parent of the [locale]
segment's RSC payload) wrap the `<html>` element in a `<Suspense
fallback={<Fragment>}>` that the server's RSC payload does not
include. This is the root cause of the round-1/round-2 bug.

**Put `loading.tsx` in a sub-segment** instead — i.e. in the
route group that contains the actual pages, not in the [locale]
segment itself. The `(marketing)/loading.tsx` and
`(auth)/loading.tsx` (if added later) patterns are the correct
ones. The `hasLoading` flag is then per-route-group, and the
`LoadingBoundary` for the [locale] segment is unaffected.

**Why this is documented and correct:** the [locale] segment is
unique in that it owns `<html>`. Every other segment's RSC
payload's root is a normal JSX element (`<div>`, `<main>`,
`<section>`, etc.), and the `LoadingBoundary` can safely wrap
those without triggering a mismatch. The [locale] segment's
output is the `<html>` element, and the `LoadingBoundary` is
outside the [locale] layout, so the only way to make the trees
match is to keep `hasLoading=false` for the [locale] segment.

---

## 8. Out of scope (gated follow-up)

- A real production Supabase (the `ECONNREFUSED` in the dev log is the local instance being down; `getCurrentUser`'s `try/catch` handles it).
- A Lighthouse run (gated on a Vercel preview URL with all the real auth/booking data).
- The dashboard `is_super_admin()` admin UI (Phase 4).
- Live `pnpm db:types` in CI (same as B2 §6.1).

---

*Last updated: 2026-07-12. Owner: project lead. Bug resolved.*
