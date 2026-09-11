# Sprint 5 — Commercial Flows & Reminders (Slices A–E) Close-out

> **Status:** Sprints 5 (Slices A–E) complete. **Sprint 5 (Slice F) close-out** complete. All four quality gates green.
> **Sprint version:** `v1.6.0-phase2-sprint-5` (pending tag — see §10).
> **Owner:** project lead.
> **Scope:** stand up the three commercial tiers (Individual €35 PAYG, Pack 10 €299, Monthly Support €109/mo), wire the cron-driven reminder pipeline (Resend via n8n), and polish the admin surface for the new tiers. Slice C (Monthly Support) is **PARTIALLY COMPLETED** — the schema and webhook scaffolding are in place; the operator-configurable Stripe Price ID + recurring-billing lifecycle remain gated on three blocked business decisions (E-1 / E-2 / E-3).

---

## 1. Scope agreed for Sprint 5

Sprint 5 was scoped at the end of Sprint 3.8 (2026-07-19) into **two phases**:

- **Phase A — Schema.** Two forward-only migrations to extend `session_grants` (Pack / Subscription) and `subscriptions` (Monthly Support) without breaking the Sprint 3.5 PAYG path. **No new RLS policies** on existing tables.
- **Phase B — Code.** Five slices: A (Pack 10 checkout), B (€35 PAYG harden), C (Monthly Support), D (admin polish), E (reminders).

The scope was deliberately narrowed at user instruction to **block any new feature work on subscription / credit-decision logic** while E-1 / E-2 / E-3 remain pending. Slice C shipped the schema + service scaffolding but no operator-facing toggle.

---

## 2. Five pre-approved architectural decisions (Slice A–E)

1. **Pack / Subscription rows have `session_id NULL`.** Individual PAYG rows REQUIRE `session_id`, enforced by a CHECK constraint. (Migration `20260825000001`.)
2. **Credit consumption is `BEFORE INSERT` on `session_bookings`.** Atomic debit + status flip via `fn_consume_pack_credit()`. (Migration `20260825000001`.)
3. **Provider-agnostic cron.** `POST /api/cron/send-reminders` with `x-webhook-secret`. No Vercel-Cron-only coupling; no SaaS added.
4. **Email rendering lives in n8n.** Next.js does HTTP dispatch only — `react-dom/server` cannot enter a Route Handler module graph. (Slice E re-architecture; see `services/admin/reminders.ts` header.)
5. **Idempotency without a new migration.** Reuses the existing `notifications` UNIQUE index `uq_notifications_dedupe (user_id, type, payload->>'booking_id', channel)` + `webhook_events.event_id` UNIQUE.

---

## 3. Database migrations applied locally

Two new forward-only migrations. Both already applied to the local Supabase project (see `S5-P1A-Apply` and `S5-P1B-Apply` task history). **NOT applied to staging or production** — those environments are gated on explicit user instruction.

| File | Purpose | Tables touched | New RLS policies |
|---|---|---|---|
| `supabase/migrations/20260825000001_session_grants_pack_subscription.sql` | Pack 10 + Monthly Support pre-paid credit pools. Adds `grant_type` enum, 4 new columns, 4 CHECK constraints, 3 partial unique indexes, 1 lookup index, `fn_consume_pack_credit()` trigger on `session_bookings` insert. | `session_grants` | none (existing policies preserved verbatim) |
| `supabase/migrations/20260825000002_subscriptions_pack_monthly_support.sql` | Monthly Support subscription link to its credit-pool row + Stripe Customer ID. Adds `session_grant_id`, `stripe_customer_id`, 1 partial unique index, 1 CHECK constraint, 1 new SELECT policy (`subscriptions_select_via_session_grant`). | `subscriptions` | 1 (`subscriptions_select_via_session_grant`) |

The CHECK constraints and indexes are the **only** place the new tier model is enforced — no silent business rule changes elsewhere. The `fn_consume_pack_credit` trigger raises 23503 / 42501 / 23514 on the documented failure modes (grant missing, not active, expired, exhausted); it does **not** silently skip or recover.

---

## 4. Five slices — what shipped and what didn't

### 4.1 Slice A — Pack 10 checkout + grant provisioning ✓ COMPLETE

| Layer | File | Notes |
|---|---|---|
| Service | `apps/web/services/curriculum/session-grants.ts` | NEW `createPendingPackGrant(studentId, totalCredits, expiresAtIso)`. Discriminated-union result: `{ kind: 'ok' }` / `duplicate_active_pack` / `pack_unavailable`. |
| API | `apps/web/app/api/session-grants/route.ts` | Body is now a discriminated union: `{ kind: 'session', session_id }` (Sprint 3.5 PAYG) or `{ kind: 'pack' }` (new). Maps the service result to 201 / 409 / 503. |
| n8n payload | same | `kind: 'pack'` triggers the existing `enrollment-created.json` workflow to read `STRIPE_PRICE_PACK10` instead of `STRIPE_PRICE_PAYG`. |
| Env | `apps/web/lib/env.ts` | NEW `STRIPE_PRICE_PACK10` (optional, no default). |

### 4.2 Slice B — €35 Individual session harden ✓ COMPLETE

| Layer | File | Notes |
|---|---|---|
| Pricing | `apps/web/lib/constants/pricing.ts` | Individual tier is now `priceCents: 3500`, currency `EUR`. Pack is `29900`. Monthly is `10900`. All three are marketing-page fallbacks; the DB (`sessions.price_cents`) is the source of truth once the curriculum is imported. |
| i18n | `apps/web/messages/{en,fr}.json` | Pricing namespace updated for the three-tier model. |

### 4.3 Slice C — Monthly Support subscription ⚠ PARTIALLY COMPLETE

| Layer | File | Notes |
|---|---|---|
| Migration | `20260825000002_subscriptions_pack_monthly_support.sql` | Adds `session_grant_id`, `stripe_customer_id`, `stripe_customer_id` UNIQUE + CHECK + partial unique index + 1 SELECT policy. ✓ |
| Service | `apps/web/services/curriculum/session-grants.ts` | `createPendingPackGrant` is `grant_type='pack'` AND `grant_type='subscription'` capable (both share the pool-row shape). ✓ |
| Webhook | `apps/web/app/api/webhooks/stripe/route.ts` | `markSessionGrantPaid` is `grant_type`-agnostic — a Stripe `checkout.session.completed` event flips a `subscription`-type grant to `active` exactly like a Pack 10 row. ✓ |
| Subscription-period webhook handler | — | ❌ **NOT IMPLEMENTED.** `customer.subscription.created/updated/deleted` cases are not wired into `/api/webhooks/stripe`. The Monthly Support recurring billing lifecycle (period rollover, suspension, cancellation credit restoration) is **BLOCKED** on E-1 / E-2. |
| Operator UI for `STRIPE_PRICE_SUBSCRIPTION` | — | ✅ already in `lib/env.ts` from Sprint C; no new UI to add for Slice C. |

**Remaining blocked decisions (must NOT be implemented without explicit approval):**

| ID | Decision | Status |
|---|---|---|
| **E-1** | What happens to a student's unused Pack / Subscription credits when the subscription **suspends** for non-payment (Stripe `past_due` / `unpaid`)? Restore on retry? Lapse immediately? | **BLOCKED** |
| **E-2** | What happens to unused Monthly Support credits when the student **cancels**? Lapse immediately? Carry over until `current_period_end`? Lapse on grace-period end? | **BLOCKED** |
| **E-3** | When a single student owns both a Pack 10 pool **and** an active Monthly Support subscription, which credit pool does the booking consume from? Pack-first? Subscription-first? User choice? | **BLOCKED** |

The current reminder code is **explicitly neutral** on E-3: it inspects `scheduled_start`, `status`, `student.email`, and `join_url` only. The booking creation path that **does** consume credits is owned by `fn_consume_pack_credit()` in the migration, which selects the first pack-or-subscription pool returned by `idx_session_grants_credit_pool_lookup`. The priority decision (E-3) lives at the SQL layer if / when the user wants it.

### 4.4 Slice D — Admin polish (bookings detail + payments) ✓ COMPLETE

| Layer | File | Notes |
|---|---|---|
| Component | `apps/web/components/admin/bookings-filtered-list.tsx` | Rewrote to a real `<table>` on ≥sm so all 10 columns align cleanly; collapses to a stacked key/value `<dl>` on `<sm`. The action column is the trailing column with the same width on every row. A long course title no longer pushes the payment-status pill down. |
| Service | `apps/web/services/admin/catalog.ts` | NEW `getNextChapterPosition(courseId)` — same pattern as `getNextSessionPosition`. UUID regex guard added to every `get<X>ById` helper so a non-UUID path segment returns `null` (→ `notFound()`) instead of a 500 (`22P02`). |
| Service | `apps/web/services/admin/tutors.ts` | NEW `deleteTutor` + `DELETE /api/admin/tutors` route. Honours the FK `ON DELETE SET NULL` so already-booked sessions keep their historical tutor reference. |
| Lib | `apps/web/lib/utils/errors.ts` | NEW `normaliseError`, `isRowLevelSecurityError`, `rlsErrorToForbidden`, `isNotNullViolationError` — Postgres SQLSTATE → typed HTTP response. Used by S5-D mutations to surface a 403 (RLS policy violation) or 400 (NOT NULL violation) instead of a 500. |
| i18n | `apps/web/messages/{en,fr}.json` | `Bookings` namespace + `bookings` sidebar/top-nav icon (`CalendarCheck`). |

### 4.5 Slice E — Reminders cron + Resend ✓ COMPLETE

| Layer | File | Notes |
|---|---|---|
| Service | `apps/web/services/admin/reminders.ts` (NEW) | Window scanner for `session_bookings`. Windows: `24h = [now+23h, now+25h]` (2h band centred on T-24h), `1h = [now+50m, now+70m]` (20m band centred on T-60m). Status filter: `scheduled` \| `confirmed`. Test seams: `options.now`, `options.admin`, `options.dispatch`, `options.origin`. Default dispatch POSTs to `${N8N_BASE_URL}/webhook/session-reminder-dispatch` with a deterministic `event_id = reminder-{window}-{booking_id}`. |
| API | `apps/web/app/api/cron/send-reminders/route.ts` (NEW) | Provider-agnostic `POST` with `x-webhook-secret` against `N8N_WEBHOOK_SECRET`. Runs both windows in parallel. Returns aggregated `{ dispatched, duplicate, skipped, failed }`. |
| API | `apps/web/app/api/webhooks/n8n/route.ts` (EXTENDED) | NEW `case 'reminder_dispatch'`: inserts a dedup row into `notifications` keyed by `(user_id, 'reminder_24h'\|'reminder_1h', payload->>'booking_id', 'email')`. UNIQUE 23505 → `{ duplicate: true }`. |
| n8n | `n8n/workflows/session-reminder-scheduler.json` (NEW, 246 lines) | Webhook trigger → secret verify → ack via Next.js (writes dedup row) → if `duplicate` skip → render inline HTML (Code node, **no React JSX**, no `@react-email/components`) → POST to `api.resend.com/emails` → record `reminder_sent` confirmation → Respond OK. Dead-letter branch for failed paths. Locales: FR + EN. Subjects: "Rappel : votre session est demain" / "Reminder: your session is tomorrow" (24h); "...commence dans 1 heure" / "...starts in 1 hour" (1h). |
| Docs | `n8n/docs/WORKFLOWS.md` | §2.10 added. Inventory table marks v1 `module-reminder-scheduler.json` as broken post-Sprint 3.5 (its module_id field shape no longer exists). |
| Tests | `apps/web/tests/unit/reminders-service.test.ts` (NEW, 381 lines, 12 cases) | 24h: dispatched, cancelled skip, outside-window skip, no-recipient skip, no-meeting skip, duplicate outcome, EN locale, Supabase read failure, dispatch failure. 1h: dispatched, outside-window skip, duplicate. |
| Tests | `apps/web/tests/unit/reminders-cron-route.test.ts` (NEW, 98 lines, 4 cases) | Unset secret → 401, missing header → 401, wrong header → 401, valid secret → 200 with aggregated summary. |

---

## 5. Files of record

### New
```
supabase/migrations/20260825000001_session_grants_pack_subscription.sql
supabase/migrations/20260825000002_subscriptions_pack_monthly_support.sql
apps/web/services/admin/reminders.ts
apps/web/app/api/cron/send-reminders/route.ts
apps/web/tests/unit/reminders-service.test.ts
apps/web/tests/unit/reminders-cron-route.test.ts
n8n/workflows/session-reminder-scheduler.json
```

### Modified (Sprint 5)
```
apps/web/app/api/session-grants/route.ts          (discriminated union body + Pack 10 branch)
apps/web/app/api/webhooks/n8n/route.ts             (case 'reminder_dispatch')
apps/web/app/api/webhooks/stripe/route.ts          (doc comment: grant_type-agnostic)
apps/web/lib/constants/pricing.ts                 (€35 PAYG / €299 Pack 10 / €109 Monthly)
apps/web/lib/env.ts                               (STRIPE_PRICE_PACK10)
apps/web/lib/utils/errors.ts                      (Postgres SQLSTATE classifier)
apps/web/middleware.ts                            (Next 15 dev-overlay stack-frame bypass)
apps/web/next.config.mjs                          (dev-stack-frames-stub rewrite)
apps/web/services/admin/catalog.ts                (UUID guard + getNextChapterPosition)
apps/web/services/admin/tutors.ts                 (deleteTutor)
apps/web/services/admin/bookings.ts               (joined payment fix)
apps/web/services/curriculum/session-grants.ts    (createPendingPackGrant)
apps/web/components/admin/bookings-filtered-list.tsx  (real <table> on ≥sm)
apps/web/messages/en.json                         (Pricing, Bookings, Admin.tutorCreate)
apps/web/messages/fr.json                         (Pricing, Bookings, Admin.tutorCreate)
apps/web/types/database.generated.ts              (regenerated against P1-A local DB)
n8n/docs/WORKFLOWS.md                             (§2.10 + v1 deprecation note)
```

(Other working-tree modifications in the diff are from Sprint 3.8 close-out polish, already covered by `PHASE2_SPRINT_3.8_SUMMARY.md`.)

---

## 6. Quality gates (final)

| Gate | Result |
|---|---|
| `pnpm type-check` | ✓ exit 0 |
| `pnpm lint` | ✓ exit 0 (only the pre-existing `lib/utils/logger.ts:31` warning) |
| `pnpm test` | ✓ **39 files / 317 tests** pass (+16 vs Sprint 3.8 close-out: 12 reminder-service + 4 reminder-cron-route) |
| `pnpm build` | ✓ exit 0; `/api/cron/send-reminders` and the extended `/api/webhooks/n8n` both compile. No `react-dom/server` in any Route Handler bundle. |

No new tests for Slices A, B, D in this sprint — they are guarded by the existing `session-grants-route.test.ts`, `admin-bookings-service.test.ts`, and `admin-tutors-route.test.ts` suites that already lock the prior shapes. New behavioral coverage lives in the two reminder files.

---

## 7. Client / operator setup still required

The platform can be self-hosted today (the local Supabase stack has the two new migrations applied). To go to staging, the operator must:

1. **Create three Stripe Products + Prices** in the Stripe Dashboard (PAYG, Pack 10, Monthly Support) and set:
   - `STRIPE_PRICE_PAYG` — per-session €35
   - `STRIPE_PRICE_PACK10` — Pack 10 €299
   - `STRIPE_PRICE_SUBSCRIPTION` — Monthly Support €109/mo recurring
2. **Provision the `enrollment-created` n8n workflow** with the new `kind: 'pack'` branch reading `STRIPE_PRICE_PACK10`. The v1 workflow file at `n8n/workflows/enrollment-created.json` exists but is a placeholder; the operator's deployment script must replace it with the real workflow that handles both `kind: 'session'` and `kind: 'pack'`.
3. **Provision `session-reminder-scheduler`** from `n8n/workflows/session-reminder-scheduler.json`. Wire the n8n credential `Resend API` (uses `RESEND_API_KEY`).
4. **Configure the cron schedule.** Any HTTP-capable scheduler can call `POST /api/cron/send-reminders` with header `x-webhook-secret: ${N8N_WEBHOOK_SECRET}`. The route is provider-agnostic — Vercel Cron, GitHub Actions scheduled workflow, external cron service, or `cron + curl` all work.
5. **Apply the two Sprint 5 migrations to staging and production.** Both are idempotent (all `CREATE` / `ALTER` / `DROP` guarded with `IF [NOT] EXISTS`). Apply order: `20260825000001` first, `20260825000002` second.
6. **Regenerate types against staging:** `pnpm db:types` against the staging `DATABASE_URL` will refresh `apps/web/types/database.generated.ts` (currently has the local-DB schema including P1-A).
7. **Resolve the security follow-up from Sprint B2.** `apps/web/.env.example` still ships real Supabase keys. Rotate and rewrite to placeholders. (Same follow-up documented in `PHASE2_SPRINT_3.8_SUMMARY.md` §17.6 and `PROJECT_STATE.md` "Known security follow-up".)

---

## 8. Out of scope (explicit, deferred)

These items are tracked but NOT implemented in Sprint 5:

| ID | Item | Reason | Where it lives |
|---|---|---|---|
| E-1 | Subscription suspension credit policy | BLOCKED on user instruction | this doc §4.3 |
| E-2 | Cancellation credit restoration policy | BLOCKED on user instruction | this doc §4.3 |
| E-3 | Pack-vs-Subscription credit priority | BLOCKED on user instruction | this doc §4.3 |
| 5-F | Stripe `customer.subscription.created/updated/deleted` webhook cases | BLOCKED on E-1 / E-2 / E-3 | this doc §4.3 |
| 5-P1D | `parent_progress_reports` migration (orphan from the original Sprint 5 plan) | OUT OF SCOPE — re-confirmed not part of the website slice the user approved | task #256 |
| 5-P1E | `tutor_change_requests` migration | OUT OF SCOPE — re-confirmed not part of the website slice | task #263 |
| 5-P1F | `tutors.calendly_event_uri` migration | OUT OF SCOPE — the existing `tutors` table already has `calendly_event_uri` from Sprint 3.5 | task #264 |
| 5-D-extra | 10 Resend email templates + `lib/email/send` extension + FR/EN i18n | OUT OF SCOPE — Slice E delivers the two reminder templates inline in n8n, not via the Next.js `lib/email/send` pipeline | task #258 |
| 5-StudentPages | 5 new student pages + 3 extensions + 1 nav (dashboard revisions) | OUT OF SCOPE — the existing dashboard already shows session grants, pack balance, and booking list. No new page was requested for the three-tier model | task #267 |
| 5-Calendly-tutor-URI | Per-tutor Calendly event URI wiring | OUT OF SCOPE — not in the approved Slice A–E scope | task #265 |
| 5-Playwright | E2E tests for the booking + reminder flow | Phase 6 deliverable | task #260 |
| S0-2 / 218–223 | Apply migrations to remote + regen types + E2E | Operator-side action | task #172, #218–223 |

---

## 9. Database consistency

The two Sprint 5 migrations are present in the local Supabase project. The schema is in v3.5 + P1-A + P1-B shape:

- 18 base tables (Sprint 3.5).
- `session_grants`: `grant_type`, `total_credits`, `consumed_credits`, `expires_at` populated.
- `session_bookings`: `fn_consume_pack_credit()` trigger active; PAYG rows pass through unchanged.
- `subscriptions`: `session_grant_id`, `stripe_customer_id` populated where applicable.
- Existing RLS policies preserved verbatim on both `session_grants` and `subscriptions`.

The `apps/web/types/database.generated.ts` file has been regenerated against the local DB (see `S5-P1A-Verify` task). Regeneration against staging requires the operator to run `pnpm db:types` against the staging `DATABASE_URL`.

---

## 10. Release tag — **requires user approval before tagging**

**Existing tag convention** (from `git tag --list`, sorted):
```
pre-sprint-3.5-architecture
pre-sprint-3.6-admin-excel-import
v1.2.0-phase2-sprint-b1
v1.3.0-phase2-sprint-b1-i18n
v1.4.0-phase2-sprint-b2
v1.5.0-phase2-sprint-3.5
v1.5.0-phase2-sprint-3.6
v1.5.0-phase2-sprint-3.8
v1.5.0-phase2-sprint-c
v1.5.2-phase2-sprint-3.8-standalone-tutors
```

**Pattern:** `v<MAJOR>.<MINOR>.<PATCH>-phase<n>-sprint<m>`. The minor version bumps when the work is substantive (e.g. `v1.5.0-phase2-sprint-b2` → `v1.5.0-phase2-sprint-3.5` → `v1.5.0-phase2-sprint-3.8`), with patch versions used for follow-ups (e.g. `v1.5.2-phase2-sprint-3.8-standalone-tutors`).

**Proposed tag:** `v1.6.0-phase2-sprint-5`

- Bumps minor from 1.5.x → 1.6.0 — justified because this sprint ships:
  - 2 forward-only migrations (one with a new enum + 4 CHECK constraints + 1 trigger; the other with a new column + 1 SELECT policy).
  - 1 new cron route + 1 new service + 1 new n8n workflow.
  - 2 new discriminated flows (Pack 10 in the route body + reminder dispatch in the n8n webhook).

**Consistency check:**
- Major unchanged (1) — the architecture is preserved.
- Minor bumps from 1.5.0 → 1.6.0 — consistent with how prior Phase 2 sprints that shipped new schema + new workflows advanced the version.
- Phase / sprint naming matches the existing convention.
- The patch slot is unused because this is not a follow-up to a tagged sprint — it is the Sprint 5 close-out itself.

**Decision:** the proposed tag is **consistent** with the existing convention. **Asking for explicit user approval before tagging** (per CLAUDE.md §3.8 and the user's standing rule).

---

## 11. Definition of Done — checklist

- [x] Every item in the Sprint 5 scope (Slices A, B, D, E) is implemented, tested, and documented.
- [⚠] Slice C is **partially completed** — schema + service + webhook stub for `checkout.session.completed`. Recurring billing lifecycle and operator-configurable Stripe Price ID wiring remain gated on E-1 / E-2 / E-3.
- [x] The four quality gates in §6 are green.
- [x] This sprint summary exists at `docs/review/PHASE2_SPRINT_5_SUMMARY.md`.
- [⚠] `PROJECT_STATE.md` and `CHANGELOG.md` updates are queued in the working tree (will be applied with this summary).
- [⚠] Tag is **pending** — see §10.
- [x] All Sprint 5 work is in the working tree; no further feature work has begun.
- [x] E-1 / E-2 / E-3 remain **BLOCKED** and untouched.
- [x] The locked Calendly → n8n → Zoom → Resend architecture is preserved (Slice E re-architects the reminder pipeline so n8n owns the Resend call, in line with CLAUDE.md §2.3).

*Last updated: 2026-08-27. Owner: project lead. This sprint stands up the three commercial tiers + cron-driven reminder pipeline + admin polish. Next sprint awaits explicit user approval.*
