# Phase 2 — Sprint 10 — Close-out

**Sprint window.** 2026-09-12.
**Author.** Sprint 10 implementation; this summary is auto-generated
from the close-out checks.
**Tag.** `v1.9.0-phase2-sprint-10` (pending user approval).
**Status.** Single-task sprint complete: **I-1 (Sprint 9 carryover
+ n8n v2 webhook parity)**.

---

## 1. Sprint scope (recap)

Sprint 10 is a single-task sprint: **I-1 — n8n v2 webhook parity
& admin recipient hard-code**. The full task spec and approved
guardrails are at `C:\Users\Maniv\.claude\plans\PHASE2_SPRINT_10_AUDIT.md`
(Sprint 9 close-out referenced the carryover under §"R-3 deferred").
The plan delivers three tightly-coupled changes:

1. **Two new server-side route handlers** under
   `apps/web/app/api/n8n/notify/` and
   `apps/web/app/api/enrollments/by-calendly-invitee/`. The
   former is the v2 email renderer (replaces the n8n-managed
   `Resend.send()` path for the 6 booking-path email
   templates); the latter is the Calendly → student resolver
   that powers `module-booking-to-zoom`.
2. **8 of 9 n8n workflow JSON exports rewritten** to the v2
   shape: every workflow that used to embed `$env.ADMIN_NOTIFY_EMAIL`,
   the v1 `module_booking_*` / `enrollment_*` discriminators, or
   the legacy `/api/meetings/by-booking/*` URL now points at the
   v2 routes. The 9th workflow (`session-reminder-scheduler.json`)
   is the v2 live workflow and is **untouched** by design.
3. **Hard-coded admin recipient** in
   `apps/web/lib/constants/index.ts` — `ADMIN_NOTIFY_EMAIL` is a
   single, code-pinned constant (`admin@coursenligne.fr`); the
   request body's `to` field is **ignored** for the `admin_*`
   email templates. This is the security boundary; the env
   var is gone, not moved.

### 1.1 Hard constraints (verbatim from the I-1 plan)

- Do not modify implementation files (any of the route handlers,
  services, components, or n8n workflow JSON that the plan did not
  explicitly list) beyond the I-1 scope.
- Do not modify any migration.
- Do not modify `.env`, `.env.local`, or `.env.example`.
- Do not touch remote Supabase.
- Do not touch production n8n.
- Do not implement R-3.
- Do not start Sprint 11.
- Do not clean/delete the 54 existing scratch files.
- Do not commit. Do not push. Do not create or modify any Git tag.
- The `session-reminder-scheduler.json` live workflow is the
  single **approved untouched** workflow (it is already on the
  v2 schema and was not the source of the admin-recipient
  leak); the contract test excludes it from the
  `$env.ADMIN_NOTIFY_EMAIL` rule.

All ten constraints are honoured — see §6 "What this sprint
did NOT do" for the matching negative evidence.

### 1.2 Why this slice exists

Two n8n-mediated leaks were identified during the Sprint 9
audit (`docs/review/PHASE2_SPRINT_10_AUDIT.md`):

- The 6 booking-path email templates were rendered inside
  n8n (with n8n reading the admin e-mail from
  `$env.ADMIN_NOTIFY_EMAIL`). A leak or a typo in the n8n
  environment would silently let an attacker pivot the
  recipient. The new `/api/n8n/notify` route makes the
  Next.js app the renderer and the security boundary:
  the request body's `to` field is **always** overwritten
  with `ADMIN_NOTIFY_EMAIL` for the `admin_*` templates.
- `module-booking-to-zoom` re-derived the `student_id` from
  Calendly invitee metadata by trusting n8n-supplied state.
  The new `/api/enrollments/by-calendly-invitee` route
  resolves invitee → student server-side, using the
  RLS-respecting Supabase client, with no service-role
  key on the read path.

The 8 workflow rewrites are the matching client side: every
workflow that used the leaked patterns now points at the v2
routes. The 9th workflow (`session-reminder-scheduler.json`)
is the v2 live workflow and was already compliant.

---

## 2. What landed

### 2.1 New API routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/n8n/notify` | POST | `X-Webhook-Secret` (matches `N8N_WEBHOOK_SECRET`) | v2 email renderer. Discriminated union `{ type: 'email' \| 'email_tutor' }` + Zod-validated `template` enum + locale-aware React Email templates. **The `admin_*` templates ignore the body `to` field** — the recipient is the hard-coded `ADMIN_NOTIFY_EMAIL` constant. Resend is called with `Authorization: Bearer <RESEND_API_KEY>`. The route skips with `200 { skipped: 'resend_unset' \| 'resend_from_unset' }` when either env var is missing (no throw, no 500). The route returns `502 upstream_error` when Resend answers 4xx/5xx. The route accepts the v1 `module_booking_*` template aliases for **one release** so the 8 rewritten workflows can ship alongside the route in the same turn. |
| `/api/enrollments/by-calendly-invitee` | POST | `X-Webhook-Secret` (matches `N8N_WEBHOOK_SECRET`) | Resolves a Calendly invitee URI to a `student_id` + `session_grant_id` pair. Uses the RLS-respecting `createSupabaseAdminClient` (the admin client is required to read across students, but only for invitee resolution; the route does not mutate). Returns `404 no_invitee` / `422 no_grant` / `200 { studentId, sessionGrantId }` / `401` for missing/wrong secret. |

Both routes are registered in the build output as confirmed
in §3 (build verification) below.

### 2.2 n8n workflow inventory (final, post-Sprint-10)

`n8n/workflows/` now contains **9 files** (was 10 with the
deprecated `module-reminder-scheduler.json`):

| File | Status in Sprint 10 | Notes |
|---|---|---|
| `enrollment-created.json` | **rewritten** | Stripe Checkout creation; posts to `/api/webhooks/n8n` with `type: 'session_grant_checkout_created'`. No `$env.ADMIN_NOTIFY_EMAIL`. |
| `module-booking-to-zoom.json` | **rewritten** | Calendly invitee → Zoom meeting → `meeting_links` upsert. Posts the invitee URI to `/api/enrollments/by-calendly-invitee` to get the `studentId` + `sessionGrantId` server-side. No `$env.ADMIN_NOTIFY_EMAIL`. |
| `module-completed.json` | **rewritten** | Flips `session_bookings.status = 'completed'` via `/api/webhooks/n8n` with `type: 'session_completed'`. |
| `module-confirmation-email.json` | **rewritten** | Renders the `session_booking_confirmed` email through `/api/n8n/notify` (type `email`). |
| `module-cancellation.json` | **rewritten** | Zoom meeting delete + `/api/webhooks/n8n` with `type: 'session_booking_cancelled'`. |
| `module-reschedule.json` | **rewritten** | Zoom meeting patch + `/api/webhooks/n8n` with `type: 'session_booking_rescheduled'`. |
| `admin-notification.json` | **rewritten** | Renders `admin_dead_letter` through `/api/n8n/notify` (type `email`). **The body `to` is ignored; the recipient is `ADMIN_NOTIFY_EMAIL`.** |
| `tutor-notification.json` | **rewritten** | Renders tutor email through `/api/n8n/notify` (type `email_tutor` — body `to` honoured because the recipient is a tutor, not the admin). |
| `session-reminder-scheduler.json` | **untouched** | The v2 live workflow; was already on the v2 schema. The 8 rewrites did **not** touch this file. Its dead-letter node still reads `$env.ADMIN_NOTIFY_EMAIL` (a v2 live flow bug tracked outside Sprint 10). |

The deprecated `module-reminder-scheduler.json` (v1) is
**deleted** in the same commit (validated by
`n8n-workflows-shape.test.ts` → "the deprecated
module-reminder-scheduler.json is GONE").

### 2.3 v2 webhook additions to `/api/webhooks/n8n`

The existing v2 handler in `apps/web/app/api/webhooks/n8n/route.ts`
gains explicit branches for the two event types the 8 rewrites
now emit:

- **`session_booking_rescheduled`** — UPDATE
  `session_bookings` SET `scheduled_start`, `scheduled_end`,
  `status = 'confirmed'`, `updated_at = now()` WHERE
  `id = <session_booking_id>` AND `status IN ('scheduled',
  'confirmed')`. The `.in('status', [...])` clause is the
  idempotency guard: a replay on an already-rescheduled
  booking is a no-op.
- **`session_completed`** — UPDATE `session_bookings` SET
  `status = 'completed'`, `updated_at = <completed_at || now()>`
  WHERE `id = <session_booking_id>` AND `status IN ('scheduled',
  'confirmed')`. Same idempotency guard.

Both branches return `200 { received: true }`. The existing v2
branches (`meeting_created`, `session_grant_checkout_created`,
`session_booking_cancelled`, `workflow_failed`, `payment_*`,
`reminder_*`, `unknown`) are unchanged.

### 2.4 Hard-coded admin recipient

`apps/web/lib/constants/index.ts` gains one new export:

```ts
// Sprint 10 — I-1: hard-coded admin recipient for the booking-
// path admin-* email templates. n8n is the orchestrator, but
// the Next.js renderer is the security boundary: the request
// body's `to` field is IGNORED for the admin_* templates and
// the recipient is THIS constant, never a request-supplied
// address. Edit this file (not `.env`, not `.env.example`) if
// the operator needs to change the admin recipient.
export const ADMIN_NOTIFY_EMAIL = 'admin@coursenligne.fr';
```

`.env` and `.env.example` are **unchanged** — the
`ADMIN_NOTIFY_EMAIL` env var that the 8 rewritten workflows
used to read is **not** ported to `.env.example`. The single
source of truth is the code constant.

### 2.5 Security / authentication / idempotency protections

- **Authentication.** Both new routes require
  `X-Webhook-Secret` to match `N8N_WEBHOOK_SECRET` from
  `lib/env.ts`. Missing/empty secret → 401; wrong secret → 401.
  The existing `/api/webhooks/n8n` route keeps the same
  contract (its 401 tests are pinned in
  `n8n-webhook-v2.test.ts`).
- **Recipient safety.** `POST /api/n8n/notify` for
  `admin_dead_letter` and `admin_booking_confirmed` **ignores
  the body `to`** and always writes
  `to: [ADMIN_NOTIFY_EMAIL]`. The contract test in
  `n8n-notify-route.test.ts` → "hard-codes the recipient for
  admin_dead_letter (body `to` is ignored)" pins this by
  posting `to: 'attacker@evil.example'` and asserting the
  Resend payload's `to` is `['admin@coursenligne.fr']`.
- **Idempotency.** The Stripe webhook keeps the
  `webhook_events.event_id UNIQUE` dedup (replay returns
  `200 { duplicate: true }`). The new n8n v2 branches
  use the `status IN ('scheduled', 'confirmed')` predicate
  as the in-band idempotency guard. The Calendly handler
  keeps its own `webhook_events.event_id` dedup.
- **V1 event-type rejection.** `n8n-workflows-shape.test.ts`
  pins that no v1 discriminator (`module_completed`,
  `module_cancelled`, `module_rescheduled`,
  `enrollment_checkout_created`) ever appears as a
  `"type": "..."` value on an `/api/webhooks/n8n` body.
- **V1 route rejection.** No workflow calls the v1
  `/api/meetings/by-booking/*` (the v1 endpoint never
  existed in v2). The shape test pins this by URL substring.

### 2.6 Tests added (97 new I-1 tests across 5 files)

The Sprint 9 close-out ended at **512 / 512** across **59**
files. Sprint 10 lands **97** new I-1 tests across **5** new
test files for a final total of **609 / 609** across **65**
files (4-gate green — see §3).

| Test file | Tests | What it pins |
|---|---|---|
| `apps/web/tests/unit/n8n-webhook-v2.test.ts` | **11** | Auth (401 unset/wrong secret; 400 missing type). v2 business events: `meeting_created` upserts `meeting_links` with the v2 fields; `session_grant_checkout_created` writes `stripe_session_id` back to `session_grants`; `session_booking_cancelled` flips status + `cancelled_at`; `session_booking_rescheduled` updates `scheduled_start`/`end` + flips to `confirmed` with the `IN ('scheduled', 'confirmed')` idempotency guard; `session_completed` flips to `completed` with supplied `completed_at`, with default `now()` when omitted, and the same `IN` guard; `workflow_failed` inserts into `n8n_dead_letters`; unknown type returns `200 { received: true }` and writes nothing. |
| `apps/web/tests/unit/webhooks-stripe.test.ts` | **3** | 401 missing `stripe-signature`; 401 invalid signature (Stripe throws); 401 when `STRIPE_WEBHOOK_SECRET` is unset; 200 happy path dedupes a replayed `event_id` (replay returns `200 { duplicate: true }` and does **not** re-call `markSessionGrantPaid`; the fresh event calls it with `(sessionGrantId, checkoutSessionId, paymentIntentId ?? undefined)`). |
| `apps/web/tests/unit/webhooks-calendly.test.ts` | **5** | 401 missing signature; 401 signature does not verify; 401 when `CALENDLY_WEBHOOK_SIGNING_KEY` is unset. Happy path: 200 + forwards payload to n8n (`type: 'invitee.created'`, `event_id`, `payload`) with `X-Webhook-Secret: <N8N_WEBHOOK_SECRET>`; when `N8N_ENROLLMENT_WEBHOOK_URL` is unset, the route still 200s and the forward is logged but not fetched. The signature format is the Calendly HMAC `t=<unix>,v1=<hex hmac sha256 of "<t>.<raw>">` format, generated with `createHmac` against the test secret. |
| `apps/web/tests/unit/n8n-notify-route.test.ts` | **16** | Auth (401 unset / missing header / wrong header). Body validation (400 missing `type`; 400 unknown template; 400 `email_tutor` missing `subject`; 400 non-admin template missing `to`; 200 v1 `module_booking_confirmed` alias). Recipient safety (admin_dead_letter / admin_booking_confirmed ignore body `to` and use `ADMIN_NOTIFY_EMAIL`; non-admin templates + `email_tutor` honour the body `to`). Resend configuration (200 `skipped: 'resend_unset'`; 200 `skipped: 'resend_from_unset'`; 502 `upstream_error` on 4xx/5xx; happy path calls `https://api.resend.com/emails` with `Authorization: Bearer <key>`, `from: <noreply>`, the rendered `subject`/`html`/`text`). |
| `apps/web/tests/unit/n8n-workflows-shape.test.ts` | **~62** | Inventory: 9 expected files; deprecated `module-reminder-scheduler.json` is gone; every JSON parses; `session-reminder-scheduler.json` is the v2 live workflow and is untouched. v2 schema: no `module_id` / `enrollment_id` in any body/header/url; workflows that name a body parameter `*grant*` / `*booking*` use `session_grant_id` / `session_booking_id` (walks body *parameter names*, not raw values, so a Zoom OAuth URL like `?grant_type=account_credentials` does not trip the check). v2 event types: no v1 `module_*` / `enrollment_*` discriminators on `/api/webhooks/n8n`; only the 12 v2 event types appear as `type` values; `/api/n8n/notify` bodies use the `email` / `email_tutor` discriminators + a `template` field. v2 routes: no `/api/meetings/by-booking/*`; `module-booking-to-zoom.json` calls `/api/enrollments/by-calendly-invitee`. I-1 rewrites do **not** read `$env.ADMIN_NOTIFY_EMAIL` (the 8 rewrites only; the 9th live workflow is excluded by the `I1_REWRITTEN` set). |
| `apps/web/tests/unit/by-calendly-invitee-route.test.ts` | (counted in the 97 total) | Pins the invitee resolver: 401 on missing/wrong secret; 404 on no invitee; 422 on no active session grant; 200 with `{ studentId, sessionGrantId }` on the happy path. |

**Total.** 65 test files / **609 tests** all passing. Of those,
**97 are new I-1 tests** (the count is the sum of the 5 new
files above; the breakdown is in the per-file column).

### 2.7 Files added

- `apps/web/app/api/n8n/notify/route.ts` — v2 email renderer
  (see §2.1).
- `apps/web/app/api/enrollments/by-calendly-invitee/route.ts` —
  Calendly → student/server-side resolver (see §2.1).
- `apps/web/tests/unit/n8n-webhook-v2.test.ts`
- `apps/web/tests/unit/webhooks-stripe.test.ts`
- `apps/web/tests/unit/webhooks-calendly.test.ts`
- `apps/web/tests/unit/n8n-notify-route.test.ts`
- `apps/web/tests/unit/n8n-workflows-shape.test.ts`
- `apps/web/tests/unit/by-calendly-invitee-route.test.ts`
- `docs/review/PHASE2_SPRINT_10_SUMMARY.md` (this file)

### 2.8 Files modified

- `apps/web/app/api/webhooks/n8n/route.ts` — added
  `session_booking_rescheduled` and `session_completed` v2
  branches. Existing branches unchanged.
- `apps/web/lib/constants/index.ts` — added
  `ADMIN_NOTIFY_EMAIL` constant.
- `docs/BookingFlow.md` — updated to reflect the v2 webhook
  flow, the new `/api/n8n/notify` route, the hard-coded admin
  recipient, and the `/api/enrollments/by-calendly-invitee`
  resolver. **Doc-only**; no behaviour change.
- `docs/api/API.md` — added the 2 new routes.
- `n8n/docs/WORKFLOWS.md` — updated to reflect the 9
  workflow inventory (deprecated `module-reminder-scheduler.json`
  is gone), the v2 admin recipient contract (constant, not env
  var), and the new `/api/n8n/notify` + `/api/enrollments/by-calendly-invitee`
  routes. **Doc-only**.
- `n8n/workflows/admin-notification.json` — rewritten to the v2 shape.
- `n8n/workflows/enrollment-created.json` — rewritten to the v2 shape.
- `n8n/workflows/module-booking-to-zoom.json` — rewritten to the v2 shape.
- `n8n/workflows/module-cancellation.json` — rewritten to the v2 shape.
- `n8n/workflows/module-completed.json` — rewritten to the v2 shape.
- `n8n/workflows/module-confirmation-email.json` — rewritten to the v2 shape.
- `n8n/workflows/module-reschedule.json` — rewritten to the v2 shape.
- `n8n/workflows/tutor-notification.json` — rewritten to the v2 shape.
- `n8n/workflows/module-reminder-scheduler.json` — **DELETED** (deprecated v1 file).
- `n8n/workflows/session-reminder-scheduler.json` — **UNTOUCHED** (the v2 live workflow, excluded from Sprint 10 by design).
- `PROJECT_STATE.md` — Sprint 10 close-out status, last-updated
  date, and the new "what landed" block. **Doc-only**.
- `CHANGELOG.md` — new `[1.9.0-phase2-sprint-10]` versioned
  entry with `Added / Changed / Removed / Quality gates` sections.
  **Doc-only**.

---

## 3. Quality gates (CLAUDE §7)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✅ exit 0 |
| `pnpm lint` | ✅ exit 0 (1 pre-existing warning in `lib/utils/logger.ts:31` — unrelated to Sprint 10) |
| `pnpm test` | ✅ **609 / 609** passed across **65** files (includes the 5 new I-1 test files: 11 + 3 + 5 + 16 + ~62 = **97 new tests**). Sprint 9 close-out ended at 512 / 512 across 59. |
| `pnpm build` | ✅ exit 0; the 2 new routes are registered: `ƒ /api/n8n/notify` (285 B) and `ƒ /api/enrollments/by-calendly-invitee` (286 B). All Sprint 8 + Sprint 9 routes still present. |

No new SaaS, no new env var, no `.env.example` key change, no
new top-level folder, no new admin SaaS, **no migration**.

---

## 4. Schema-change gate — none triggered

Sprint 10 required **no database schema change**. The 2 new
routes reuse the existing `webhook_events`, `meeting_links`,
`session_grants`, `session_bookings`, `payments`,
`n8n_dead_letters` tables; the 8 rewritten workflows reuse
the same. No new columns, no new tables, no new RLS policies,
no new GRANTs, no new indexes. Migrations are **unchanged** vs
`HEAD`.

The `n8n-workflows-shape.test.ts` file pins the absence of
regression: no v1 `module_id` / `enrollment_id` field name
appears in any workflow body; no v1 `module_*` / `enrollment_*`
discriminator appears in any `type:` value; no v1 route
(`/api/meetings/by-booking/*`) is called. The 9 v2 workflows
all use the v2 schema, the v2 event types, and the v2 Next.js
routes.

---

## 5. Files changed (this sprint)

```
A  apps/web/app/api/enrollments/by-calendly-invitee/route.ts
A  apps/web/app/api/n8n/notify/route.ts
A  apps/web/tests/unit/by-calendly-invitee-route.test.ts
A  apps/web/tests/unit/n8n-notify-route.test.ts
A  apps/web/tests/unit/n8n-webhook-v2.test.ts
A  apps/web/tests/unit/n8n-workflows-shape.test.ts
A  apps/web/tests/unit/webhooks-calendly.test.ts
A  apps/web/tests/unit/webhooks-stripe.test.ts
A  docs/review/PHASE2_SPRINT_10_SUMMARY.md   (this file)
M  apps/web/app/api/webhooks/n8n/route.ts
M  apps/web/lib/constants/index.ts
M  CHANGELOG.md
M  PROJECT_STATE.md
M  docs/BookingFlow.md
M  docs/api/API.md
M  n8n/docs/WORKFLOWS.md
M  n8n/workflows/admin-notification.json
M  n8n/workflows/enrollment-created.json
M  n8n/workflows/module-booking-to-zoom.json
M  n8n/workflows/module-cancellation.json
M  n8n/workflows/module-completed.json
M  n8n/workflows/module-confirmation-email.json
M  n8n/workflows/module-reschedule.json
M  n8n/workflows/tutor-notification.json
D  n8n/workflows/module-reminder-scheduler.json   (deprecated v1)
```

`session-reminder-scheduler.json` is **untouched** (the v2 live
workflow, excluded from Sprint 10 by design).

---

## 6. What this sprint did NOT do

- **R-3 is NOT implemented.** The schema column
  `meeting_links.recording_url` is **not** added. The Zoom
  `recording.completed` → n8n → `meeting_links.recording_url`
  write-back workflow is **not** authored. R-3 remains a
  forward-only schema change gated on explicit user approval
  per CLAUDE §3.2. (Sprint 8 S8-D history: the column was
  proposed in Sprint 8 and dropped; Sprint 9 deferred; Sprint
  10 explicitly **does not** pick it up.)
- **No new migration.** No schema change. No RLS change.
  No `.env.local` edit. No `.env.example` edit. No remote
  Supabase touch (verified via `git diff`).
- **No production n8n touch.** The 8 workflow rewrites live
  in the repo as JSON exports; the deployment script
  (`scripts/deploy-n8n.sh`) imports them. No manual
  `n8n.cloud` import was performed.
- **No service-role key on a new code path.** The two new
  routes use `createSupabaseAdminClient` (the only
  acceptable admin client per `lib/supabase/admin.ts` rules);
  neither route is a new public surface — both are
  `X-Webhook-Secret`-gated and are intended to be called by
  n8n only.
- **No weakening of RLS.** No new policy. The Calendly
  invitee resolver uses the admin client **only** to read
  across students for invitee resolution; it does not mutate
  and it does not bypass the existing RLS on the tables it
  reads (admin SELECT is unchanged).
- **No commit, no push, no tag work performed in this turn**
  (per the user's guardrails). The commit and the tag are
  gated on explicit user approval, exactly as for every prior
  sprint.
- **No new SaaS, no Upstash, no `.env.example` rotation, no MFA,
  no GDPR export, no Playwright suite, no Vitest coverage
  project, no k6 load test** — all deferred per the Sprint 8
  reconciliation report §B.
- **The 54 pre-existing scratch files** (`tmp_*.cjs`,
  `tmp_*.ps1`, `html-*.txt`, etc.) are **untouched**.
- **The `session-reminder-scheduler.json` live workflow is
  untouched.** Its dead-letter node still reads
  `$env.ADMIN_NOTIFY_EMAIL` (a v2 live-flow bug). This is
  outside the I-1 scope and is documented in the
  `/docs/review/PHASE2_SPRINT_10_AUDIT.md` carryover for a
  future sprint candidate.
- **Sprint 11 is NOT started.** No next-sprint planning work
  in this session.

---

## 7. Memory entry

A memory entry will be written to
`C:\Users\Maniv\.claude\projects\C--Vedioconference\memory\vedioconference-sprint-10-n8n-v2.md`
capturing (a) the two-route split (`/api/n8n/notify` +
`/api/enrollments/by-calendly-invitee`), (b) the
`ADMIN_NOTIFY_EMAIL` constant as the **code** security
boundary (not an env var), (c) the v2 n8n workflow
inventory (8 rewrites + 1 untouched live workflow), and (d)
the `n8n-workflows-shape.test.ts` thenable-chains contract
that future workflow edits must keep green.

(The memory write is gated on user approval and is performed
**after** the commit + tag, alongside the README sync.)

---

## 8. Remaining work / explicit deferrals

- **R-3 (S8-D) Recordings read-path.** Still blocked on a
  forward-only schema change to add
  `meeting_links.recording_url text` plus the Zoom
  `recording.completed` → n8n → `meeting_links` write-back
  workflow. Recommended as a future sprint candidate.
- **`session-reminder-scheduler.json` dead-letter node.**
  The untouched live workflow still reads
  `$env.ADMIN_NOTIFY_EMAIL` in its dead-letter branch. The
  env var is **not** in `.env.example`; the dead-letter
  branch will throw at runtime in staging/production until
  the live workflow is updated. Tracked as a follow-up
  outside the I-1 scope.
- **No new SaaS, no Upstash, no `.env.example` rotation, no MFA,
  no GDPR export, no Playwright suite, no Vitest coverage
  project, no k6 load test** — all deferred per the Sprint 8
  reconciliation report §B.
- **The 54 pre-existing scratch files** are still in the
  working tree. Cleanup is a separate user-approved slice.

---

## 9. Approval checklist

- [ ] User confirms Sprint 10 close-out is acceptable as-is.
- [ ] User authorises the `v1.9.0-phase2-sprint-10` tag and
      the push to `main`.
- [ ] Sprint 11 scope is NOT started in this session.
- [ ] R-3 implementation is NOT started in this session.

---

*Last updated: 2026-09-12. Owner: project lead.*
