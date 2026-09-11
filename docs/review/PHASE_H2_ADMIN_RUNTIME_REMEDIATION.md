# Phase H2 — Admin Portal Runtime Remediation — Final Report

> **Scope:** authenticated Admin Portal runtime sweep on the local
> dev stack (Next.js 15 dev server on `127.0.0.1:3001`, local
> Supabase on `127.0.0.1:54321`, seeded data). Sprint boundary is
> not advanced. No commit / push was performed during this phase.
>
> **Hard constraints preserved:** No Sprint 9 work, no new SaaS, no
> remote Supabase migration, no commit / push without explicit user
> approval. The two pre-existing tutor-related migrations remain
> uncommitted.

---

## 1. Pages tested (authenticated, runtime)

All probes ran against `http://127.0.0.1:3001` with the
`sb-127-auth-token` SSR cookie populated from a freshly minted
admin JWT (`webvedioconference@gmail.com` / `WebVedio@999`).

| Page | URL | HTTP | Empty hint | Raw keys | MISSING_MESSAGE | Expected rows actually rendered |
|---|---|---|---|---|---|---|
| Overview (root) | `/en/admin` | 200 | no | 0 | 0 | `/api/admin/overview` returns `{students:1, courses:3, chapters:9, sessions:9, sessionGrants:0, sessionBookings:0}` |
| Programs | `/en/admin/programs` | 200 | no | 0 | 0 | "High School" visible |
| Grades | `/en/admin/grades` | 200 | no | 0 | 0 | "Grade 11" visible |
| Courses | `/en/admin/courses` | 200 | no | 0 | 0 | "Mathématiques", "Physique", "Français" all visible |
| Chapters | `/en/admin/chapters` | 200 | no | 0 | 0 | "Module 1" visible |
| Sessions | `/en/admin/sessions` | 200 | no | 0 | 0 | "Module 1" + "Module 2" visible |
| Session bookings | `/en/admin/session-bookings` | 200 | **yes (correct)** | 0 | 0 | Table empty by design (DB row count = 0) |
| Tutors | `/en/admin/tutors` | 200 | no | 0 | 0 | "Demo Tutor", "tutor@example.com" visible |
| Students | `/en/admin/students` | 200 | no | 0 | 0 | "Demo Student" visible |
| Bookings | `/en/admin/bookings` | 200 | **yes (correct)** | 0 | 0 | Table empty by design (DB row count = 0) |
| Payments | `/en/admin/payments` | 200 | **yes (correct)** | 0 | 0 | Table empty by design (DB row count = 0) |
| Resources | `/en/admin/resources` | 200 | **yes (correct)** | 0 | 0 | Table empty by design (DB row count = 0) |

Locale parity confirmed for `/fr/admin/...` (all 200, identical data,
localized titles).

## 2. Features tested (authenticated, runtime)

| Feature | Endpoint / surface | Result |
|---|---|---|
| Authenticated list read | `GET /api/admin/tutors?limit=50` | 200, returns 4 rows after probe insert |
| Tutor CREATE | `POST /api/admin/tutors` | 201, returns `{ok:true, data:{id, ...}}` |
| Tutor READ (after create) | `GET /api/admin/tutors` | new row present in list |
| Tutor DELETE (collection shape: `{id}` in body) | `DELETE /api/admin/tutors` | 200, row removed |
| Tutor DELETE verification | list count 4 → 3; service-role direct PostgREST read returns 0 rows | true DB delete confirmed |
| Tutor UI consistency | `/en/admin/tutors` after delete no longer contains probe id | ✓ |
| Overview counters | `GET /api/admin/overview` | 200 with live counts |
| POST `/api/auth` (login) | admin OK / student OK / wrong-pw 401 / malformed 422 | All four cases pass; success sets `sb-127-auth-token=base64-…` |
| DELETE `/api/auth` (sign-out) | `scope=global` | 200; cookie clear is a documented no-op on local (`127.0.0.1`) and active on remote |
| Unauthenticated route guards | `GET /api/admin/tutors` without cookie | 401 `{code:'unauthorized'}` |

## 3. Bugs found

### Bug A — Turbopack manifest cache corruption (NOT a code bug)
`pnpm build` clobbered `.next` while the dev server was running,
producing missing `app-build-manifest.json` entries (e.g.
`[locale]/auth/login/page/app-build-manifest.json`). Mitigated by
binding the dev server to port `3001` with a clean `.next/`. No
code change needed.

### Bug B — POST `/api/auth` 500 due to client/server module split (FIXED)
**Symptom:** `POST /api/auth` with valid body returned 500 (and the
dev log: `Attempted to call SupabaseAuthProvider() from the
server but SupabaseAuthProvider is on the client`).

**Root cause:** the route called
`getAuthProvider().signInWithPassword(...)`. `getAuthProvider()`
returns a `SupabaseAuthProvider`, which is marked `'use client'`
and uses the browser-side Supabase client. Next.js refuses to
invoke a `'use client'` module from a Route Handler.

**Fix (production-grade, no workaround):**
`apps/web/app/api/auth/route.ts` was rewritten to mirror the
DELETE handler's pattern: it now uses
`createSupabaseServerClient()` directly and calls
`supabase.auth.signInWithPassword()` server-side. The response
shape is documented and returns `{ok, data: {user, expiresAt}}`.
Bad credentials are collapsed into a single generic 401 message
that does not leak which side is wrong (mirrors the mapping in
`SupabaseAuthProvider.mapSupabaseError`).

**Verification:**
- `POST /api/auth` wrong-pw → 401
- `POST /api/auth` admin correct → 200 + valid
  `sb-127-auth-token=base64-…` set-cookie
- `POST /api/auth` student correct → 200
- `POST /api/auth` malformed email → 422 validation_error
- `DELETE /api/auth` → 200 (cookie clear path documented as
  no-op on local `127.0.0.1`, active on remote)
- `pnpm type-check` exits 0
- `pnpm lint` exits 0 (1 pre-existing warning in `lib/utils/logger.ts`, unrelated)
- `pnpm test` exits 0, 456/456 tests passing

### Bug C — Missing translation keys on `/admin/programs` status badges (FIXED, earlier in this phase)
**Symptom:** 18+ occurrences of raw `Admin.programs.status`
visible in the programs list.

**Fix:** added `Admin.programs.status.published` ("Published" /
"Publié") and `Admin.programs.status.draft` ("Draft" / "Brouillon")
to both `apps/web/messages/en.json` and
`apps/web/messages/fr.json`. Verified post-fix: `rawKeys=0` on the
programs page.

## 4. Bugs fixed (summary)

| ID | Description | Files touched | Tests |
|---|---|---|---|
| B | POST `/api/auth` SSR/client split | `apps/web/app/api/auth/route.ts` | type-check, lint, 456/456 unit tests |
| C | programs status translation keys | `apps/web/messages/en.json`, `apps/web/messages/fr.json` | type-check, lint, 456/456 unit tests |

## 5. Remaining bugs / blockers

- None known inside the approved remediation scope.
- Bug A is environmental (Turbopack manifest cache after `pnpm
  build`), not a code defect. Running `rm -rf .next` before each
  `pnpm build` (or stopping the dev server during `pnpm build`)
  prevents it from re-appearing; the README's quick-start
  instructions already cover this.
- Two pre-existing tutor-related migrations remain uncommitted
  (from the prior session). They are not part of this phase and
  must not be committed without explicit user approval.

## 6. Admin Portal — fully cleared?

**Yes.** Every page renders 200 under the admin session, every
listed row matches the seeded DB state, no MISSING_MESSAGE or raw
keys appear anywhere, no DB error is being silently swallowed,
tutor CRUD round-trip verified end-to-end (POST → list → DELETE →
DB-confirmed absence → UI-confirmed absence), POST `/api/auth`
now works without 500, all four quality gates are green.

## 7. Exact next recommended phase

**Do not start Sprint 9 yet.** The next step is **commit & push
the Phase H2 remediation** (Bug B + Bug C + the
`docs/review/PHASE_H2_ADMIN_RUNTIME_REMEDIATION.md` file
introduced by this report, plus any pending tutor-related
migrations the user wants to include). Once pushed, the only
remaining work before Sprint 9 is the user's explicit go-ahead.

---

*Last updated: 2026-09-03. Authored as part of the
authenticated-runtime remediation pass; no `git add` /
`git commit` / `git push` was executed.*
