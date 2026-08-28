# Phase 2 — Sprint 8 — Close-out

**Sprint window.** 2026-08-27 (single working day).
**Author.** Sprint 8 implementation; this summary is auto-generated
from the close-out checks.
**Tag.** `v1.9.0-phase2-sprint-8` (pending user approval).
**Status.** 3 of 4 sub-sprints complete; **S8-D deferred** pending
explicit user authorisation of a schema change (see §4).

---

## 1. Sprint scope (recap)

The user approved four sub-sprints at the start of the session:

| Sub-sprint | Plan reference | Status |
|---|---|---|
| **S8-A** | R-1 + R-2 Resources delivery surface (no schema change) | ✅ Complete |
| **S8-B** | B-19 Manual-complete session (reuse `booking_status` enum) | ✅ Complete |
| **S8-C** | N-3 Cursor-based pagination for `notifications` + `audit_logs` (preserve back-compat with `?before=`) | ✅ Complete |
| **S8-D** | R-3 Recordings dashboard read-path ONLY (verify `meeting_links.recording_url` exists; if NOT, STOP and wait for explicit schema-change authorisation) | ⛔ DROPPED — schema gate triggered |

No work began on any blocked decision (E-1, E-2, E-3, D-7, P0.1–P0.6,
P1.1–P1.7, P2.1–P2.3, P3.1–P3.4).

---

## 2. What landed

### 2.1 S8-A — Resources delivery surface (R-1 + R-2)

The `public.resources` table and its RLS policies already existed
from Phase 1. Sprint 8 wires the application surface that
consumes them.

**New files**

- `apps/web/services/resources.ts` — service layer (cache-wrapped
  reads, throws `ApiError` on writes).
- `apps/web/app/api/admin/resources/route.ts` — `GET` (list)
  + `POST` (create), both via `requireAdminRoute()`.
- `apps/web/app/api/admin/resources/[id]/route.ts` — `PATCH` (edit)
  + `DELETE` (remove).
- `apps/web/components/admin/resource-create-form.tsx` — client
  form (title, description, file_name, file_path, mime_type,
  size_bytes, visibility). Empty strings stripped to `null`.
- `apps/web/components/admin/resource-create-trigger.tsx` —
  dialog wrapper.
- `apps/web/components/admin/resource-delete-button.tsx` —
  confirm-dialog wrapper around `DELETE /api/admin/resources/[id]`.
- `apps/web/components/dashboard/resource-list.tsx` — server-
  renderable list with visibility badge + download anchor.
- `apps/web/app/[locale]/admin/resources/page.tsx` — admin list
  page using `AdminListPage`.
- `apps/web/tests/unit/admin-resources-validation.test.ts` —
  18 Zod-schema tests for `resourceVisibilitySchema`,
  `adminResourceCreateSchema`, `adminResourceEditSchema`.
- `apps/web/tests/unit/admin-resources-route.test.ts` — 5
  route tests covering auth gate, list, 400, 201.

**Modified files**

- `apps/web/lib/validations/admin-catalog.ts` — added
  `resourceVisibilitySchema`, `adminResourceCreateSchema`,
  `adminResourceEditSchema`.
- `apps/web/app/api/resources/route.ts` — now a thin route
  calling `listResourcesForCurrentUser()` after the auth check.
- `apps/web/app/[locale]/dashboard/resources/page.tsx` —
  rewritten to call `listResourcesForCurrentUser()` and render
  `ResourceList` / `EmptyState`.
- `apps/web/components/admin/admin-sidebar.tsx`,
  `apps/web/components/admin/admin-top-nav.tsx` — added
  `resources` entry (`FileText` icon).
- `apps/web/messages/{en,fr}.json` — new
  `Admin.resources.*`, `Admin.resourceCreate.*`, sidebar /
  top-nav strings, `Dashboard.resources.*`.

### 2.2 S8-B — Manual-complete session booking (B-19)

Admins can now transition any non-terminal session booking to
`completed` from the new admin page. Reuses the existing
`booking_status` enum — no schema change.

**New files**

- `apps/web/services/admin/session-bookings.ts` — read-only
  service for the new admin page (filters to non-terminal
  statuses client-side).
- `apps/web/app/api/admin/session-bookings/[id]/complete/route.ts`
  — `POST` endpoint behind `requireAdminRoute()`. Returns 200
  with `transitioned: true | false` (idempotent), 404, or 409.
- `apps/web/components/admin/manual-complete-button.tsx` —
  client component. Renders `null` for terminal bookings
  (no destructive confirm — idempotent semantics).
- `apps/web/app/[locale]/admin/session-bookings/page.tsx` —
  admin list page with per-row "Mark complete" button.
- `apps/web/tests/unit/admin-session-bookings-manual-complete.test.ts`
  — 4 service tests covering `not_found`, `already_terminal`
  (completed + cancelled), and the `ok` transition.

**Modified files**

- `apps/web/services/curriculum/session-bookings.ts` — added
  `manualCompleteSessionBooking()` returning the discriminated
  union `{ kind: 'ok' | 'already_terminal' | 'not_found', booking }`.
- `apps/web/components/admin/admin-sidebar.tsx`,
  `apps/web/components/admin/admin-top-nav.tsx` — added
  `session-bookings` entry (`CalendarCheck` icon).
- `apps/web/messages/{en,fr}.json` — new
  `Admin.sessionBookings.*`, `Admin.manualComplete.*`.

### 2.3 S8-C — Cursor-based pagination (N-3)

Both the notifications feed and the new admin audit-logs
surface now use a strict total-order `(ts, id)` cursor. The
Sprint 7 `?before=` parameter is preserved as deprecated for
one release; new clients should use `?cursor=`.

**New files**

- `apps/web/lib/validations/cursor.ts` — opaque base64-url
  cursor codec, Zod schema, `resolveCursor()` helper.
- `apps/web/lib/validations/admin-audit-logs.ts` — Zod query
  schema (`limit`, `cursor`, `before`, `table_name`, `action`).
- `apps/web/services/admin/audit-logs.ts` — cursor-paginated
  reader. Admin-only at RLS (`audit_logs_select_admin`).
- `apps/web/app/api/admin/audit-logs/route.ts` — `GET`
  endpoint with `requireAdminRoute()`.
- `apps/web/tests/unit/cursor.test.ts` — 9 codec / resolve tests.
- `apps/web/tests/unit/notifications-cursor.test.ts` — 4 tests
  covering under-filled pages, lookahead, cursor predicate,
  and `before` back-compat.
- `apps/web/tests/unit/admin-audit-logs-service.test.ts` — 7
  tests covering pagination semantics, `eq()` filters, row
  mapping, and graceful error degradation.
- `apps/web/tests/unit/admin-audit-logs-route.test.ts` — 5
  route tests covering auth gate, 400, 422, and 200 happy paths.

**Modified files**

- `apps/web/lib/validations/notifications.ts` — added `cursor`
  field to `listNotificationsQuerySchema` (keeps `before`
  deprecated).
- `apps/web/services/notifications.ts` — `listMyNotifications`
  now returns `{ data, nextCursor }`. Uses `limit + 1`
  lookahead and emits the `(sent_at < ts) OR (sent_at = ts
  AND id < id)` predicate when `cursor` is supplied.
- `apps/web/app/api/notifications/route.ts` — validates
  cursor via `decodeCursor()`, returns `{ ok, data, nextCursor }`.
- `apps/web/lib/utils/api.ts` — `jsonResponse()` now accepts
  an optional `nextCursor` field (top-level, alongside `data`).
- `apps/web/components/dashboard/dashboard-header-bell.tsx`,
  `apps/web/components/admin/admin-header-bell.tsx`,
  `apps/web/app/[locale]/dashboard/notifications/page.tsx`,
  `apps/web/app/[locale]/admin/notifications/page.tsx` —
  consume the new `{ data, nextCursor }` shape.
- `apps/web/tests/unit/notifications-routes.test.ts` —
  updated for new return shape + cursor handling + new 400 path.

---

## 3. Quality gates (CLAUDE §7)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (1 pre-existing warning in `lib/utils/logger.ts` — unrelated to Sprint 8) |
| `pnpm test` | ✅ 454 / 454 passed across 53 files |
| `pnpm build` | ✅ exit 0; new routes `/api/admin/resources`, `/api/admin/resources/[id]`, `/api/admin/session-bookings/[id]/complete`, `/api/admin/audit-logs`, `/[locale]/admin/resources`, `/[locale]/admin/session-bookings` all present |

No new SaaS, no new env var, no `.env.example` key change, no
new top-level folder, no new admin SaaS.

---

## 4. Schema-change gate — S8-D dropped

The plan for **S8-D** was to add a read-only surface that surfaces
the `meeting_links.recording_url` column on the student session-
detail page and the admin session-booking-detail page.

**Verified.** `supabase/migrations/20260707000004_bookings_payments.sql`
defines `public.meeting_links` with the columns `id`,
`booking_id`, `provider`, `meeting_id`, `join_url`, `start_url`,
`passcode`, `host_url`, `metadata`, `created_at`, `updated_at`.
There is **no `recording_url` column.**

Per the user's pre-flight instruction in this session — *"verify
the recording_url column exists; if NOT, STOP and wait for
explicit schema-change authorisation"* — Sprint 8 does **not**
author the migration. S8-D is dropped from this sprint and the
column will be requested explicitly when the user is ready to
authorise it (likely as part of a Phase 3 sprint that includes
the Zoom `recording.completed` → n8n → `meeting_links` write-back
workflow).

---

## 5. Files changed (this sprint)

```
A  apps/web/app/[locale]/admin/resources/page.tsx
A  apps/web/app/[locale]/admin/session-bookings/page.tsx
A  apps/web/app/api/admin/audit-logs/route.ts
A  apps/web/app/api/admin/resources/[id]/route.ts
A  apps/web/app/api/admin/resources/route.ts
A  apps/web/app/api/admin/session-bookings/[id]/complete/route.ts
A  apps/web/components/admin/manual-complete-button.tsx
A  apps/web/components/admin/resource-create-form.tsx
A  apps/web/components/admin/resource-create-trigger.tsx
A  apps/web/components/admin/resource-delete-button.tsx
A  apps/web/components/dashboard/resource-list.tsx
A  apps/web/lib/validations/admin-audit-logs.ts
A  apps/web/lib/validations/cursor.ts
A  apps/web/services/admin/audit-logs.ts
A  apps/web/services/admin/session-bookings.ts
A  apps/web/services/resources.ts
A  apps/web/tests/unit/admin-audit-logs-route.test.ts
A  apps/web/tests/unit/admin-audit-logs-service.test.ts
A  apps/web/tests/unit/admin-resources-route.test.ts
A  apps/web/tests/unit/admin-resources-validation.test.ts
A  apps/web/tests/unit/admin-session-bookings-manual-complete.test.ts
A  apps/web/tests/unit/cursor.test.ts
A  apps/web/tests/unit/notifications-cursor.test.ts
M  apps/web/app/[locale]/dashboard/notifications/page.tsx
M  apps/web/app/[locale]/dashboard/resources/page.tsx
M  apps/web/app/[locale]/admin/notifications/page.tsx
M  apps/web/app/api/notifications/route.ts
M  apps/web/app/api/resources/route.ts
M  apps/web/components/admin/admin-header-bell.tsx
M  apps/web/components/admin/admin-sidebar.tsx
M  apps/web/components/admin/admin-top-nav.tsx
M  apps/web/components/dashboard/dashboard-header-bell.tsx
M  apps/web/lib/utils/api.ts
M  apps/web/lib/validations/admin-catalog.ts
M  apps/web/lib/validations/notifications.ts
M  apps/web/messages/en.json
M  apps/web/messages/fr.json
M  apps/web/services/curriculum/session-bookings.ts
M  apps/web/services/notifications.ts
M  apps/web/tests/unit/notifications-routes.test.ts
M  docs/review/PHASE2_SPRINT_8_SUMMARY.md   (this file)
M  PROJECT_STATE.md
```

---

## 6. Remaining work / explicit deferrals

- **S8-D (R-3 Recordings).** Blocked on a forward-only schema
  change to add `meeting_links.recording_url text`. Needs
  explicit user authorisation. Recommended as a Sprint 9
  candidate alongside the Zoom `recording.completed` →
  `meeting_links.recording_url` n8n write-back workflow.
- **No new SaaS, no Upstash, no `.env.example` rotation, no MFA,
  no GDPR export, no Playwright suite, no Vitest coverage
  project, no k6 load test** — all deferred per the Sprint 8
  reconciliation report §B.

---

## 7. Approval checklist

- [ ] User confirms Sprint 8 close-out is acceptable as-is.
- [ ] User explicitly authorises the schema migration for S8-D
      (or confirms the deferral to a later sprint).
- [ ] User authorises the `v1.9.0-phase2-sprint-8` tag and the
      push to `main`.
- [ ] Sprint 9 scope is NOT started in this session.

---

*Last updated: 2026-08-27. Owner: project lead.*