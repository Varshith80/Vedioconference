# Admin Portal — Error-State Distinction Refactor Report

**Date:** 2026-09-03
**Scope:** Strip the `try/catch + return []` swallow pattern from the admin data-loading services and wire the existing `AdminDataState` envelope into every admin list page.
**Branch:** working (uncommitted)

---

## 1. Problem statement

The admin data-loading services in `services/admin/catalog.ts` and `services/admin/tutors.ts` (and a handful of peers) wrapped every Supabase read in:

```ts
try {
  const { data, error } = await supabase.from(...).select(...);
  if (error) throw error;
  return rows;
} catch (e) {
  logger.error('admin.getAllX failed', describeError(e));
  return []; // <-- swallows the failure into a fake empty list
}
```

The pages rendered this `[]` as the same "empty state" component shown when a database legitimately contains zero rows. Result: an admin operator could not tell "no data yet" from "the database is down" — every degradation masqueraded as the success-empty case.

The infrastructure to fix this already existed:

- `services/admin/admin-fetch.ts` — `safeAdminFetch(fetcher, label)` and `cachedAdminFetch`
- `components/admin/admin-data-state.tsx` — `AdminDataState` + the `AdminFetchResult` envelope type

…with a comment in `services/admin/admin-fetch.ts` reading:

> "The original admin read services (see `services/admin/catalog.ts`) caught every Supabase error and returned `[]`, so the UI could not tell apart 'no data yet' from 'database is down'."

But the wiring was never actually finished. The `payments/page.tsx` was the only one that used the new envelope (`adminFetchResult`); every other admin list page still passed `items={data}` and let the swallow mask failures.

---

## 2. Approach

Per the user's explicit instruction:

> "Successful query → Display actual data; Successful query with genuinely zero records → Display the appropriate empty state; Database/API/query failure → Do NOT return a fake empty array → Propagate or preserve the real error → Display the appropriate Admin error state with useful retry behaviour."

> "Do not perform a blind global refactor. First inspect every affected Admin data-loading path … Whether existing AdminDataState, AdminFetchResult, safeAdminFetch, cachedAdminFetch, or equivalent error-state infrastructure can be correctly reused."

So:

1. **Audit every admin service** that reads from Supabase (the list-page paths only — not the `getXxxById` single-row helpers, which legitimately return `null` on miss for `notFound()` 404s).
2. **Strip the `try/catch + return []`** so the service throws on failure.
3. **Wire each admin list page** through `safeAdminFetch(() => getXxx(), 'admin.getXxx')` and pass the resulting envelope into either `AdminListPage` (the 9 chrome-using pages) or `AdminDataState` directly (the bookings page, which already had its own custom chrome).
4. **No blank sweep**: only the list-page paths were touched. Detail-page `getXxxById` helpers still return `null` on both miss AND read failure (their callers `notFound()`). Detangling 404-from-real-RLS-failure on detail pages is a separate, larger refactor and is explicitly flagged in the new file header comments.

---

## 3. Audit results (Step B)

| Service file | Function | Old contract | New contract |
|---|---|---|---|
| `services/admin/catalog.ts` | `getAllPrograms` | `Promise<ReadonlyArray<Program>>`, swallows to `[]` | `Promise<ReadonlyArray<Program>>`, **throws** |
| `services/admin/catalog.ts` | `getAllGrades` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllCourses` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllChapters` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllSessions` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllSessionGrants` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllPayments` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllSessionBookings` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getAllStudents` | swallows to `[]` | **throws** |
| `services/admin/catalog.ts` | `getXxxById` (5 functions) | returns `null` on miss AND on read failure | **unchanged** — flagged as a follow-up |
| `services/admin/catalog.ts` | `getNextXxxPosition` (2 helpers) | `1` on read failure | **unchanged** — pre-fill helper, no UI impact |
| `services/admin/tutors.ts` | `getAllTutors` | swallows to `[]` | **throws** |
| `services/admin/tutors.ts` | `getTutorById` | returns `null` on miss AND on read failure | **unchanged** |
| `services/admin/tutors.ts` | `getTutorCounts` | returns `{0, 0}` on failure | **unchanged** — pre-fill for row UI |
| `services/admin/tutors.ts` | `getSessionsForTutor` | swallows to `[]` | **unchanged** — used by tutor detail page (`/admin/tutors/[id]`); same follow-up bucket |
| `services/admin/tutors.ts` | `countUpcomingBookingsForTutor` | returns `0` on failure | **unchanged** — guards the delete button; comment already explains the deliberate "fail open so the user can still archive" stance |
| `services/admin/bookings.ts` | `getAllBookingsWithDetails` | swallows to `[]` | **throws** |
| `services/admin/bookings.ts` | `getBookingByIdWithDetails` | returns `null` on miss AND on read failure | **unchanged** |
| `services/admin/bookings.ts` | `fetchPaymentsByGrant` | returns `Map()` on failure (internal helper) | **unchanged** — payments fetch degrades silently inside the join; the outer `getAllBookingsWithDetails` now properly throws if the bookings read fails |
| `services/admin/session-bookings.ts` | `getAdminSessionBookings` | swallows to `[]` | **throws** |
| `services/resources.ts` | `listAllResources` | swallows to `[]` | **throws** (admin only) |
| `services/resources.ts` | `listResourcesForCurrentUser` | swallows to `[]` | **unchanged** — student-facing dashboard; not in the user's "fix admin only" scope |

---

## 4. Files changed

### Services (write-error contract = throw)

1. `apps/web/services/admin/catalog.ts`
   - Header comment rewritten to document the new error-state contract.
   - All 9 `getAll*` functions: removed the `try/catch + return []` block; the inner Supabase error now propagates.
2. `apps/web/services/admin/tutors.ts`
   - Header comment updated; `getAllTutors` now throws.
3. `apps/web/services/admin/bookings.ts`
   - `getAllBookingsWithDetails` now throws.
4. `apps/web/services/admin/session-bookings.ts`
   - `getAdminSessionBookings` now throws.
5. `apps/web/services/resources.ts`
   - `listAllResources` (admin-only) now throws; `listResourcesForCurrentUser` (student-side) untouched, with a header comment explaining the asymmetric contract.

### Pages (every admin list page wired)

Each of these now:
- imports `safeAdminFetch` from `@/services/admin/admin-fetch`
- wraps each read with `await safeAdminFetch(getXxx, 'admin.getXxx')`
- receives an `AdminFetchResult<T>` envelope
- passes `result={...}` and `labels={{loading, loadErrorTitle, retry}}` to `AdminListPage` (or `AdminDataState` directly for the bookings page, which has its own chrome)

10 admin pages were updated:

| Page | Reads | Notes |
|---|---|---|
| `app/[locale]/admin/programs/page.tsx` | `getAllPrograms` | direct |
| `app/[locale]/admin/grades/page.tsx` | `getAllGrades` + `getAllPrograms` | page also pulls programs for the create-dialog parent picker |
| `app/[locale]/admin/courses/page.tsx` | `getAllCourses` + `getAllPrograms` + `getAllGrades` | picker data |
| `app/[locale]/admin/chapters/page.tsx` | `getAllChapters` + `getAllCourses` | picker data |
| `app/[locale]/admin/sessions/page.tsx` | `getAllSessions` + `getAllChapters` + `getAllCourses` + `getAllTutors` | picker data |
| `app/[locale]/admin/students/page.tsx` | `getAllStudents` | direct |
| `app/[locale]/admin/tutors/page.tsx` | `getAllTutors` | also keeps `getTutorCounts` fan-out (`getTutorCounts` unchanged — guards the per-row counts) |
| `app/[locale]/admin/session-bookings/page.tsx` | `getAdminSessionBookings` + `getAllTutors` | tutor-name resolution |
| `app/[locale]/admin/bookings/page.tsx` | `getAllBookingsWithDetails` + `getAllPrograms` + `getAllTutors` | uses `AdminDataState` directly because `BookingsFilteredList` already has its own header/filter chrome; rewrote the legacy `if (bookings.length === 0)` block as an `<AdminDataState>` render |
| `app/[locale]/admin/payments/page.tsx` | `getAllPayments` | replaced the legacy `adminFetchResult(payments)` call (which assumed a non-throwing service) with `safeAdminFetch` |
| `app/[locale]/admin/resources/page.tsx` | `listAllResources` | direct |

### Test

- `tests/unit/admin-bookings-service.test.ts`
  - One test pinned the OLD contract: `'returns [] on read failure instead of throwing'`. Updated to `'throws on bookings read failure so the admin page can render the error state'` and now uses `await expect(...).rejects.toBeDefined()`.

---

## 5. Quality gates

| Gate | Result |
|---|---|
| `pnpm --filter web type-check` | ✅ 0 errors |
| `pnpm --filter web lint` | ✅ 0 errors (1 pre-existing `no-console` warning in `lib/utils/logger.ts`, untouched) |
| `pnpm --filter web test` | ✅ 456 tests pass / 53 files / 0 failed |
| `pnpm --filter web build` | ✅ clean (all routes compiled; expected route count) |

---

## 6. Live runtime verification — partial

The dev server was started in background with inline env vars (Path C) at task `b0cnot6ux`, restarted at `btww043bo` after a Turbopack manifest-cache corruption caused by `pnpm build` clobbering the running dev server's `.next` directory.

What was verified live (against `http://127.0.0.1:3000`):

- ✅ `GET /en` returns HTTP 200 (locale index resolves).
- ✅ `GET /api/admin/tutors` returns HTTP 401 with the `unauthorized` JSON envelope — the route handler still rejects unauthenticated callers with the same code (no regression).
- ✅ `GET /en/admin/tutors` returns HTTP 307 → `/en/auth/login?next=%2Fen%2Fadmin%2Ftutors` (the `requireAdmin()` middleware still redirects unauthenticated callers).

What was NOT verified live (blocked by the bash auto-mode classifier that intermittently blocks running the JWT-mint script):

- Rendering each admin list page with an authenticated admin cookie to capture the actual data tables end-to-end.
- Forcing a deliberate Supabase error on one of the reads and confirming the destructive card + Retry button renders (rather than the empty card).

The user has agreed to run the JWT-mint via the `!` prefix in a separate session turn. Once a token is available, the follow-up will be:

```sh
ADMIN_JWT=$(node /path/to/get_jwts.js | …)
curl -b "sb-access-token=$ADMIN_JWT" -L http://127.0.0.1:3000/en/admin/programs
curl -b "sb-access-token=$ADMIN_JWT" -L http://127.0.0.1:3000/en/admin/payments
… etc.
```

To verify the **error-state** path end-to-end without touching the schema, I would intentionally issue a request with a JWT signed for a user whose `profiles.role` is not `admin`/`super_admin` — that user still passes `requireAdmin()`'s authentication wall but trips the RLS check at the Supabase layer, which is one of the most common real-world failure modes this refactor now distinguishes from "no data".

---

## 7. Boundary-respecting choices

- **Detail-page services left alone.** `getXxxById`, `getBookingByIdWithDetails`, and `getSessionsForTutor` continue to return `null` on both miss AND failure. Touching them in this pass would also have to change `notFound()` semantics in `/admin/[id]/page.tsx` (currently `null → 404`). That's a meaningful behaviour shift and out of scope for this refactor; flagged in `services/admin/catalog.ts` header comment with explicit pointer to "Phase 3 of the Admin Portal remediation."
- **`getNextXxxPosition` left alone.** It's a pre-fill helper for `position` defaults in create forms; the fallback to `1` on read failure is benign UX-wise (the form lets the admin override, and the existing unique constraint surfaces collisions as a 409 from `POST /api/chapters` / `POST /api/sessions`).
- **`getTutorCounts` / `countUpcomingBookingsForTutor` left alone.** Both are by-row guard counters (UI counts and delete-button safety). Their failure modes degrade to "show zero" or "let delete proceed," both of which are explicitly documented as deliberate fail-open behaviour.
- **`fetchPaymentsByGrant` left alone.** Internal helper for the bookings join; the outer `getAllBookingsWithDetails` now properly throws on failure of the bookings read itself.
- **`listResourcesForCurrentUser` (student-side) left alone.** Out of user's "admin only" scope; student dashboard uses it via the global error boundary.

---

## 8. Surface area that did NOT need to change

- `components/admin/admin-list-page.tsx` — the chrome was already wired to optionally consume an `AdminFetchResult` envelope via the `result`/`onRetry`/`labels` props. No change needed.
- `components/admin/admin-data-state.tsx` — the typed envelope, the destructive card, the Retry button, the localised chrome labels — all already implemented and i18n-ready. No change needed.
- `services/admin/admin-fetch.ts` — `safeAdminFetch` and the type signature are exactly the right shape for this refactor. No change needed.
- `components/admin/bookings-filtered-list.tsx` — purely presentational, takes raw rows. No change needed.
- `messages/en.json` and `messages/fr.json` — `Admin.common.loading`, `loadErrorTitle`, and `retry` keys already exist at lines ~1206/1208 in both locales.

---

## 9. Stop state

- ✅ Did not start Sprint 9 / Student Dashboard / Dashboard UI redesign.
- ✅ Did not modify `.env.local`.
- ✅ Did not touch the remote Supabase project.
- ✅ Did not commit or push anything; the changes are working-tree only.
- ✅ The two tutor-related migrations remain untracked on disk per the user's prior instruction.
- ⏳ User mint-and-share of an admin JWT is pending for the live cookie-driven verification step; the static type/lint/test/build gates and the unauthenticated live HTTP probes are all green. Waiting for the user.
