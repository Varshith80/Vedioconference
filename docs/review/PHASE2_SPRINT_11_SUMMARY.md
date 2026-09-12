# Phase 2 — Sprint 11 — Close-out

**Sprint window.** 2026-09-12 → 2026-09-13.
**Author.** Sprint 11 implementation; this summary is auto-generated
from the close-out checks.
**Tag.** `v1.11.0-phase2-sprint-11` (pending user approval; **not** created
in this slice).
**Status.** Sprint 11 implementation complete locally. The Sprint 11
Git commit, tag, and push remain separately gated on explicit user
authorization.

---

## 1. Sprint scope (recap)

Sprint 11 delivers **R-3** — the Zoom `recording.completed` →
`meeting_links.recording_url` write-back, with a student and admin
read path. R-3 was deferred from the Sprint 9 audit and Sprint 10
n8n-v2-parity work. The architecture is the locked Option A
(Zoom → n8n → `POST /api/webhooks/zoom/`); n8n is the transparent
transport and the Next.js route is the Zoom trust boundary.

The sprint is six slices:

| Slice | Title | Status |
|---|---|---|
| 11-A | n8n dead-letter fix — drop `$env.ADMIN_NOTIFY_EMAIL` body field | done |
| 11-B | Schema (`meeting_links.recording_url text` nullable) + env (`ZOOM_WEBHOOK_SECRET`) | done |
| 11-C | `POST /api/webhooks/zoom/` — HMAC + write-back + idempotency | done |
| 11-D | `n8n/workflows/zoom-recording-completed.json` — transparent transport | done |
| 11-E | Student + admin read-path UI, EN/FR i18n | done |
| 11-F | Local migration apply + `pnpm db:types` regen + close-out docs | done |

### 1.1 Hard constraints (preserved verbatim from the Sprint 11 plan)

- `ZOOM_WEBHOOK_SECRET` is server-side only, never `NEXT_PUBLIC_*`,
  never in n8n, never logged, never exposed.
- n8n is the **transport only**. It does NOT verify the Zoom
  signature, does NOT re-sign, and does NOT become the trust
  boundary. It forwards the original raw body + the original
  `x-zm-signature` and `x-zm-request-timestamp` headers verbatim.
- The Next.js `/api/webhooks/zoom/` route is the only place that
  performs the HMAC verification. It uses the
  `v0:{x-zm-request-timestamp}:{raw_request_body}` contract, compares
  with `crypto.timingSafeEqual`, and applies the ±5 min replay window.
- The `admin_dead_letter` email template ignores the body `to` field;
  the recipient is the hard-coded `ADMIN_NOTIFY_EMAIL` constant.
- No new SaaS, no new top-level folder, no new env var introduced
  by this sprint beyond the one pre-authorized for `ZOOM_WEBHOOK_SECRET`.
- No `.env.local` edit. No remote Supabase touch. No Zoom
  Marketplace registration. No Vercel secret. No production n8n
  configuration. No service-role-key use outside the existing
  `app/api/webhooks/**` boundary.

---

## 2. 11-A — n8n dead-letter fix

**File.** `n8n/workflows/session-reminder-scheduler.json`.

The dead-letter branch of `session-reminder-scheduler` was sending
`admin_dead_letter` with a body that interpolated the `$env.ADMIN_NOTIFY_EMAIL`
variable on the n8n side. After the Sprint 10 I-1 security boundary
hard-code (recipient is the `ADMIN_NOTIFY_EMAIL` constant in
`apps/web/lib/constants/index.ts`), the body field is dropped entirely.
The server-side route hard-codes the recipient. n8n no longer reads
the env var.

**Test impact.** The 11-A change touched the `n8n-workflows-shape.test.ts`
fixtures. All 11-A / 11-D tests remained green across the sprint.

---

## 3. 11-B — schema + env

**Files.**
- `supabase/migrations/20260912000002_add_meeting_links_recording_url.sql` (NEW)
- `apps/web/lib/env.ts` (modified)
- `apps/web/.env.example` (modified)

**Schema change.** One column, nullable, no default, no index, no
trigger, no RLS change, no GRANT change. Forward-only. The
`if not exists` guard makes the migration a no-op on a database
that already has the column.

```sql
alter table public.meeting_links
    add column if not exists recording_url text;
```

**Env contract.** `ZOOM_WEBHOOK_SECRET` is added to the env contract
in `apps/web/lib/env.ts` and the corresponding `.env.example`. The
var is server-side only (no `NEXT_PUBLIC_` prefix) and the value is
never logged.

**Why this is the smallest correct schema change.**

1. ONE column, nullable, no default. The share URL is the entire
   requirement.
2. NO new index. Lookups are by `meeting_id`; the existing
   `meeting_links_session_booking_id_fkey` covers the read path.
3. NO new RLS policy. The existing
   `meeting_links_select_via_session_booking` policy is
   column-agnostic and already covers student + admin reads.
4. NO new GRANT. The `authenticated` role already holds SELECT on
   `public.meeting_links`.
5. NO trigger. The route is the only writer.

---

## 4. 11-C — `POST /api/webhooks/zoom/`

**Files.**
- `apps/web/app/api/webhooks/zoom/route.ts` (NEW)
- `apps/web/tests/unit/zoom-webhook-route.test.ts` (NEW, 23 tests)
- `apps/web/tests/unit/zoom-webhook-contract.test.ts` (NEW)

**Trust boundary.** This is the only component in the recording
pipeline that performs the Zoom HMAC verification. The route:

1. Reads the **raw** request body (not a parsed JSON body) so the
   HMAC matches the bytes Zoom signed.
2. Computes `v0:{x-zm-request-timestamp}:{raw_request_body}` and
   HMAC-SHA256 with `ZOOM_WEBHOOK_SECRET`.
3. Compares with `crypto.timingSafeEqual(Buffer.from(provided),
   Buffer.from(computed))` to avoid timing leaks.
4. Rejects requests outside the ±5 min replay window.
5. Responds to `endpoint.url_validation` with a challenge echo
   (required for Zoom Marketplace webhook registration).
6. Inserts into `webhook_events(provider, event_id)` with `ON
   CONFLICT DO NOTHING` — idempotency at the database level.
7. For `recording.completed`, looks up the `meeting_links` row
   by `meeting_id` and writes `recording_url` via the service-role
   admin client.
8. For `meeting.ended`, logs only — no `recording_url` is
   written (Zoom sends a separate `recording.completed` if the
   host has cloud recording enabled).
9. For unknown event types, returns `200` and logs — the route
   is forward-compatible with future Zoom event additions.

**Idempotency.** `webhook_events(provider='zoom', event_id) UNIQUE`
guarantees the route is safe to replay. A retried event lands in
`webhook_events` only once; the `recording.completed` branch is
a no-op for the duplicate. The route is `idempotent` against Zoom's
`x-zm-request-timestamp` window AND against the database UNIQUE.

**Service-role key use.** Restricted to the `app/api/webhooks/zoom/`
route, per the existing layer rule (CLAUDE.md §2.3 / Sprint 3.7). No
other code path uses the admin client for the recording pipeline.

---

## 5. 11-D — n8n `zoom-recording-completed`

**Files.**
- `n8n/workflows/zoom-recording-completed.json` (NEW, 10th workflow)
- `n8n/docs/WORKFLOWS.md` (modified, new §2.11)
- `apps/web/tests/unit/n8n-workflows-shape.test.ts` (modified, +15 tests)

**Architecture.** n8n is the **transparent transport**. The workflow:

1. Receives the Zoom webhook via the n8n HTTPS trigger.
2. Captures the **raw** request body and the original
   `x-zm-signature` and `x-zm-request-timestamp` headers.
3. POSTs the raw body + the original headers verbatim to
   `https://<next-app>/api/webhooks/zoom/`.
4. Has no awareness of `ZOOM_WEBHOOK_SECRET`. The secret never
   leaves the Next.js server.

**Forbidden architecture (per CLAUDE.md §2.3).** The workflow
must NOT become: Zoom → n8n verifies secret → n8n creates a new
payload/signature → Next.js trusts n8n. The current workflow does
not verify, does not re-sign, and the route verifies the original
Zoom signature independently. The trust boundary stays at the route.

**Retry / dead-letter.** Standard n8n retry policy. A dead-letter
event escalates to `admin_dead_letter` via the same path as the
other 9 workflows; the recipient is the hard-coded
`ADMIN_NOTIFY_EMAIL` constant (not a body field).

---

## 6. 11-E — read-path UI

**Files.**
- `apps/web/components/dashboard/recording-link-card.tsx` (NEW)
- `apps/web/components/dashboard/session-booking-card.tsx` (modified)
- `apps/web/app/[locale]/dashboard/sessions/page.tsx` (modified)
- `apps/web/app/[locale]/dashboard/sessions/[id]/page.tsx` (modified)
- `apps/web/components/admin/bookings-row.tsx` (modified)
- `apps/web/components/admin/bookings-filtered-list.tsx` (modified)
- `apps/web/app/[locale]/admin/bookings/page.tsx` (modified)
- `apps/web/services/admin/bookings.ts` (modified)
- `apps/web/messages/en.json` (modified)
- `apps/web/messages/fr.json` (modified)
- `apps/web/tests/unit/recording-link-card.test.tsx` (NEW, 14 tests)
- `apps/web/tests/unit/recording-link-i18n.test.ts` (NEW, 6 tests)

**Surfaces.**

1. **Student session detail** (`/dashboard/sessions/[id]`) — when
   the booking is `completed` or the meeting has a `recording_url`,
   a new card in the right-hand aside shows the URL via a
   `RecordingLinkCard` (icon + label + Button `asChild` linking to
   the share URL with `target="_blank" rel="noopener noreferrer"`).
   When the URL is null, the card shows the localized pending
   notice.
2. **Student sessions list** (`/dashboard/sessions`) — when the
   meeting has a `recording_url`, a small inline `Badge` appears
   next to the status badge.
3. **Admin bookings row** (`/admin/bookings`) — when the meeting
   has a `recording_url`, a small inline pill links to the share
   URL. When the URL is null, a muted inline pill shows the
   localized pending notice. The 10-cell row contract is
   preserved (no new column, no layout change).

**i18n (EN + FR).** New `Dashboard.bookings.recording.{cardLabel,
badge, badgeAriaLabel, cta, pending}` and `Admin.bookings.recording.
{cardLabel, cta, pending}`. FR values:
"Voir l'enregistrement", "Enregistrement bientôt disponible", etc.

**11-E fix-up.** After the original 11-E landed, the admin row
only rendered the recording pill when the URL was set; the null
case was silent. The 11-E fix-up adds a mirrored muted "Recording
not available yet" pill in the same `session` cell, so the admin
always sees a recording state. Both states now use
`data-recording-state="available" | "pending"` for symmetric test
queries. The fix-up added 3 new tests (L, M, N) to
`recording-link-card.test.tsx`.

**Type reconciliation (11-F).** After the local migration apply
+ `pnpm db:types` regen, the generated `meeting_links.Row` type
carries `recording_url: string | null` directly. The 11-E
pre-migration defensive casts in:

- `app/[locale]/dashboard/sessions/[id]/page.tsx`
- `components/dashboard/session-booking-card.tsx`

…were simplified to direct typed access (`booking.meeting?.recording_url
?? null`). The `.trim()` runtime defence is preserved. The Zoom
route's `as never` cast on the `update({ recording_url })` was
removed. The admin row's `typeof === 'string'` runtime guard was
kept (it's a runtime safety net, not a type workaround).

---

## 7. 11-F — local integration + close-out

**Files modified by 11-F (this slice).**

- `apps/web/types/database.generated.ts` (regenerated via
  `pnpm db:types`; +142 lines; `meeting_links.recording_url` is
  now in the generated `Row`, `Insert`, and `Update` types)
- `apps/web/app/[locale]/dashboard/sessions/[id]/page.tsx`
  (type-workaround removal)
- `apps/web/components/dashboard/session-booking-card.tsx`
  (type-workaround removal)
- `apps/web/components/admin/bookings-row.tsx` (comment
  refresh; runtime guards preserved)
- `apps/web/services/admin/bookings.ts` (comment refresh on
  `meeting.recording_url`)
- `apps/web/app/api/webhooks/zoom/route.ts` (`as never` cast
  on the `update` dropped)
- `docs/review/PHASE2_SPRINT_11_SUMMARY.md` (NEW — this file)
- `CHANGELOG.md` (Sprint 11 entry)
- `PROJECT_STATE.md` (Sprint 11 status)

**Local migration apply.** `supabase db push --local` was used to
apply the migration to the local Supabase instance
(`127.0.0.1:54322`). Two migrations applied in order:
`20260912000001_session_bookings_select_policy.sql` (already
committed in Sprint 8 close-out, applied to bring the local DB
into sync with the committed main branch) and
`20260912000002_add_meeting_links_recording_url.sql` (the 11-B
Sprint 11 migration).

**`pnpm db:push` (the project script) targets the remote project,
not local.** The script does not pass `--local`. The local
command used was `supabase db push --local` (the CLI's own
local-only flag). The `pnpm db:push` script was NOT run as part
of 11-F. No remote Supabase was touched.

**Generated types.** `pnpm db:types` (= `supabase gen types
typescript --local`) regenerated
`apps/web/types/database.generated.ts`. `meeting_links` now
carries `recording_url: string | null` on `Row`, and the
corresponding optional fields on `Insert` and `Update`.

**Schema verification (local).** `meeting_links.recording_url`
exists, is `text`, and is `NULL`-able. No indexes, triggers, RLS
policies, or GRANTs were added — only the column.

---

## 8. Zoom recording architecture (post-Sprint 11)

```
Zoom
  │  signed webhook (raw body + x-zm-signature + x-zm-request-timestamp)
  ▼
n8n (workflow zoom-recording-completed)
  │  transparent transport: forwards raw body + original headers verbatim
  │  does NOT verify, does NOT re-sign
  │  no awareness of ZOOM_WEBHOOK_SECRET
  ▼
POST /api/webhooks/zoom/  (Next.js route, the trust boundary)
  │  independent HMAC verification
  │  v0:{x-zm-request-timestamp}:{raw_request_body} HMAC-SHA256
  │  crypto.timingSafeEqual compare
  │  ±5 min replay window
  │  webhook_events(provider, event_id) UNIQUE → idempotency
  │  service-role admin client (restricted to app/api/webhooks/**)
  ▼
Supabase Postgres
  │  meeting_links.recording_url  (set on recording.completed)
  │  (no schema change to other tables, no RLS change, no new policy)
  ▼
Next.js RSC (read path)
  │  /dashboard/sessions/[id]      (student, RecordingLinkCard)
  │  /dashboard/sessions            (student, inline Badge)
  │  /admin/bookings               (admin, inline pill)
  ▼
UI (both states handled: available → URL pill, null → pending pill)
```

**Security invariants (verified at close-out).**

- `ZOOM_WEBHOOK_SECRET` is server-side only. Not `NEXT_PUBLIC_*`.
  Not in any n8n workflow JSON. Not in any log. Not in the
  `.env.example` value (the value is empty; the operator fills
  it in at deploy time).
- n8n is NOT a trust boundary. The route verifies the original
  Zoom signature independently. The n8n workflow never sees the
  secret.
- Student access to `meeting_links.recording_url` uses the
  RLS-respecting `createSupabaseServerClient()` (or its untyped
  sibling, which is the same RLS-respecting client). The
  `meeting_links_select_via_session_booking` policy (declared
  in `20260714000007_rls_policies_curriculum_v2.sql` section
  2.7) is column-agnostic and covers the new column.
- Admin access uses the same RLS-respecting client. The
  `is_admin()` helper function (RLS predicate) is unchanged.
- Service-role key use is restricted to `app/api/webhooks/zoom/`
  (and the existing `app/api/webhooks/**` boundary). No
  read-path code path uses the admin client.
- No public page exposes a recording URL. The URL is read by
  RSC components that already have an authenticated session.

---

## 9. Tests (close-out)

| Test file | Tests | New in 11-F? |
|---|---|---|
| `zoom-webhook-route.test.ts` | 23 | no (11-C) |
| `zoom-webhook-contract.test.ts` | (source) | no (11-C) |
| `n8n-workflows-shape.test.ts` | (incl. 15 new 11-D cases) | no (11-D) |
| `recording-link-card.test.tsx` | 14 (incl. L/M/N admin dual-state) | no (11-E) |
| `recording-link-i18n.test.ts` | 6 | no (11-E) |
| All other tests (unchanged) | (rest of 645) | no |

**Close-out totals.**

- `pnpm type-check` → exit 0
- `pnpm lint` → exit 0 (1 pre-existing `lib/utils/logger.ts:31:8`
  no-console warning, unchanged from Sprint 10)
- `pnpm test` → **688 / 688 pass across 69 files**
- `pnpm build` → exit 0; route table unchanged (the 11-C
  `/api/webhooks/zoom` route is the only Sprint 11 route handler
  and is registered and present in the build)

No skipped tests, no `.only`, no suppressed failures, no hidden
errors.

---

## 10. Operator / production actions still pending (NOT done in 11-F)

Sprint 11 is implementation-complete **locally**. The following
are operator actions that require separate authorization and a
production deployment runbook. They are NOT done in 11-F and are
NOT in scope:

1. **Zoom Marketplace webhook registration** — register the
   production webhook URL `https://<prod-host>/api/webhooks/zoom/`
   in Zoom Marketplace, opt in to the `recording.completed` and
   `meeting.ended` events, and complete the
   `endpoint.url_validation` challenge from the production
   environment.
2. **Vercel environment** — set `ZOOM_WEBHOOK_SECRET` in the
   Vercel production environment (and `staging` if needed). The
   value matches what is registered in Zoom Marketplace.
3. **Production n8n** — import `zoom-recording-completed.json`
   into the production n8n instance and configure the n8n
   credentials block to point at the production Next.js URL.
4. **Remote Supabase migration** — apply
   `20260912000002_add_meeting_links_recording_url.sql` to the
   remote Supabase project. The migration is forward-only and
   idempotent; the local apply is a dry-run for the schema
   shape, but the actual remote apply is an operator action.
5. **Sprint 11 Git commit, tag, push** — the changes are
   intentionally UNSTAGED in the working tree. The final
   commit (`feat(sprint-11): …`), tag
   (`v1.11.0-phase2-sprint-11`), and push to `origin/main`
   remain separately gated on explicit user authorization.

The 11-F close-out is complete when all five are explicitly
authorized and executed by an operator.

---

## 11. Sprint 11 changed-file inventory (final)

### NEW files (8)

- `supabase/migrations/20260912000002_add_meeting_links_recording_url.sql`
- `apps/web/app/api/webhooks/zoom/route.ts`
- `apps/web/components/dashboard/recording-link-card.tsx`
- `apps/web/tests/unit/zoom-webhook-route.test.ts`
- `apps/web/tests/unit/zoom-webhook-contract.test.ts`
- `apps/web/tests/unit/recording-link-card.test.tsx`
- `apps/web/tests/unit/recording-link-i18n.test.ts`
- `n8n/workflows/zoom-recording-completed.json`
- `docs/review/PHASE2_SPRINT_11_SUMMARY.md` (this file)

### MODIFIED files (15)

- `apps/web/.env.example` (11-B)
- `apps/web/lib/env.ts` (11-B)
- `apps/web/app/[locale]/admin/bookings/page.tsx` (11-E)
- `apps/web/app/[locale]/dashboard/sessions/page.tsx` (11-E)
- `apps/web/app/[locale]/dashboard/sessions/[id]/page.tsx` (11-E, 11-F)
- `apps/web/components/admin/bookings-row.tsx` (11-E, 11-F)
- `apps/web/components/admin/bookings-filtered-list.tsx` (11-E)
- `apps/web/components/dashboard/session-booking-card.tsx` (11-E, 11-F)
- `apps/web/messages/en.json` (11-E)
- `apps/web/messages/fr.json` (11-E)
- `apps/web/services/admin/bookings.ts` (11-E, 11-F)
- `apps/web/types/database.generated.ts` (11-F, regen)
- `apps/web/tests/unit/n8n-workflows-shape.test.ts` (11-A, 11-D)
- `n8n/docs/WORKFLOWS.md` (11-D)
- `n8n/workflows/session-reminder-scheduler.json` (11-A)
- `apps/web/app/api/webhooks/zoom/route.ts` (11-F, cast removal)
- `CHANGELOG.md` (11-F)
- `PROJECT_STATE.md` (11-F)

All changes are intentionally UNSTAGED in the working tree.
Sprint 11 Git commit, tag, and push are pending explicit user
authorization.
