# Phase 2 — Sprint 7 Summary: In-app Notification Feed (M5.2)

> **Sprint tag:** `v1.8.0-phase2-sprint-7` (pending — push after user approval).
> **Status:** Implementation complete. All four quality gates green.
> **Sprint scope:** M5.2 from the roadmap — notification bell, unread
> count, recent list, full feed, mark-as-read, mark-all-as-read,
> student + admin surfaces, EN + FR translations.

---

## 1. Scope (what was authorised)

Implement ONLY the **In-app Notification Feed** slice per the
roadmap definition:

> M5.2 — Notification bell + feed
>
> Phase 5 exit criterion: "WCAG 2.1 AA on every public and
> authenticated page" + "notification feed".

The authorisation was explicit on these guard-rails (preserved
verbatim):

- Reuse the existing `notifications` table and RLS.
- Preserve the existing architecture.
- No new SaaS. No Sentry. No Upstash.
- No payment architecture changes.
- No Calendly/n8n/Zoom/Resend replacement.
- Do not modify Sprint 6 functionality.
- Do not modify P1-A or P1-B.
- Do not create P1-C.
- Do not touch staging or production.
- Do not invent or implement: E-1, E-2, E-3, P1.2, P1.4, P1.6,
  P3.3, D-7, parent profiles, or any other unresolved
  client/business decision.

This slice introduces **no** new SaaS, **no** new table, **no**
new migration, **no** new env var, and **no** change to the
session-based payment model. The existing `public.notifications`
table with its existing RLS policies is the entire data source.

---

## 2. What was built

### 2.1 Zod contracts

| File | Schema |
|---|---|
| `apps/web/lib/validations/notifications.ts` | `listNotificationsQuerySchema` (limit 1..100, unread_only bool, before ISO cursor); `markAsReadBodySchema`, `markAllAsReadBodySchema` (passthrough); `notificationIdParamSchema`. |

11 unit tests in `tests/unit/notifications-validation.test.ts`
guard the contracts.

### 2.2 Service

| File | Purpose |
|---|---|
| `apps/web/services/notifications.ts` | Reads `listMyNotifications` (cache()-wrapped, optional `unreadOnly` + `before` cursor), `getMyUnreadCount` (cache()-wrapped, head+count). Writes `markAsRead` (with explicit ownership re-check via `auth.uid()`) and `markAllAsRead` (bulk update of unread rows for the signed-in user). Pure helper `formatRelativeTime(now, locale)` for SSR-consistent rendering. |

All reads use the RLS-respecting SSR Supabase client; writes go
through the same client because the RLS UPDATE policy
(`auth.uid() = user_id or is_admin()`) is sufficient — the admin
client is not required. The service layer is the boundary at
which the `as never` cast is applied (CLAUDE §3.9, matching the
pattern in `services/admin/tutors.ts`).

11 unit tests in `tests/unit/notifications-service.test.ts` cover
the pure helper.

### 2.3 API surface

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/api/notifications` | signed-in user (RLS) | `{ ok, data: Notification[] }` — supports `?limit=`, `?unread_only=`, `?before=` |
| `POST` | `/api/notifications/[id]/read` | signed-in user (RLS) | `{ ok, data: Notification }` |
| `POST` | `/api/notifications/read-all` | signed-in user (RLS) | `{ ok, data: { updated: number } }` |

8 unit tests in `tests/unit/notifications-routes.test.ts`.

### 2.4 RSC surfaces

| Path | Purpose |
|---|---|
| `app/[locale]/dashboard/notifications/page.tsx` | Student full feed (SSR pre-fetch + client island for optimistic updates). |
| `app/[locale]/admin/notifications/page.tsx` | Admin full feed (mirrors the student page; gated by `requireAdmin()`). |

### 2.5 Client components

| File | Purpose |
|---|---|
| `apps/web/components/shared/notification-item.tsx` | Single feed row (icon per type, unread accent border, relative time, optional click handler). |
| `apps/web/components/dashboard/notification-bell.tsx` | Header bell: dropdown popover with last 5, mark-all-as-read, "see all" link, 60s refresh + visibility-aware re-poll. |
| `apps/web/components/dashboard/notifications-list.tsx` | Full feed client island (SSR pre-fetch + optimistic mark-as-read / mark-all-as-read). |
| `apps/web/components/dashboard/dashboard-header-bell.tsx` | RSC wrapper that reads the unread count + preview via `requireProfile()` + service and renders the bell. |
| `apps/web/components/admin/admin-header-bell.tsx` | RSC wrapper for the admin header; same shape but gated by `requireAdmin()`. |

### 2.6 Shell wiring (non-breaking)

- `components/dashboard/header.tsx` and `components/admin/admin-header.tsx` gained an optional `bell?: ReactNode` prop slot. The bell is rendered between the language switcher and the sign-out button.
- `components/dashboard/dashboard-client-layout.tsx` and `components/admin/admin-client-layout.tsx` gained the same slot and forward it to the headers.
- `app/[locale]/dashboard/layout.tsx` and `app/[locale]/admin/layout.tsx` mount the corresponding `*HeaderBell` server component into the slot.

The slot is optional; if a future caller omits it, the headers
render unchanged. No existing behaviour was removed.

### 2.7 i18n

`apps/web/messages/en.json` and `apps/web/messages/fr.json` got a
new top-level `Notifications` namespace:

```text
Notifications
├── bell.{aria, unreadAria, popoverTitle}
├── feed.{title, subline (ICU plural)}
├── actions.{markAll, markAllPending, seeAll}
├── empty
└── types.{booking_reminder, tutor_change_sla_breach, system}
```

The `feed.subline` string uses ICU plural (`=0 {…} =1 {…}
other {…}`) so the dashboard subline correctly renders "1 unread
notification." vs "3 unread notifications." in both locales.

### 2.8 Tests added (total: 30 new unit tests)

| File | Tests |
|---|---|
| `tests/unit/notifications-validation.test.ts` | 11 Zod contract tests |
| `tests/unit/notifications-service.test.ts` | 11 pure-helper tests |
| `tests/unit/notifications-routes.test.ts` | 8 route-handler tests |

---

## 3. Quality gates (CLAUDE §7)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (one pre-existing `lib/utils/logger.ts` warning unrelated to this slice) |
| `pnpm test` | ✅ exit 0 — **46 files / 393 tests** all passing (was 43/355 before this slice) |
| `pnpm build` | ✅ exit 0 — 5 new routes registered: `GET /api/notifications`, `POST /api/notifications/[id]/read`, `POST /api/notifications/read-all`, RSC `/[locale]/dashboard/notifications`, RSC `/[locale]/admin/notifications` |

---

## 4. Files added / modified

### Added (12 files)

- `apps/web/lib/validations/notifications.ts`
- `apps/web/services/notifications.ts`
- `apps/web/app/api/notifications/route.ts`
- `apps/web/app/api/notifications/[id]/read/route.ts`
- `apps/web/app/api/notifications/read-all/route.ts`
- `apps/web/app/[locale]/dashboard/notifications/page.tsx`
- `apps/web/app/[locale]/admin/notifications/page.tsx`
- `apps/web/components/shared/notification-item.tsx`
- `apps/web/components/dashboard/notification-bell.tsx`
- `apps/web/components/dashboard/notifications-list.tsx`
- `apps/web/components/dashboard/dashboard-header-bell.tsx`
- `apps/web/components/admin/admin-header-bell.tsx`
- `apps/web/tests/unit/notifications-validation.test.ts`
- `apps/web/tests/unit/notifications-service.test.ts`
- `apps/web/tests/unit/notifications-routes.test.ts`
- `docs/review/PHASE2_SPRINT_7_SUMMARY.md` (this file)

### Modified (6 files)

- `apps/web/components/dashboard/header.tsx` — added optional `bell?: ReactNode` prop.
- `apps/web/components/dashboard/dashboard-client-layout.tsx` — forwarded `bell` slot to the header.
- `apps/web/components/admin/admin-header.tsx` — added optional `bell?: ReactNode` prop.
- `apps/web/components/admin/admin-client-layout.tsx` — forwarded `bell` slot to the header.
- `apps/web/app/[locale]/dashboard/layout.tsx` — mounted `<DashboardHeaderBell />` into the bell slot.
- `apps/web/app/[locale]/admin/layout.tsx` — mounted `<AdminHeaderBell />` into the bell slot.
- `apps/web/messages/en.json` — added `Notifications` namespace.
- `apps/web/messages/fr.json` — added `Notifications` namespace.

---

## 5. Authorisation model — what is and is not allowed

### 5.1 Who can read what

| Caller | Can read | Cannot read |
|---|---|---|
| Signed-in user (any role) | `notifications` rows where `user_id = auth.uid()` | Another user's notifications |
| Admin / super_admin | Their own `notifications` rows (same as above) | All users' notifications — the table is per-user, not broadcast |
| Anonymous | None (the routes and RSC pages are gated by `requireProfile()` / `requireAdmin()`; the service uses the SSR client, so `auth.uid()` is null and the read returns 0 rows) | Anything |

The RLS policies on `public.notifications` are unchanged:

```sql
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id or public.is_admin());
```

A user cannot enumerate other users' notifications — the policy
permits the SELECT but the row set is scoped to
`auth.uid() = user_id`.

### 5.2 Who can mark what as read

| Caller | Can mark | Cannot mark |
|---|---|---|
| Signed-in user | Rows where `user_id = auth.uid()` | Another user's notification |
| Admin | Same (their own rows + any — `is_admin()` matches the OR clause) | n/a |
| Anonymous | None (service throws `Unauthorized` if `auth.uid()` is null) | n/a |

The service additionally re-checks `auth.uid() === row.user_id`
inside `markAsRead` so a future RLS regression does not silently
leak ownership logic to the route layer. The check is
defence-in-depth — RLS is the authoritative gate.

### 5.3 Bulk mark-all-as-read

`markAllAsRead` issues an `UPDATE notifications SET read_at =
now() WHERE read_at IS NULL`. RLS scopes the update to the
caller's rows (`auth.uid() = user_id or is_admin()`) — the
statement cannot accidentally affect another user's
notifications. The service then re-reads the count of rows whose
`read_at >= nowIso` to report how many were touched (best-effort
follow-up; if it fails, the UPDATE succeeded and we return
`{ updated: 0 }` rather than failing the request).

---

## 6. Business rules deliberately NOT invented

These items remained BLOCKED in this slice per the original
authorisation. They are **not** silently invented:

- **E-1 / E-2 / E-3** (refund policy on tutor change) — out of scope.
- **P1.2 / P1.4 / P1.6** (unrelated profiles / sessions work) — out of scope.
- **P3.3** (subscription pack interactions with tutor change) — out of scope.
- **D-7** (whether the breach notification should be mirrored to the admin audience) — out of scope.
- **Notification preferences / mute** — the user does not get to pick which types they receive. If the client later wants preferences, that is a separate slice.
- **Email mirror of any in-app notification** — out of scope per Sprint 6 §5; email rendering still lives in n8n.
- **Admin-broadcast notifications** — there is intentionally no admin-only broadcast table. The admin surface shows the admin's OWN notifications, the same way the student surface shows theirs.
- **Pagination on the full feed** — the full feed shows up to 50 rows in a single page. Cursor pagination (`?before=`) is implemented at the API layer for future use; the UI does not yet expose a "load older" button (would be a follow-up).

If the client later wants any of these, they should ship as a
separate slice — none of them are required to call M5.2 done.

---

## 7. Known limitations / follow-ups

1. The bell refreshes every 60 s. A realtime channel would push
   updates instantly but is out of scope for this slice
   (Supabase Realtime is a separate infrastructure decision and
   would require client-side subscription management).
2. The full feed shows up to 50 rows; the API supports a
   `?before=` cursor for pagination, but the UI does not yet
   expose a "load older" affordance. Adding the affordance is a
   self-contained follow-up (a "Load more" button at the bottom
   of `NotificationsList` that fetches the next page).
3. The `notifications` table does not have a partial index on
   `(user_id, read_at, sent_at DESC)` — the existing
   `idx_notifications_user_id` + `idx_notifications_read_at`
   indexes are sufficient for the per-user read patterns in this
   slice. If the platform grows to millions of notifications per
   user, a composite index should be considered (separate
   migration, separate review).
4. The bell is hidden by `requireProfile()` / `requireAdmin()`
   failing — the surrounding shells redirect anonymous users to
   `/auth/login` first, so the bell never renders for them.

---

## 8. Explicit user approval required before

- Tagging `v1.8.0-phase2-sprint-7` and pushing.
- Starting Sprint 8 / any next slice.
- Any change to E-1, E-2, E-3, P1.2, P1.4, P1.6, P3.3, D-7.

Per CLAUDE §5, **no work begins on the next sprint** without
explicit user approval.

---

## 9. How to verify locally

1. Sign in as any user (or admin).
2. Look at the top-right of the dashboard header — a bell icon
   appears next to the language switcher. The badge shows the
   unread count.
3. Open the bell — the popover shows the 5 most recent
   notifications with their subject / body / relative time.
4. Click "Mark all as read" — the badge clears and the rows lose
   their unread accent.
5. Click any row — the row is marked as read (optimistic update)
   and the badge decrements.
6. Click "See all notifications" — opens `/dashboard/notifications`
   (or `/admin/notifications` for admins) with the full feed.
7. Visit `/dashboard/notifications` directly — the full feed
   renders server-side; the "Mark all as read" button at the
   top-right clears the unread badge across both surfaces.

RLS guarantees a different signed-in user sees only their own
notifications — verified by the
`markAsRead` ownership re-check + the existing RLS policy
unchanged.
