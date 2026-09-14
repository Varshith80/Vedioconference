# TASK 3 / Feature C — Monthly Support — Sprint Summary

> **Phase 2 — Sprint TASK 3 / Feature C**. Recurring-billing
> support for the Monthly Support product (€109 TTC / month, 4
> × 60-min sessions per period, no rollover, end-of-period
> cancellation).
>
> **Scope locked**. Local Supabase only. No SaaS production config.
> No git commit / push / tag. No remote Supabase.
>
> **Source plan**: `docs/plans/TASK3_FEATURE_C_MONTHLY_SUPPORT.md`
> (9 sections, 27 files planned).

---

## 1. Locked decisions (user-approved)

| ID | Decision |
|---|---|
| D-1 | `past_due` or `suspended` subscriptions keep their current-period `session_grants` pool consumable until `current_period_end`. No rollover. No restoration. |
| D-2 | Cancellation is end-of-period. Student sets `cancel_at_period_end=true`. At `current_period_end`, the period-refresh path flips `status='cancelled'` and stamps `cancelled_at`. No refund. No next-period grant. |
| D-3 | When both Monthly and Pack pools exist, the Monthly pool is consumed FIRST. PAYG + Pack behaviour unchanged. |
| D-4 | Reuse `n8n_executions` UNIQUE `run_id` as the outbox idempotency primitive. NO second incompatible idempotency mechanism. |
| D-5 | Next.js → Resend transactional email via the existing `lib/email/send.ts` (mock-gated on `RESEND_API_KEY`). No production Resend config change. |
| D-6 | Stripe's `current_period_start` / `current_period_end` (stored on the `subscriptions` row at webhook arrival) are the AUTHORITATIVE billing period. `MONTHLY_PERIOD_DAYS` is intentionally NOT exported. |

---

## 2. Files added or modified

### 2.1 NEW — migration

- `supabase/migrations/20260914000002_monthly_subscription_period_support.sql` —
  forward-only, local-only. Adds 4 nullable columns on
  `subscriptions`. Creates `subscription_period_grants` with
  PRIMARY KEY `(subscription_id, period_start)`, 2 secondary
  indexes, RLS enabled, 1 SELECT policy
  `sub_period_grants_select_own_or_admin`. Schema-level
  comments enforce D-1 / D-2 / D-6 invariants.

### 2.2 NEW — service

- `apps/web/services/curriculum/monthly-subscriptions.ts` —
  public surface:
  - `MONTHLY_TOTAL_CREDITS`, `MONTHLY_PRICE_CENTS`, `MONTHLY_CURRENCY`
  - `resolveCurrentPeriod` (pure helper, dashboard display only)
  - `buildOutboxRunId` (pure helper, canonical
    `monthly_<kind>:<sub>:<evt>:<iso>` shape)
  - `provisionMonthlySubscription`
  - `refreshSubscriptionPeriod`
  - `markSubscriptionPastDue`
  - `markSubscriptionPaymentRecovered`
  - `markSubscriptionSuspended`
  - `requestCancelAtPeriodEnd`
  - `getStudentSubscription`
  - `getSubscriptionPeriodHistory`

### 2.3 NEW — webhook handlers

- `apps/web/lib/stripe/subscription-event-handlers.ts` —
  `handleCustomerSubscriptionEvent`,
  `handleCustomerSubscriptionDeleted`,
  `handleInvoicePaymentFailed`.

### 2.4 MODIFIED — Stripe webhook route

- `apps/web/app/api/webhooks/stripe/route.ts` — added 4 new
  switch cases (`customer.subscription.created` /
  `.updated`, `.deleted`, `invoice.payment_failed`).

### 2.5 MODIFIED — pool-priority

- `apps/web/services/curriculum/session-bookings.ts` —
  Patched `createSessionBooking` (PAYG grants require
  `session_id === args.sessionId`; pool grants skip the check
  since `session_id IS NULL` by design). Added
  `pickSubscriptionPoolFirst` (D-3 — subscription pool FIRST,
  pack pool SECOND, null otherwise).

### 2.6 NEW — student-initiated routes

- `apps/web/app/api/subscriptions/route.ts` — POST `{ kind: 'monthly' }`.
- `apps/web/app/api/student/subscription/route.ts` — GET +
  DELETE.

### 2.7 NEW — dashboard UI

- `apps/web/app/[locale]/dashboard/subscription/page.tsx` —
  RSC, RLS-respecting.
- `apps/web/components/dashboard/monthly-subscription-card.tsx`
  — client component with four states (active, active_cancelling,
  past_due, cancelled).

### 2.8 NEW — email templates

- `apps/web/lib/email/templates/monthly-payment-failed.tsx`
- `apps/web/lib/email/templates/monthly-payment-recovered.tsx`
- `apps/web/lib/email/templates/monthly-suspended.tsx`
- `apps/web/lib/email/templates/index.ts` — dispatcher wired up.

### 2.9 MODIFIED — types + i18n + n8n

- `apps/web/types/domain.ts` — added `StudentSubscriptionView`
  and `PeriodGrantView` interfaces.
- `apps/web/messages/en.json` + `apps/web/messages/fr.json` —
  added `Dashboard.home.monthly` and `Dashboard.subscription`
  namespaces.
- `apps/web/lib/constants/pricing.ts` — changed `monthly.cta.href`
  from `/contact` to `/api/subscriptions`.
- `apps/web/lib/email/templates/index.ts` — wired the 3 new
  templates into `EmailTemplateName`, `EmailTemplateProps`, and
  the `renderEmailTemplate` switch.
- `n8n/workflows/enrollment-created.json` — added a Switch
  node (`kind: 'monthly'`) and a separate
  `Create Stripe Subscription Checkout (monthly)` node
  (`mode=subscription`, `line_items[0][price] =
  $env.STRIPE_PRICE_SUBSCRIPTION`). PAYG `mode=payment` branch
  preserved unchanged.

### 2.10 NEW — tests (6 + 1 extension)

- `apps/web/tests/unit/monthly-subscriptions.test.ts`
  (constants + `resolveCurrentPeriod` + `buildOutboxRunId` +
  regression guard for `MONTHLY_PERIOD_DAYS` not being
  exported).
- `apps/web/tests/unit/monthly-subscription-provision.test.ts`
  (`provisionMonthlySubscription` happy path + race-safety).
- `apps/web/tests/unit/monthly-subscription-refresh.test.ts`
  (`refreshSubscriptionPeriod` happy path + D-2
  `period_ended_cancel` + D-1 ineligible states + 23505
  `already_refreshed`).
- `apps/web/tests/unit/webhooks-stripe-subscription.test.ts`
  (route switch: created / updated / deleted / invoice.payment_failed
  / replay dedup / D-1 invariant that the route does NOT mutate
  `session_grants`).
- `apps/web/tests/unit/subscription-route.test.ts`
  (`POST /api/subscriptions` 401 / 400 / 409 / 500 / 503 / 502 /
  201).
- `apps/web/tests/unit/monthly-subscription-priority.test.ts`
  (D-3: subscription FIRST, pack SECOND, null fallback,
  expired-pack null).
- `apps/web/tests/unit/n8n-workflows-shape.test.ts` (extended
  with 3 new cases for the monthly branch).

### 2.11 MODIFIED — docs

- `docs/database/Database.md` — added §12 (new columns +
  `subscription_period_grants` + D-1/D-2/D-6 invariants).
- `docs/api/API.md` — added §2.5.1 (subscriptions routes) and
  §2.5.2 (Stripe subscription-lifecycle webhook handlers).

---

## 3. Migration status (LOCAL ONLY)

Migration `20260914000002_monthly_subscription_period_support.sql`:

- Applied to local Supabase (docker container
  `supabase_db_vedioconference`, port 54322).
- History row in `supabase_migrations.schema_migrations`
  (version `20260914000002`).
- 4 new columns on `subscriptions` (all nullable).
- `subscription_period_grants` table created (5 columns,
  3 indexes incl. PK, RLS enabled).
- 1 SELECT policy on `subscription_period_grants` for
  authenticated.

---

## 4. What is OUT of scope (deliberately deferred)

- **n8n workflow publication**. The workflow JSON is updated
  in-place but `active=false` is preserved (it stays a
  placeholder — Sprint 11 plan §2.3: n8n remains orchestration
  only).
- **Production Stripe / Calendly / Zoom / Resend / Supabase
  remote config**. No `.env*` change. The route is mock-gated.
- **Drain endpoints** for any failed outbox enqueues. The
  outbox row is the audit trail; a future sprint can add a
  drain endpoint that re-POSTs without re-stamping.

---

## 5. Quality gates (pending)

The four quality gates (`pnpm type-check` / `pnpm lint` /
`pnpm test` / `pnpm build`) will be run as part of Step 14
of the implementation plan.

---

## 6. Correction v2 — terminal-state guard + A/B/C classification + invoice.payment_succeeded (2026-09-14)

### 6.1 Problem statement

After the initial sprint close-out, the user identified three
business-state defects that the original implementation did not
handle correctly:

1. `markSubscriptionSuspended()` was writing
   `status='cancelled', cancelled_at=now, suspended_at=now` —
   conflating payment-failure suspension with end-of-period
   cancellation. The user explicitly required NO schema change
   (no new enum value) and demanded a behavioural fix using
   existing columns.

2. `markSubscriptionPaymentRecovered()` had NO terminal-state
   guard. A stale Stripe `active` webhook (or a recovery
   attempt on a long-cancelled row) could silently re-activate
   a genuinely cancelled subscription.

3. There was no `invoice.payment_succeeded` handler. Recovery
   only fired via `customer.subscription.updated` with Stripe
   status `active`. Some Stripe accounts emit
   `invoice.payment_succeeded` WITHOUT a paired subscription
   update that flips status back to `active` — those rows
   would stay stuck in `past_due` even after a successful
   card charge.

A second correction-layer was added when the user reviewed the
first proposed correction: `cancel_at_period_end=true` is NOT
a terminal state. The original proposed correction incorrectly
treated the flag as a recovery blocker. The user explicitly
demanded that a pending cancellation survive payment recovery
and finalise only at `current_period_end` via the existing
D-2 finalisation path.

### 6.2 The approved state-machine rules (verbatim from user)

**Recovery rules (markSubscriptionPaymentRecovered):**

1. `cancelled_at IS NOT NULL` → NO-OP (terminal).
2. `status='cancelled'` → NO-OP (terminal, defence-in-depth).
3. `status='past_due' AND cancelled_at IS NULL` → recovery may
   restore `active`.
4. `cancel_at_period_end=true` during recovery → restore
   `active` AND KEEP `cancel_at_period_end=true` (the
   recovery UPDATE payload MUST NOT touch that column).
5. At `current_period_end` if `cancel_at_period_end=true` →
   finalise `cancelled`, stamp `cancelled_at`, no next-period
   grant.

**A/B/C classification (handleCustomerSubscriptionEvent active/trialing):**

- **A) Genuinely terminal** (`cancelled_at IS NOT NULL OR
  status='cancelled'`) → NO-OP. A stale `active` webhook on a
  dead row must not flip status, send a recovery email, or
  insert a recovery outbox row.
- **B) Cancellation pending** (`cancel_at_period_end=true` but
  `cancelled_at IS NULL`) → NOT terminal. Allow legitimate
  payment recovery to `active` while preserving
  `cancel_at_period_end=true`. At `current_period_end` the
  D-2 finalisation path closes the loop.
- **C) Ordinary active** → normal behaviour.

**Verbatim example that MUST work:**

```
active
  → cancel_at_period_end=true
  → payment failure (Stripe invoice.payment_failed)
  → past_due
  → invoice.payment_succeeded (no paired subscription.updated)
  → active + cancel_at_period_end=true
  → current_period_end
  → cancelled (D-2 finalisation, no next-period grant)
```

### 6.3 The terminal predicate (single source of truth)

```ts
interface SubscriptionState {
  id: string;
  student_id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  past_due_at: string | null;
  suspended_at: string | null;
  current_period_end: string;
}

function isTerminal(state: SubscriptionState): boolean {
  return state.cancelled_at !== null || state.status === 'cancelled';
}
```

`readSubscriptionState(subscriptionId)` reads the canonical
lifecycle fields. The terminal predicate is used as the sole
gate in every recovery write path. One source of truth.

### 6.4 The 11-row state-transition matrix

| Pre-event state | Stripe event | Effect | Returns |
|---|---|---|---|
| `status=active, cancelled_at=null, cancel_at_period_end=false` | `customer.subscription.updated` new period | new period pool row inserted; `current_period_*` updated | `ok` (refresh) |
| `status=active, cancelled_at=null, cancel_at_period_end=true` | `customer.subscription.updated` new period | finalise to `cancelled`, stamp `cancelled_at`, NO new period | `period_ended_cancel` (D-2) |
| `status=past_due, cancelled_at=null, cancel_at_period_end=false` | `customer.subscription.updated` same period | clear `past_due_at` + `grace_period_ends_at`, set `status='active'`; `cancel_at_period_end` NOT touched (false→false) | `ok` (recovery, Class C) |
| `status=past_due, cancelled_at=null, cancel_at_period_end=true` | `customer.subscription.updated` same period | clear `past_due_at` + `grace_period_ends_at`, set `status='active'`; `cancel_at_period_end` PRESERVED (true→true) | `ok` (recovery, Class B) |
| `status=cancelled, cancelled_at=<ts>` | `customer.subscription.updated` status=active | NO-OP | `no_op_terminal` (Class A) |
| `status=active, cancelled_at=null` | `invoice.payment_succeeded` (no paired subscription.updated) | `markSubscriptionPaymentRecovered` → same terminal guard → recovery fires (Class B preserves flag) | `ok` or `no_op_terminal` |
| `status=cancelled, cancelled_at=<ts>` | `invoice.payment_succeeded` | NO-OP (terminal guard) | `no_op_terminal` |
| `status=incomplete_expired` (any) | `customer.subscription.updated` new period | ineligible; no new period | `ineligible_state` (D-1) |
| row missing | any | not found; no writes | `ineligible_state currentStatus='not_found'` |
| `status=past_due, cancelled_at=null` | `invoice.payment_failed` | stamp `past_due_at` + `grace_period_ends_at`; send payment-failed email; current pool UNCHANGED | `ok` (mark past_due) |
| `status=active, cancel_at_period_end=false` | `customer.subscription.updated` status=incomplete_expired | terminal via D-1; eligible for refresh after Stripe flips to active again | (separate Stripe handler) |

### 6.5 Files changed in correction v2

| Path | Change |
|---|---|
| `apps/web/services/curriculum/monthly-subscriptions.ts` | Added `SubscriptionState`, `readSubscriptionState`, `isTerminal`; added `no_op_terminal` to `RefreshMonthlyResult`; refactored `refreshSubscriptionPeriod` to use helpers (D-2 branch runs first, terminal guard second, D-1 incomplete_expired third); added terminal-state guard to `markSubscriptionPaymentRecovered` (read state FIRST, skip outbox/email/UPDATE if terminal); updated JSDoc on both functions |
| `apps/web/lib/stripe/subscription-event-handlers.ts` | Applied A/B/C classification to `handleCustomerSubscriptionEvent` active/trialing branch (Class A → NO-OP, Class B → recovery preserves flag, Class C → normal); added new exported `handleInvoicePaymentSucceeded(inv)` function |
| `apps/web/app/api/webhooks/stripe/route.ts` | Imported `handleInvoicePaymentSucceeded`; added `case 'invoice.payment_succeeded'` and forward-compat `case 'invoice.paid'` to the switch |
| `apps/web/tests/unit/monthly-subscription-refresh.test.ts` | Updated D-1 cancelled test (now returns `no_op_terminal` per correction v2); added 3 new terminal-guard cases |
| `apps/web/tests/unit/monthly-subscription-recovered.test.ts` | NEW: 5 cases for `markSubscriptionPaymentRecovered` (terminal on cancelled_at, terminal on status=cancelled, no_subscription, Class B preserves cancel_at_period_end, Class C clears past_due_at) |
| `apps/web/tests/unit/webhooks-stripe-subscription.test.ts` | Updated mocks to include `handleInvoicePaymentSucceeded`; added 3 cases for `invoice.payment_succeeded` + `invoice.paid` + PAYG skip |
| `docs/review/PHASE2_SPRINT_FEATURE_C_MONTHLY_SUPPORT.md` | This §6 |

### 6.6 Why this is safe

- **No schema change.** No new columns, indexes, triggers,
  enums, or GRANTs. The existing `cancelled_at` column is
  the canonical terminal signal (it was added in
  migration `20260914000002`).
- **No SaaS change.** Stripe / Resend / n8n / Calendly / Zoom
  / Vercel / remote Supabase untouched. The new
  `invoice.payment_succeeded` route uses the same webhook
  infrastructure as the existing `invoice.payment_failed`.
- **No new idempotency primitive.** The terminal guard is a
  pure predicate (no DB write). The existing
  `n8n_executions.run_id UNIQUE` primitive continues to be
  the at-most-once-on-enqueue boundary.
- **One source of truth.** `isTerminal(state)` is the sole
  terminal predicate; the customer.subscription.updated path
  and the invoice.payment_succeeded path both route through
  `markSubscriptionPaymentRecovered`'s guard. There is no
  drift between the two paths.
- **Class B invariant preserved by construction.** The
  recovery UPDATE payload intentionally omits
  `cancel_at_period_end`, so a `true` value survives the
  transition to `active`. Verified by the new
  `restores status=active and PRESERVES cancel_at_period_end=true`
  unit test.
- **Class A invariant verified.** Stale `active` webhooks on
  cancelled rows are short-circuited at the top of
  `handleCustomerSubscriptionEvent` BEFORE any write happens
  — verified by the new `returns no_op_terminal when cancelled_at IS NOT NULL`
  unit test.

### 6.7 Out of scope (deferred)

- Drain endpoint for refund-enqueue retries (out of scope per
  the user's previous TASK 2.1 instruction).
- n8n workflow JSON for `invoice.payment_succeeded` (out of
  scope; the existing `monthly-lifecycle` workflow covers the
  recovery path through the existing `markSubscriptionPaymentRecovered`
  outbox INSERT).
- Migration changes (none required).
- Feature A/B/D (untouched).

---

*Last updated: 2026-09-14. Owner: TASK 3 lead. Awaiting user
approval before Sprint close.*
