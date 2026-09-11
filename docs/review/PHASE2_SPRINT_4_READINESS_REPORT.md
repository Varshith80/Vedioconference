# Sprint 4 Readiness & Integration Audit

> **Status:** Read-only audit. No code modified, no files
> created, no commits made, no Sprint 4 work started. This
> report is the single source of truth for "what is needed
> before Sprint 4 can begin".
>
> **Sprint 4 scope (per `docs/DevelopmentRoadmap.md`):**
> Admin dashboard — M4.1 KPIs, M4.2 Course CRUD, M4.3 Tutor
> CRUD, M4.4 Bookings table, M4.5 Manual actions (confirm,
> cancel, refund, resend email), M4.6 Students list. Exit
> criterion: a new tutor + course can be onboarded purely
> from the admin UI; a booking can be cancelled (refund +
> Zoom delete) from the admin panel without external tools.
>
> **Important context:** The work this project labels
> "Sprint 4 (Phase 4 — Admin dashboard)" is **already
> shipped in code** (Sprints 3.6 + 3.8 per
> `docs/review/PHASE2_SPRINT_3.8_SUMMARY.md` and
> `PROJECT_STATE.md`). The "Sprint 4" backlog candidates in
> `docs/review/PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.1 are
> smaller follow-up items (tutor edit form, audit pass,
> placeholder removal). The integration audit in this
> report therefore asks: **what is the platform's current
> state on the third-party SaaS dependency chain
> (Supabase, Calendly, Stripe, Zoom, Resend, n8n, Vercel),
> and what is missing before the next round of work can
> begin against a live production environment?**

---

## 1. Everything already implemented or scaffolded

### 1.1 Sprint 4 (Phase 4 — Admin dashboard) — code complete

| Sub-area | Status | Evidence |
|---|---|---|
| **M4.1 Admin overview KPIs** | ✅ Done (Sprint 3.6) | `app/api/admin/overview/route.ts`, `/admin/overview` page reads from v2 tables. |
| **M4.2 Course CRUD** | ✅ Done (Sprints 3.6 + 3.8) | Full Create / Edit / Delete for courses + chapters + sessions; list + detail pages; new `/admin/courses/[id]` edit route. |
| **M4.3 Tutor CRUD** | ✅ Partial (Sprint 3.8) | `/admin/tutors` (read-only list + status), `/admin/tutors/[id]` (read-only detail). **Create** form shipped in the standalone-tutor refactor. **Edit / archive** form is the next-up backlog item per §4.1 of `PHASE2_SPRINT_3.8.1_SUMMARY.md`. |
| **M4.4 Bookings table** | ✅ Done (Sprint 3.6 + polish in 3.8) | `/admin/bookings` (list with filters) + `/admin/bookings/[id]` (detail with tutor link, host start URL, meeting status badge). |
| **M4.5 Manual actions** | ✅ Partial | **Cancel** + **resend email** (disabled — see gap) wired. **Refund** delegated to `POST /api/session-grants/[id]/refund` (admin-only). **Confirm** action is implicit (the booking flow already creates confirmed bookings). |
| **M4.6 Students list** | ✅ Done (Sprint 3.6) | `/admin/students` (read-only list of profiles with role='student'). |

### 1.2 Sprint 4 follow-up backlog (per `PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.1)

| Item | Status | Notes |
|---|---|---|
| `PG-1` P4-FU1 B1-i18n DashboardSidebar test harness | Pre-existing | Touches the dashboard client layout |
| Tutor edit / archive form on `/admin/tutors` | **Not done** | Read-only + Create form are live; the edit form is the next-up work item |
| Audit forms, buttons, links for completeness | **Not done** | Catch-all across the admin surface |
| Remove placeholder implementations | **Not done** | Catch-all; see "Sprint C resend retry" gap below |
| Verify remote schema is in v2 shape | **Done** (this session) | Re-verify after the next remote migration |
| End-to-end browser verification (mutation walkthrough) | **Done in code** | Requires signed-in admin session on the user's side to complete |

### 1.3 Phase 2 / Sprint 5+ backlog (per `PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.2)

- `S5` course-pricing semantics (per-session price from Excel import)
- `S6` student-side booking flow (Phase 4 tutor-picker)
- `Sentry` + `Upstash` (Phase 5)
- Public tutor profile pages (`/tutors/[uuid]`)
- Course cover images (Storage bucket already created in Phase 1)
- Resource uploads + `resource_grants` for `session_grants`
- `resend` retry / dead-letter integration with n8n
- Phase 2 review (formal architecture review at `docs/review/PHASE2_REVIEW.md`)

---

## 2. Existing files per integration

### 2.1 Supabase

**Migrations (`supabase/migrations/` — 27 files, forward-only):**

| File | Purpose |
|---|---|
| `20260707000001_extensions_and_helpers.sql` | pgcrypto, uuid-ossp; `is_admin()`, `is_super_admin()` helpers. |
| `20260707000002_profiles_and_roles.sql` | `profiles` + role enum. |
| `20260707000003_tutors_courses.sql` | v1 `tutors` (auth-tied) + `courses` (v1 shape with `level`, `level_group`, `subject`, `price_cents`). |
| `20260707000004_bookings_payments.sql` | v1 `bookings`, `payments`. |
| `20260707000005_resources_notifications_audit.sql` | `resources`, `notifications`, `audit_log`. |
| `20260707000006_rls_policies.sql` | Initial RLS. |
| `20260707000007_storage_buckets.sql` | 3 buckets: `avatars`, `course-covers`, `resources`. |
| `20260707000008_subscriptions_billing.sql` | v1 `subscriptions`. |
| `20260709000000_booking_status_scheduled.sql` | Adds `scheduled` to booking status enum. |
| `20260709000001_modules_enrollments.sql` | v1 `modules`, `enrollments`, `module_bookings`, `module_progress`. |
| `20260709000010_courses_prerequisite_for_seed_migration.sql` | Adds the FK the seed needs. |
| `20260710000000_enrollments_refund_trigger.sql` | `fn_enrollments_refund()` trigger. |
| `20260710000001_module_unlock.sql` | `fn_module_unlock_check()` BEFORE INSERT trigger. |
| `20260710000002_seed_demo_courses_with_modules.sql` | Dev-only idempotent seed. |
| `20260714000000_programs_grades.sql` | v2 `programs` + `grades` (Sprint 3.5). |
| `20260714000001_chapters_sessions.sql` | v2 `chapters` (with `position` NOT NULL) + `sessions` (v2 shape with `position`). |
| `20260714000002_session_grants.sql` | v2 `session_grants` (unit of payment). |
| `20260714000003_session_bookings_meeting_links_payments.sql` | v2 `session_bookings`, `meeting_links`, refactored `payments`. |
| `20260714000004_backfill_curriculum_hierarchy.sql` | Backfills v1 → v2. |
| `20260714000005_drop_module_progress_module_unlock.sql` | Drops v1 module-progress + module-unlock (replaced by session grants). |
| `20260714000006_seed_demo_chapters_sessions.sql` | Dev-only seed of the v2 hierarchy. |
| `20260714000007_rls_policies_curriculum_v2.sql` | v2 RLS for the new hierarchy. |
| `20260715000000_drop_v1_back_compat_tables.sql` | Drops `_bookings_legacy` + `enrollments` + `module_bookings` + `module_progress`. |
| `20260719000001_sessions_tutor_id.sql` | Adds `sessions.tutor_id` FK (Sprint 3.8). |
| `20260719000002_reshape_tutors_v1_to_standalone.sql` | Standalone-tutor refactor (removes `auth.users` dependency). |
| `20260720000001_restore_tutors_admin_all_policy.sql` | Restores an `admin ALL` policy after the refactor. |

**Supabase client wrappers (`apps/web/lib/supabase/`):**

- `client.ts` — browser client (RLS-respecting).
- `server.ts` — server client (RLS-respecting, used in RSC + service code).
- `admin.ts` — service-role client (webhook handlers + `/api/auth/register` only — locked architecture).

**Supabase config / seed / policies:**

- `supabase/config.toml` — auth, JWT, password policy.
- `supabase/seed/000_seed.sql` — idempotent dev data.
- `supabase/policies/` — RLS policy assertions.
- `supabase/snippets/` — utility SQL.
- `supabase/tests/rls_smoke_assertions.sql` — 13 policy-block assertions.
- `scripts/db-push.sh`, `scripts/db-types.sh`, `scripts/db-url.sh`, `scripts/rls-smoke.sh` — local-DB helpers.

**Status: live on remote (user's Supabase project `ffillswcwzefhlojtnkq` in EU).** No further migration work pending from the assistant. The user has applied all 27 migrations manually to the remote database (per the standing constraint "We will handle the database migration ourselves").

### 2.2 Calendly

| File | Purpose |
|---|---|
| `apps/web/services/calendar/calendly.ts` | Typed wrapper over the Calendly REST v2 API (no SDK). 109 lines. `Bearer <CALENDLY_PERSONAL_TOKEN>`. |
| `apps/web/app/api/webhooks/calendly/route.ts` | Inbound webhook handler. Verifies `Calendly-Webhook-Signature` (`t=<unix>,v1=<hex>` HMAC-SHA256) using `CALENDLY_WEBHOOK_SIGNING_KEY`. |
| `apps/web/app/api/sessions/route.ts` | Accepts `calendly_event_uri` on session create. |
| `apps/web/app/api/sessions/[id]/route.ts` | Accepts `calendly_event_uri` on session patch. |
| `apps/web/app/api/session-bookings/route.ts` | Accepts `calendly_invitee_uri` on booking create. |
| `apps/web/components/marketing/calendly-embed.tsx` | Calendly inline-embed widget on the course detail page. |

**Marketing-side usage:** `NEXT_PUBLIC_CALENDLY_URL` is referenced from the marketing CTA.

**Status: code complete.** Live account + token + signing key still required to exercise the integration end-to-end.

### 2.3 Stripe

| File | Purpose |
|---|---|
| `apps/web/lib/stripe/client.ts` | Lazy, server-only Stripe client. Uses `apiVersion: '2024-06-20'`. |
| `apps/web/app/api/webhooks/stripe/route.ts` | Inbound webhook handler. Verifies `stripe-signature` via `STRIPE_WEBHOOK_SECRET`. Handles `checkout.session.completed` (updates `payments` + flips `session_grants.status='active'` + creates `session_progress` rows) and `charge.refunded` (cascades via `fn_enrollments_refund` trigger). |
| `apps/web/app/api/session-grants/route.ts` | POST: creates a `session_grants` row in `pending_payment` status. |
| `apps/web/app/api/session-grants/[id]/stripe-session/route.ts` | POST: creates the Stripe Checkout Session via n8n. Returns 503 when env is unset. |
| `apps/web/app/api/session-grants/[id]/refund/route.ts` | POST (admin): delegates the `refunds.create` to n8n. Returns `refund_pending`; the actual `payments` update is done by the `charge.refunded` webhook. |

**Status: code complete.** Stripe account + Restricted API key (with `checkout + refunds` scopes) + webhook signing secret still required.

### 2.4 Zoom (Server-to-Server OAuth)

| File | Purpose |
|---|---|
| `apps/web/lib/zoom/client.ts` | Hand-rolled S2S-OAuth client (no `zoomus` SDK). Caches the access token until 60 s before expiry. 107 lines. |
| `apps/web/services/zoom/meetings.ts` | Typed wrappers: `createMeeting`, `deleteMeeting`, `updateMeeting`. 104 lines. |

**Status: code complete.** Zoom S2S app credentials (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_DEFAULT_HOST_USER_ID`) still required.

**Note:** Per the locked architecture (CLAUDE.md §2.3), the Next.js app does **not** call Zoom on the booking path. `services/zoom/meetings.ts` exists to keep the typed surface documented + unit-testable; the actual call on the booking path is made by n8n (workflow `session-booking-to-zoom.json`). The Zoom service is used by the n8n workflow (via the `zoomFetch` HTTP node), not by the Next.js booking route.

### 2.5 Resend (email)

| File | Purpose |
|---|---|
| `apps/web/lib/email/client.ts` | Lazy, server-only Resend client. |
| `apps/web/lib/email/send.ts` | `sendTemplatedEmail` helper. Mock-gated: when `RESEND_API_KEY` is unset, returns `{ id: 'mock', status: 'mocked' }` — no destructive send. |
| `apps/web/lib/email/templates/_base.tsx` | React Email base, shared types (`EmailLocale`, `RenderedEmail`). |
| `apps/web/lib/email/templates/enrollment-confirmed.tsx` | "Your enrollment is active" email. |
| `apps/web/lib/email/templates/session-booking-confirmed.tsx` | Per-session-booking confirmation. |
| `apps/web/lib/email/templates/reminder-24h.tsx` | T-24h reminder. |
| `apps/web/lib/email/templates/reminder-1h.tsx` | T-1h reminder. |
| `apps/web/lib/email/templates/session-cancelled.tsx` | Cancellation notice. |
| `apps/web/lib/email/templates/admin-dead-letter.tsx` | Admin failure digest. |
| `apps/web/lib/email/templates/index.ts` | Typed dispatcher. |
| `apps/web/app/api/contact/route.ts` | The only Next.js → Resend direct send today (contact form). |
| `apps/web/app/api/webhooks/n8n/route.ts` | `?type=email` branch → calls `sendTemplatedEmail`. This is how n8n sends emails: it POSTs to Next.js, which then sends. |

**Status: code complete.** Resend account + API key + verified `RESEND_FROM_EMAIL` domain still required.

**Gap:** the "resend retry / dead-letter integration with n8n" backlog item (Phase 2 / Sprint 5+) is the only Resend feature not yet wired. Today's dead-letter flow surfaces admin emails via `admin-dead-letter.tsx`; if the n8n → Next.js POST itself fails, there is no Resend-side retry.

### 2.6 n8n Cloud (automation layer)

**Workflow JSONs (`n8n/workflows/` — 9 files):**

| File | Bytes | Named nodes | Trigger | Status |
|---|---|---|---|---|
| `enrollment-created.json` | 6 864 | 37 | Stripe `checkout.session.completed` | **Sprint C shape, imported-but-not-active** (the `active: false` flag is set in every file; a real import + activation is the operator step) |
| `module-booking-to-zoom.json` (now `session-booking-to-zoom`) | 7 530 | 38 | Calendly `invitee.created` | Imported-but-not-active |
| `module-completed.json` (now `session-completed`) | 5 560 | 25 | Zoom `meeting.ended` | Imported-but-not-active |
| `module-confirmation-email.json` (now `session-confirmation-email`) | 5 068 | 29 | n8n internal (chain from 2) | Imported-but-not-active |
| `module-reminder-scheduler.json` | 4 868 | 26 | n8n Cron (every 15 min) | Imported-but-not-active |
| `module-reschedule.json` | 5 336 | 25 | Calendly `invitee.updated` | Imported-but-not-active |
| `module-cancellation.json` | 5 867 | 24 | Calendly `invitee.canceled` / `POST /api/module-bookings/[id]/cancel` | Imported-but-not-active |
| `admin-notification.json` | 3 253 | 15 | n8n internal (1, 2, 3, 5, 6, 7) | Imported-but-not-active |
| `tutor-notification.json` | 4 467 | 23 | n8n internal (2) | Imported-but-not-active |

Every file has `active: false`, the deploy script is `scripts/deploy-n8n.sh`. Workflows are documented in `n8n/docs/WORKFLOWS.md` (full 9-workflow spec: trigger / inputs / steps / failure modes / idempotency for each).

**Status: documented + JSON-scaffolded, not running.** No real n8n Cloud account is configured. The deploy script has never been run against a real n8n instance.

**n8n credentials (`n8n/credentials/`):** directory is empty — the credential set is documented in `WORKFLOWS.md` §4 but no JSON file is committed (correct: real credentials are never committed).

### 2.7 Vercel

**Configuration:**

- `apps/web/next.config.mjs` — CSP, HSTS, X-Frame-Options, image remote patterns, dev-overlay 204 stub rewrites.
- `apps/web/vercel.json` — not present (Next.js 15 auto-detects the App Router; no override needed).
- `apps/web/middleware.ts` — auth + role + locale composition.
- `.github/workflows/` — `ci.yml` (lint/type-check/test/build), `codeql.yml`, `secret-scan.yml` (gitleaks).

**Status: ready to deploy, no Vercel project provisioned.** A new Vercel project needs to be created (one per environment per `docs/deployment/Deployment.md` §1: `production`, `staging`, per-PR preview).

**Caveat:** the repository's working tree currently has ~100 uncommitted files from Sprints 3.5–3.8 (per `git status`). A Vercel deploy would pick up whatever is on the pushed branch, not the working tree. Per the standing constraint "do not commit anything", no Sprint 4 commit/PR cycle can begin until the user explicitly authorises a commit.

---

## 3. All environment variables required

Two sources of truth:

1. **Code contract:** `apps/web/lib/env.ts` Zod schemas (`publicSchema` + `serverSchema`).
2. **Documentation:** `docs/deployment/Environment.md` (the "where to get the value" guide).

### 3.1 Public (browser — `NEXT_PUBLIC_*`)

| Variable | Used by | Code contract | Status |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `@/lib/supabase/client.ts`, `server.ts` | `z.string().url()` (optional in dev) | ✅ Set in `.env.example` (real value shipped; **must be rotated**) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same | `z.string().min(20)` (optional in dev) | ✅ Set (same caveat) |
| `NEXT_PUBLIC_SITE_URL` | `lib/env.ts`, `metadataBase` | `z.string().url().default('http://localhost:3000')` | ✅ Defaulted; will need override per env |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `lib/i18n.ts` | `z.enum(['en','fr']).default('fr')` | ✅ Defaulted |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | Marketing pages | `z.string().default('Europe/Paris')` | ✅ Defaulted |
| `NEXT_PUBLIC_CALENDLY_URL` | Marketing CTA | `z.string().url().optional()` | ⚠️ Placeholder (`https://calendly.com/your-org`) |
| `NEXT_PUBLIC_N8N_BOOKING_WEBHOOK` | n8n (public-facing webhook) | `z.string().url().optional()` | ⚠️ Empty |

### 3.2 Server-only — Supabase

| Variable | Code contract | Status |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `z.string().min(20)` (required) | ✅ Set in `.env.example` (real value; **must be rotated**) |

### 3.3 Server-only — Stripe

| Variable | Code contract | Status |
|---|---|---|
| `STRIPE_SECRET_KEY` | `z.string().min(1).optional()` | ❌ Empty |
| `STRIPE_WEBHOOK_SECRET` | Same | ❌ Empty |
| `STRIPE_PRICE_PAYG` | Same | ❌ Empty (legacy v1 field; not read by current code) |
| `STRIPE_PRICE_SUBSCRIPTION` | Same | ❌ Empty (legacy v1) |
| `STRIPE_PRICE_TABLE_JSON` | `z.string().optional()` | ❌ Empty (Sprint C per-course map; empty in dev → checkout route returns 503) |

### 3.4 Server-only — Zoom (S2S OAuth)

| Variable | Code contract | Status |
|---|---|---|
| `ZOOM_ACCOUNT_ID` | `z.string().min(1).optional()` | ❌ Empty |
| `ZOOM_CLIENT_ID` | Same | ❌ Empty |
| `ZOOM_CLIENT_SECRET` | Same | ❌ Empty |
| `ZOOM_DEFAULT_HOST_USER_ID` | Same | ❌ Empty |

### 3.5 Server-only — Calendly

| Variable | Code contract | Status |
|---|---|---|
| `CALENDLY_PERSONAL_TOKEN` | `z.string().min(1).optional()` | ❌ Empty |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Same | ❌ Empty |

### 3.6 Server-only — Resend

| Variable | Code contract | Status |
|---|---|---|
| `RESEND_API_KEY` | `z.string().min(1).optional()` | ❌ Empty (mock-gated, so the app runs fine without it) |
| `RESEND_FROM_EMAIL` | `z.string().email().default('no-reply@example.com')` | ✅ Defaulted; **must be a verified Resend sender domain** in production |

### 3.7 Server-only — n8n

| Variable | Code contract | Status |
|---|---|---|
| `N8N_BASE_URL` | `z.string().url().optional()` | ❌ Empty |
| `N8N_API_KEY` | `z.string().min(1).optional()` | ❌ Empty |
| `N8N_WEBHOOK_SECRET` | Same | ❌ Empty |
| `N8N_ENROLLMENT_WEBHOOK_URL` | `z.string().url().optional()` | ❌ Empty (Sprint C: Next.js → n8n for Stripe Checkout Session creation; empty → route returns 503) |

### 3.8 Misc

| Variable | Code contract | Status |
|---|---|---|
| `LOG_LEVEL` | `z.enum(['debug','info','warn','error']).default('info')` | ✅ Defaulted |
| `SENTRY_DSN` | `z.string().url().optional()` | ❌ Empty (Phase 5 work) |

### 3.9 Critical security note (carried over from B2 close-out)

> `apps/web/.env.example` ships **real** Supabase keys (project `ffillswcwzefhlojtnkq`). The B2 close-out deliberately did not modify the file (it's `.gitignore`d at `.env.local`, but the example is committed). These keys must be **rotated** and the file rewritten to placeholders only. (Gated on explicit user instruction per `PROJECT_STATE.md` "Known security follow-up" callout.) This must happen before any production deploy.

---

## 4. API keys, OAuth credentials, webhook URLs, callback URLs, redirect URIs

| # | Type | Where it's set | Where it's used | What the user must create/configure |
|---|---|---|---|---|
| 1 | Supabase project URL + anon key + service role key | Supabase dashboard → Project Settings → API | `lib/supabase/{client,server,admin}.ts` | **Already exists** (project `ffillswcwzefhlojtnkq`, EU region). Anon + service-role keys are in `.env.example` and **must be rotated**. |
| 2 | Stripe Restricted API key (`checkout + refunds` scopes) | Stripe dashboard → Developers → API keys → Restricted keys | `lib/stripe/client.ts`, `services/curriculum/session-grants.ts` | **Create** a Restricted key with `checkout.sessions:write`, `checkout.sessions:read`, `refunds:write`, `refunds:read`. Put in `STRIPE_SECRET_KEY`. |
| 3 | Stripe webhook signing secret | Stripe dashboard → Developers → Webhooks → Add endpoint `https://<prod-host>/api/webhooks/stripe` → subscribe to `checkout.session.completed`, `charge.refunded` | `app/api/webhooks/stripe/route.ts:33-36` | **Create** webhook endpoint, copy the `whsec_…` secret into `STRIPE_WEBHOOK_SECRET`. |
| 4 | Stripe Price IDs | Stripe dashboard → Products | Currently not read (the route uses `STRIPE_PRICE_TABLE_JSON`) | Optional for the Sprint C per-course map; can defer to Sprint 5. |
| 5 | Zoom Server-to-Server OAuth app | Zoom marketplace → Develop → Build app → Server-to-Server OAuth | `lib/zoom/client.ts:30-32` (3 creds) | **Create** a Server-to-Server app with `meeting:write` (and `user:read` for host lookup). Get Account ID, Client ID, Client Secret. Put in `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET`. |
| 6 | Zoom host user ID | Zoom dashboard → Users → pick the tutor account | `services/zoom/meetings.ts:createMeeting` | **Create / designate** a Zoom user that will host the meetings; copy the user ID into `ZOOM_DEFAULT_HOST_USER_ID`. |
| 7 | Zoom webhook (optional, for `meeting.ended` → session-completed) | Zoom marketplace → Feature → Event subscription → `meeting.ended` → callback `https://<prod-host>/api/webhooks/zoom` (TODO: route does not exist yet) | Workflow `module-completed.json` | **Defer** — Zoom webhook + the matching Next.js route is a Sprint 5+ item (the current code path tolerates a missed `meeting.ended` via the tutor dashboard manual completion). |
| 8 | Calendly Personal Access Token | Calendly → Integrations → API → Personal access tokens | `services/calendar/calendly.ts:32-33` | **Create** PAT, put in `CALENDLY_PERSONAL_TOKEN`. |
| 9 | Calendly webhook signing key | Calendly → Integrations → Webhooks → Add subscription `invitee.created`, `invitee.updated`, `invitee.canceled` → callback `https://<prod-host>/api/webhooks/calendly` | `app/api/webhooks/calendly/route.ts:18-20` | **Create** webhook subscription, copy the signing key into `CALENDLY_WEBHOOK_SIGNING_KEY`. |
| 10 | Calendly event types | Calendly → Event types | `calendly_event_uri` stored on each `sessions` row | **Create** one event type per session the admin wants to offer; copy the event URI into the session's `calendly_event_uri` field. |
| 11 | Resend API key | Resend dashboard → API keys | `lib/email/client.ts:8-10` | **Create** API key, put in `RESEND_API_KEY`. |
| 12 | Resend verified sender domain | Resend dashboard → Domains → Add domain → add the DNS records | `lib/email/send.ts:55` (`from:` field) | **Verify** a sending domain (e.g. `mail.integrale.app`); put the `no-reply@…` address in `RESEND_FROM_EMAIL`. |
| 13 | n8n Cloud workspace | n8n.cloud → Sign up / log in | `scripts/deploy-n8n.sh`, every workflow | **Create** an n8n Cloud workspace (or self-host) and put its public URL in `N8N_BASE_URL`. |
| 14 | n8n API key | n8n workspace → Settings → API | `scripts/deploy-n8n.sh` | **Create** an API key, put in `N8N_API_KEY`. |
| 15 | n8n webhook secret (shared with Next.js) | n8n workflow → Webhook node header `X-Webhook-Secret` | `app/api/webhooks/n8n/route.ts:36` | **Generate** a random secret, set it as both the env var and the header check in every n8n workflow that POSTs back to Next.js. |
| 16 | n8n credential: Supabase service role | n8n → Credentials → Header Auth | All 9 workflow JSONs (nodes reading `$env.SUPABASE_SERVICE_ROLE_KEY`) | **Create** a Header Auth credential with `apikey` header → value `$SUPABASE_SERVICE_ROLE_KEY`. |
| 17 | n8n credential: Stripe | n8n → Credentials → Stripe | Workflows 1 (`enrollment-created`) and 7 (`module-cancellation` for refund-trigger) | **Create** a Stripe credential with the same Restricted key as `STRIPE_SECRET_KEY`. |
| 18 | n8n credential: Zoom OAuth2 | n8n → Credentials → OAuth2 | Workflow 2 (`module-booking-to-zoom`) | **Create** an OAuth2 credential with the same S2S app creds as Zoom. |
| 19 | n8n credential: Calendly PAT | n8n → Credentials → Header Auth | Workflows 2, 6, 7 | **Create** a Header Auth credential with `Authorization: Bearer <CALENDLY_PERSONAL_TOKEN>`. |
| 20 | n8n credential: Resend | n8n → Credentials → Header Auth | Workflows 4, 5, 8, 9 | **Create** a Header Auth credential with `Authorization: Bearer <RESEND_API_KEY>`. |
| 21 | Vercel account + project | vercel.com → Sign up | `apps/web/` deploy | **Create** a Vercel team + 3 projects (`production`, `staging`, per-PR preview). Connect the GitHub repo. |
| 22 | Vercel env vars (per project) | Vercel project → Settings → Environment Variables | All 22+ env vars above | **Set** every env var above, scoped per environment. |

---

## 5. Accounts to create

**Current state:** only **Supabase** exists (project `ffillswcwzefhlojtnkq`, EU region).

**To create (5 services + 1 host):**

| # | Service | Why | What the user must do |
|---|---|---|---|
| 1 | **Stripe** | Payment processor for the v2 unit-of-payment (`session_grants`). | Sign up at `dashboard.stripe.com`. Activate the account (KYC). Switch to **live mode** for production. Create the Restricted key + webhook endpoint. |
| 2 | **Zoom** | Server-to-Server OAuth app for creating per-session meetings. | Sign up at `marketplace.zoom.us`. Create a Server-to-Server OAuth app with `meeting:write`. Note the tutor host user ID. |
| 3 | **Calendly** | Scheduling for student bookings. | Sign up at `calendly.com`. Create one event type per session. |
| 4 | **Resend** | Transactional email (booking confirmation, reminders, cancellations). | Sign up at `resend.com`. Verify a sending domain. |
| 5 | **n8n Cloud** (or self-host) | Automation layer that calls Stripe / Zoom / Resend on the booking path. | Sign up at `n8n.cloud` (or self-host via Docker on a Hetzner / Fly.io VM). |
| 6 | **Vercel** | Next.js hosting. | Sign up at `vercel.com`. Connect the GitHub repo. Provision 3 projects. |
| 7 | **Sentry** | Error monitoring. *(Defer to Phase 5 per the locked roadmap.)* | Sign up at `sentry.io`. Create a Next.js project. |

**Optional / defer:**

- **Upstash** (Redis for rate-limiting + cron job queue, Phase 5) — not required for Sprint 4.
- **GitHub** (already in use — repo exists, CI workflows exist).

---

## 6. Existing integration code and missing implementation

### 6.1 Supabase — complete

- Migrations: 27 files, forward-only, all applied to the remote.
- RLS: 13 policy-block assertions in `supabase/tests/rls_smoke_assertions.sql`.
- Service layer: `services/curriculum/*`, `services/admin/*`, `services/zoom/*`, `services/calendar/*`, `services/auth.ts`, `services/tutors.ts`, `services/courses.ts`.
- Storage: 3 buckets configured.
- Triggers: 5 in production (audit, late-cancel, tutor-overlap, role self-escalation, refund cascade) + `module_unlock_check` removed in v2 (replaced by session grants).

**Missing:** Sentry error reporting (Phase 5). Branching workflow (per-PR Supabase branches, deferred).

### 6.2 Calendly — webhook + embed wired, REST surface wired

**Done:**

- `services/calendar/calendly.ts` — Bearer-token REST wrappers (list event types, get current user, etc.).
- `app/api/webhooks/calendly/route.ts` — verifies `Calendly-Webhook-Signature` (HMAC-SHA256), handles `invitee.created` / `invitee.updated` / `invitee.canceled`, writes to `session_bookings`.
- `components/marketing/calendly-embed.tsx` — inline-embed widget on the course detail page (Sprint C).
- `NEXT_PUBLIC_CALENDLY_URL` referenced from the marketing CTA.

**Missing / gaps:**

- **No "Calendly scheduler" picker on the student booking page.** Today the student navigates to the public Calendly URL via CTA; the **structured** picker (where the student picks a tutor + session + time) does not exist in the student dashboard. This is **Phase 4 / Sprint 6 backlog** ("student-side booking flow") per `PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.2.
- **No "Calendly event URI" admin UI** — the admin currently has to set `calendly_event_uri` on each session by hand. No future-sprint scope item; can be added as a Sprint 4 follow-up.

### 6.3 Stripe — webhook + checkout flow wired, refund wired

**Done:**

- `lib/stripe/client.ts` — lazy client.
- `app/api/webhooks/stripe/route.ts` — signature verification, `checkout.session.completed` (creates `session_grants.status='active'`, `payments.status='paid'`, `session_progress` rows), `charge.refunded` (cascades via the `fn_enrollments_refund` trigger).
- `app/api/session-grants/[id]/stripe-session/route.ts` — POST creates the Stripe Checkout Session via n8n.
- `app/api/session-grants/[id]/refund/route.ts` — admin-only refund delegation to n8n.

**Missing / gaps:**

- **Sprint C resend retry / dead-letter** (per backlog §4.2): the Stripe webhook handler does its own dead-letter via `n8n_dead_letters`, but if a Stripe event delivery itself is retried after the first attempt logs a 5xx, the row is annotated but the dead-letter is not retried automatically. Defer to Sprint 5+.
- **The "resend email" admin action** in `/admin/bookings/[id]` is currently **disabled** (visible in the code). The email send is delegated to n8n (which POSTs to `app/api/webhooks/n8n?type=email`). To re-enable the button, the route needs the `n8n_resend_email` webhook URL. This is in scope for Sprint 4.

### 6.4 Zoom — typed service wired, no Next.js direct call (locked arch)

**Done:**

- `lib/zoom/client.ts` — S2S-OAuth token + `zoomFetch` helper.
- `services/zoom/meetings.ts` — `createMeeting`, `updateMeeting`, `deleteMeeting` (typed).
- Locked architecture: n8n calls Zoom on the booking path; Next.js does not. The service exists for unit-testability + future migration to direct calls (if ever approved).

**Missing / gaps:**

- **No `meeting.ended` inbound webhook** in `app/api/webhooks/`. The `module-completed` n8n workflow depends on a Zoom webhook that does not yet have a Next.js receiver. When this lands, the workflow is finalised. **Sprint 5+ scope.**
- **No Zoom webhook subscription** in the user's Zoom account (per §4 row 7).

### 6.5 Resend — send + templates wired, mock-gated

**Done:**

- `lib/email/{client,send}.ts` — `sendTemplatedEmail` helper.
- 6 React Email templates (`enrollment_confirmed`, `session_booking_confirmed`, `reminder_24h`, `reminder_1h`, `session_cancelled`, `admin_dead_letter`).
- Mock gate: empty `RESEND_API_KEY` → returns `{ id: 'mock' }`, no destructive send.
- Used by `app/api/contact/route.ts` (direct Next.js → Resend) and by `app/api/webhooks/n8n/route.ts?type=email` (n8n → Next.js → Resend).

**Missing / gaps:**

- **Sprint C resend retry / dead-letter** (per §4.2 backlog): no exponential-backoff retry of failed Resend sends; failures are logged to the n8n execution log but not retried.
- **Locale-aware subject lines** are partially present (each template's `_base` has FR + EN). The dispatcher picks the locale from the input. Confirmed working.
- **No transactional templates for:** tutor re-engagement emails, post-session follow-up, refund issued, dispute opened. These are Phase 5+.

### 6.6 n8n — 9 workflow JSONs scaffolded, not deployed

**Done:**

- 9 JSON files in `n8n/workflows/`, each with `active: false`.
- `n8n/docs/WORKFLOWS.md` is the full spec.
- `scripts/deploy-n8n.sh` exists; it does `n8n import:workflow --input=<file>` per workflow.

**Missing / gaps:**

- **No real n8n Cloud workspace** (account not created; `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_WEBHOOK_SECRET` empty).
- **No credential set in the workspace** (`n8n/credentials/` is empty by design — no real secrets committed).
- **No execution log table** in the DB — `n8n_executions` is mentioned in `WORKFLOWS.md` §6 but the migration has not been written. The user explicitly forbade writing new migrations, so this must be added to a future migration when the user lifts the constraint.
- **No `n8n_dead_letters` table** — also mentioned in `WORKFLOWS.md` §5 but not migrated. Same gating.
- **The 9 JSON files are pre-Sprint 3.5.** The filenames still say `module-*` even though the v2 hierarchy renamed the underlying types. The JSON bodies use the v2 field names (`session_grant_id`, `session_booking_id`, etc.) — confirmed in `WORKFLOWS.md` §0 — but the **filenames are stale** and may cause confusion when importing. **Sprint 4 cleanup**: rename to `session-grant-created.json`, `session-booking-to-zoom.json`, `session-completed.json`, `session-cancellation.json`, `session-confirmation-email.json`. The user can confirm whether this rename is in scope.

### 6.7 Vercel — config + middleware ready, no projects

**Done:**

- `next.config.mjs` (CSP, HSTS, headers, dev-overlay 204 stub).
- `middleware.ts` (auth + role + locale).
- `.github/workflows/ci.yml` (lint/type-check/test/build).
- `.github/workflows/codeql.yml` (CodeQL).
- `.github/workflows/secret-scan.yml` (gitleaks).

**Missing / gaps:**

- No Vercel account.
- No Vercel projects (`production`, `staging`).
- No env vars set in any Vercel project.
- No custom domain.

---

## 7. n8n workflows — file inventory + readiness

(9 JSON files, all `active: false`. Workflow spec in `n8n/docs/WORKFLOWS.md`.)

| # | File | Trigger | Steps (from spec) | Sprint 4 readiness |
|---|---|---|---|---|
| 1 | `enrollment-created.json` | Stripe `checkout.session.completed` (POST to n8n from Next.js `/api/session-grants/[id]/stripe-session`) | Verify HMAC, lookup session_grant, create Stripe session, call back Next.js, trigger email | **JSON ready**, needs import + activation in n8n Cloud + credentials (Supabase, Stripe) |
| 2 | `module-booking-to-zoom.json` | Calendly `invitee.created` (Next.js webhook forwards) | Verify HMAC, lookup session + session_grant, validate active, call Zoom, write meeting_link, update booking, fire confirmation + tutor emails | **JSON ready**, needs n8n import + 4 credentials (Supabase, Zoom, Calendly, Resend) |
| 3 | `module-completed.json` | Zoom `meeting.ended` (requires Zoom webhook to land at a Next.js route that forwards to n8n — **route does not exist yet**) | Lookup meeting_link, flip booking + session_progress to completed, check completion, fire admin email | **JSON ready**, blocked by missing Zoom webhook route (Sprint 5+ scope) |
| 4 | `module-confirmation-email.json` | n8n internal (chain from 2) | Lookup booking + meeting_link, render React Email, send via Resend, insert notification | **JSON ready**, needs n8n import + 2 credentials (Supabase, Resend) |
| 5 | `module-reminder-scheduler.json` | n8n Cron every 15 min | Query bookings for T-24h / T-1h, send reminder, insert notification (idempotent) | **JSON ready**, needs n8n import + 2 credentials (Supabase, Resend) |
| 6 | `module-reschedule.json` | Calendly `invitee.updated` (forwarded) | Void old Zoom, create new, update meeting_link + booking, send reschedule email | **JSON ready**, needs n8n import + 3 credentials (Supabase, Zoom, Resend) |
| 7 | `module-cancellation.json` | Calendly `invitee.canceled` OR `POST /api/session-bookings/[id]/cancel` | Update booking to cancelled, delete Zoom meeting, send cancellation email, fire admin email | **JSON ready**, needs n8n import + 3 credentials (Supabase, Zoom, Resend) |
| 8 | `admin-notification.json` | n8n internal (1, 2, 3, 5, 6, 7) | Compose email, send to admin | **JSON ready**, needs n8n import + Resend credential |
| 9 | `tutor-notification.json` | n8n internal (2) | Send tutor email with host `start_url` | **JSON ready**, needs n8n import + Resend credential |

---

## 8. Phased Sprint 4 implementation plan (after the accounts are created)

This is the **proposed** plan, not a commitment. The user must explicitly approve before any work begins. The plan assumes all Sprint 4 backlog items from `PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.1 plus the gaps surfaced in this report are in scope.

### Phase 0 — Secrets & accounts (operator steps, no code)

1. Rotate the Supabase keys that are currently in `.env.example` (user-only step, gated on the standing instruction). Rewrite the file to ship placeholders.
2. Create the 5 missing accounts: Stripe, Zoom, Calendly, Resend, n8n Cloud. (Vercel can come in Phase 0.5.)
3. Provision the credentials, webhook endpoints, and OAuth apps per §4 of this report.
4. Set every env var in Vercel for the `staging` environment first.

### Phase 1 — n8n deploy + smoke (half a day)

1. Run `scripts/deploy-n8n.sh` against the n8n Cloud workspace; import all 9 workflows.
2. Wire the n8n credentials (Supabase, Stripe, Zoom, Calendly, Resend).
3. Activate the 8 workflows (everything except `module-completed`, which is blocked by the missing Zoom webhook route).
4. Smoke-test each workflow with a hand-crafted POST. **No real customer data.**
5. Decide whether the workflow filename cleanup (`module-*` → `session-*`) is in scope; if yes, run that rename in this phase.

### Phase 2 — End-to-end booking on `staging`

1. Verify the booking path: sign up as a student → pick a course → POST `/api/session-grants` → POST `/api/session-grants/[id]/stripe-session` → complete Stripe Checkout (test mode) → webhook fires → n8n fires the `enrollment-created` workflow → confirmation email arrives.
2. Verify the Calendly → Zoom path: webhook from Calendly → n8n `module-booking-to-zoom` → Zoom meeting created → confirmation email + tutor notification.
3. Verify the cancellation path: `POST /api/session-bookings/[id]/cancel` → n8n `module-cancellation` → Zoom meeting deleted → cancellation email.
4. Verify the refund path: admin `POST /api/session-grants/[id]/refund` → n8n → Stripe refund → `charge.refunded` webhook → DB flip.

### Phase 3 — Admin "manual actions" polish (Sprint 4 backlog)

1. Re-enable the "Resend email" button on `/admin/bookings/[id]` (today it's disabled — wire it to the n8n `session-confirmation-email` workflow via a new admin API route).
2. **Tutor edit form** on `/admin/tutors/[id]` (the next-up item from `PHASE2_SPRINT_3.8.1_SUMMARY.md` §4.1). CRUD: name, email, headline, bio, zoom_user_id, calendly_event_uri, is_active, is_archived.
3. **Audit forms, buttons, links for completeness** — the catch-all pass per the same backlog.
4. **Remove placeholder implementations** — the catch-all pass; the most likely target is the disabled "Resend email" button (once Phase 3.1 lands, it is no longer a placeholder).

### Phase 4 — Hardening for `main` deploy

1. Promote `staging` to `main`. Vercel auto-deploys.
2. Run the RLS smoke suite (`scripts/rls-smoke.sh`) against the production Supabase.
3. Run the Vitest suite end-to-end (37 files, 297 tests, currently green).
4. Run a real Stripe live-mode charge (smallest amount) end-to-end. Verify the receipt + Zoom link.
5. Tag the release per the git workflow (`v<x.y.z>-phase<n>-sprint<m>`).
6. Update `PROJECT_STATE.md`, `CHANGELOG.md`, and write the sprint close-out.

### Phase 5 — Phase 2 review (optional, gated on user)

1. Write `docs/review/PHASE2_REVIEW.md` per the locked architecture review template.
2. Capture any debt or follow-up items for Phase 3/4/5.

---

## 9. Final Sprint 4 readiness score + implementation order

### 9.1 Readiness score

Dimension scoring (0–10; weighted at the end):

| Dimension | Score | Why |
|---|---|---|
| Schema & migrations | **10** | All 27 migrations applied; 13 RLS policy blocks asserted; remote in v2 shape. |
| Supabase RLS + auth | **10** | JWT in `httpOnly` cookies; `is_admin()` / `is_super_admin()` helpers; RLS on every public table. |
| Next.js application code | **10** | All Sprint 3 deliverables shipped; 297/297 tests green; 4 quality gates green. |
| API route handlers (Next.js side) | **10** | 39 routes (admin, auth, webhooks, curriculum, profile, health, contact). |
| Stripe integration (code) | **9** | Webhook + checkout + refund paths all wired. One gap: the "Resend email" admin action is disabled. |
| Zoom integration (code) | **7** | Typed service wired + 1 unlock point (host user ID) + 1 forward-only gap (`meeting.ended` inbound webhook). |
| Calendly integration (code) | **9** | Webhook + embed + REST wrappers wired. One gap: no structured student-side picker. |
| Resend integration (code) | **9** | 6 templates + mock-gated send. One gap: no retry/dead-letter on Resend failure. |
| n8n workflows (code) | **9** | 9 JSON files spec-complete; one gap: stale `module-*` filenames; one gap: no `n8n_executions` / `n8n_dead_letters` tables in DB. |
| Vercel hosting | **5** | Config + middleware + CI ready; no projects provisioned; no env vars set; no custom domain. |
| Third-party accounts | **1** | Only Supabase exists. Stripe / Zoom / Calendly / Resend / n8n / Vercel all missing. |
| Security follow-up (rotate Supabase keys in `.env.example`) | **0** | Done, but the file still ships real keys (gated on user). |
| **Weighted total** | **~74 / 120 = 62 %** | Code is essentially done; the work that remains is operational (account creation + key rotation) plus the small Sprint 4 backlog (tutor edit, audit pass, resend button). |

### 9.2 Implementation order (after the user lifts the "no Sprint 4" constraint)

1. **Sprint 4.0 — Operator prep** (no code, gated on user): rotate Supabase keys; create the 5 missing accounts; set env vars in Vercel `staging`.
2. **Sprint 4.1 — n8n deploy** (code: rename `module-*.json` → `session-*.json`; deploy + activate 8 of 9 workflows; smoke-test each). Half a day.
3. **Sprint 4.2 — End-to-end on `staging`** (no new code, just verification). One day.
4. **Sprint 4.3 — Admin "manual actions"** (code: tutor edit form; re-enable "Resend email"; audit pass; placeholder removal). Two days.
5. **Sprint 4.4 — Hardening + production deploy** (no new code, just promotion). One day.
6. **Sprint 4.5 — Close-out docs + tag + push** (PROJECT_STATE + CHANGELOG + sprint summary + tag). Half a day.

**Total: ~5 working days** of code + ~2 days of operator prep, against the 1.5-week Sprint 4 target in `docs/DevelopmentRoadmap.md`.

### 9.3 What is NOT in scope of Sprint 4 (per the locked architecture + the backlog §4.2)

- Sentry + Upstash (Phase 5)
- Public tutor profile pages (`/tutors/[uuid]`) (Phase 4)
- Course cover images (Phase 4)
- Resource uploads + `resource_grants` (Phase 4)
- `n8n_executions` + `n8n_dead_letters` DB tables (deferred — requires new migration, gated on user)
- Student-side booking flow (Sprint 6)
- `meeting.ended` Zoom webhook + matching Next.js route (Sprint 5+)

---

## 10. Open questions for the user (no code changes will happen until answered)

1. **Are the 5 third-party accounts (Stripe, Zoom, Calendly, Resend, n8n Cloud, Vercel) going to be created by the user before Sprint 4 starts, or should the assistant wait for them?** (The current standing constraint is "do not commit anything", which the assistant reads as "do not start Sprint 4".)
2. **Is the workflow filename cleanup (`module-*.json` → `session-*.json`) in Sprint 4 scope, or should it be deferred to avoid breaking any active n8n import?**
3. **Is the "Resend email" admin action in Sprint 4 scope, or does the disabled button stay for Phase 5?**
4. **Is the tutor edit / archive form in Sprint 4 scope, or is it a Sprint 5 item?**
5. **Should the `.env.example` Supabase keys be rotated + replaced with placeholders as part of Sprint 4.0?**

---

*Last updated: 2026-07-20. Owner: project lead. This is a read-only
audit. No code modified, no files created (this report excepted),
no Sprint 4 work started.*
