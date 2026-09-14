-- =====================================================================
-- Migration: 20260914000002_monthly_subscription_period_support.sql
-- Sprint:     Phase 2 — Feature C Monthly Support
--
-- Description
-- -----------
-- Adds the schema support for the recurring-billing lifecycle
-- of the Monthly Support product (€109 TTC / month, 4×60-min
-- sessions / period, no rollover, end-of-period cancellation).
--
-- The existing `public.subscriptions` table (created in
-- 20260707000008) already carries `current_period_start` /
-- `current_period_end` — these are the AUTHORITATIVE billing
-- period; this migration does NOT add any 30-day computation.
-- The migration does NOT add CHECK constraints enforcing the
-- state machine (`active` → `past_due` → `cancelled`); the
-- transitions are service-layer responsibilities, per the
-- explicit reservation in `20260825000002` §3 L127-134.
--
-- Background
-- ----------
-- Sprint 5 marked Slice C as PARTIALLY COMPLETE. The schema
-- and first-month webhook (`checkout.session.completed` →
-- `markSessionGrantPaid`) were wired, but the recurring-
-- billing lifecycle (period rollover, suspension, cancellation)
-- was BLOCKED on E-1 / E-2 / E-3. The user has now resolved
-- all three decisions (D-1, D-2, D-3) plus architecture
-- decisions (D-4 reuse `n8n_executions` outbox, D-5 reuse
-- Next.js → Resend email) plus D-6 (Stripe authoritative).
--
-- Invariants preserved
-- --------------------
-- 1. Stripe's `current_period_start` / `current_period_end` on
--    `public.subscriptions` remain the authoritative billing
--    period. No application code or this migration computes a
--    30-day period.
-- 2. Subscription `session_grants` pool rows continue to use
--    the existing `grant_type='subscription'` shape and the
--    `fn_consume_pack_credit` trigger (20260825000001).
-- 3. Existing RLS policies on `public.subscriptions` are
--    preserved verbatim. No new INSERT/UPDATE/DELETE policy
--    is added on `public.subscriptions`.
-- 4. D-1: current-period credits remain consumable until
--    `current_period_end`. The schema does NOT add a trigger
--    that invalidates pool rows on suspension.
-- 5. D-2: cancellation is end-of-period. The schema does NOT
--    add a trigger that flips `status='cancelled'` immediately.
-- 6. D-4: idempotency uses the existing `n8n_executions`
--    UNIQUE `run_id` primitive (20260707000008:111) plus the
--    new PRIMARY KEY on `subscription_period_grants`.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP is guarded with `if [not]
-- exists`. The migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New columns on `public.subscriptions` — observation state
-- ---------------------------------------------------------------------
-- These four nullable columns are stamped by the Stripe webhook
-- (service role) and by the service layer. No default values.
--
--   - stripe_latest_invoice_id : the most recent Stripe invoice
--     that funds this subscription period. Populated from
--     `invoice.created` / `invoice.payment_succeeded` events.
--     Not authoritative; observation only.
--   - past_due_at : the first time Stripe reported a failed
--     payment on this subscription. NULL when status is
--     `active`. Set by `markSubscriptionPastDue`.
--   - grace_period_ends_at : `past_due_at + 5 days` (the
--     business rule "2 retries over 5 days"). At this point,
--     the application flips the subscription to `cancelled`
--     and stamps `suspended_at`. NULL when not in past_due.
--   - suspended_at : the time the subscription was finalised
--     as suspended. NULL when active. Once stamped, the
--     subscription never returns to `active` (the user's
--     standing instruction: "suspended/cancelled never get
--     new grants"). Recovery from past_due clears this and
--     past_due_at / grace_period_ends_at but never flips a
--     `cancelled` row back to `active`.
alter table public.subscriptions
    add column if not exists stripe_latest_invoice_id text;

alter table public.subscriptions
    add column if not exists past_due_at              timestamptz;

alter table public.subscriptions
    add column if not exists grace_period_ends_at    timestamptz;

alter table public.subscriptions
    add column if not exists suspended_at            timestamptz;

-- ---------------------------------------------------------------------
-- 2. Self-describe comments — D-1 / D-2 / D-6 invariant enforcement
-- ---------------------------------------------------------------------
comment on column public.subscriptions.current_period_start is
    'Authoritative billing period start (Stripe-sourced). NEVER override; NEVER compute from a 30-day constant.';

comment on column public.subscriptions.current_period_end is
    'Authoritative billing period end (Stripe-sourced). NEVER override; NEVER compute from a 30-day constant. Pool grants created by refreshSubscriptionPeriod have expires_at = this value (D-1: unused credits expire here, no rollover).';

comment on column public.subscriptions.cancel_at_period_end is
    'Student-initiated cancel flag (D-2). When true at current_period_end, the period-refresh path returns period_ended_cancel and finalises the subscription as cancelled. NO refund is issued and NO next-period grant is created.';

comment on column public.subscriptions.past_due_at is
    'When Stripe first reported a failed payment. Stamped by markSubscriptionPastDue. Cleared on recovery. D-1: this column does NOT trigger automatic invalidation of the current-period pool row.';

comment on column public.subscriptions.grace_period_ends_at is
    'past_due_at + 5 days (business rule: 2 retries over 5 days). At this point the application flips status to cancelled and stamps suspended_at.';

comment on column public.subscriptions.suspended_at is
    'Final suspension time. Once stamped, the subscription never returns to active (D-1). D-1: existing pool rows remain consumable until current_period_end even after this stamp.';

-- ---------------------------------------------------------------------
-- 3. New table `public.subscription_period_grants` — period index
-- ---------------------------------------------------------------------
-- One row per (subscription, billing period). The PRIMARY KEY
-- is the at-most-once-on-period-refresh primitive: two webhook
-- events trying to refresh the same period hit PK violation
-- (23505) and the second is treated as a duplicate (no double
-- grant). This is the period-level analogue of the
-- `n8n_executions.run_id UNIQUE` outbox primitive (D-4).
--
-- The `session_grant_id` FK links the audit row to the actual
-- pool row on `session_grants`. ON DELETE RESTRICT because the
-- pool row is the financial artefact — we never want a cascade
-- delete to erase a billing record.
create table if not exists public.subscription_period_grants (
    subscription_id     uuid        not null references public.subscriptions(id) on delete cascade,
    period_start        timestamptz not null,
    period_end          timestamptz not null,
    session_grant_id    uuid        not null references public.session_grants(id) on delete restrict,
    created_at          timestamptz not null default now(),
    primary key (subscription_id, period_start)
);

-- Lookup by pool grant (used by the dashboard "current period" view).
create index if not exists idx_subscription_period_grants_grant_id
    on public.subscription_period_grants(session_grant_id);

-- Period-end index (used by future admin / drain queries; not
-- read by hot paths in this sprint).
create index if not exists idx_subscription_period_grants_period_end
    on public.subscription_period_grants(period_end desc);

comment on table public.subscription_period_grants is
    'One row per (subscription, billing period). PRIMARY KEY (subscription_id, period_start) is the at-most-once-on-period-refresh race-safety primitive (D-4). session_grant_id links the audit row to the pool row on session_grants.';

comment on column public.subscription_period_grants.period_start is
    'Authoritative period start (from Stripe via subscriptions.current_period_start at the moment of refresh).';

comment on column public.subscription_period_grants.period_end is
    'Authoritative period end (from Stripe via subscriptions.current_period_end at the moment of refresh). Used by the dashboard to display "current period".';

-- ---------------------------------------------------------------------
-- 4. RLS — read access to subscription_period_grants
-- ---------------------------------------------------------------------
-- The table is append-only from the application's perspective:
--   - INSERT  : service role only (Stripe webhook + refresh path).
--   - UPDATE  : not permitted (audit trail is immutable).
--   - DELETE  : not permitted (audit trail is immutable).
--
-- SELECT is granted to:
--   - the student who owns the parent subscription, OR
--   - any admin.
--
-- This mirrors the existing `subscriptions_select_via_session_grant`
-- pattern from `20260825000002` §4.
alter table public.subscription_period_grants enable row level security;

drop policy if exists sub_period_grants_select_own_or_admin on public.subscription_period_grants;

create policy sub_period_grants_select_own_or_admin
    on public.subscription_period_grants
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.subscriptions s
            where s.id = subscription_period_grants.subscription_id
              and s.student_id = (select auth.uid())
        )
        or public.is_admin()
    );

comment on policy sub_period_grants_select_own_or_admin on public.subscription_period_grants is
    'Student reads their own subscription''s period grants (via subscription ownership); admin reads all. INSERT/UPDATE/DELETE not granted to authenticated — service role only.';

-- ---------------------------------------------------------------------
-- 5. No new policies on `public.subscriptions`
-- ---------------------------------------------------------------------
-- The existing policies are sufficient and preserved verbatim:
--   - subscriptions_select_own_or_admin
--   - subscriptions_select_via_session_grant
--   - subscriptions_write_admin_only
--
-- The Stripe webhook (service role) and the service layer
-- (service role for the new period-refresh path) handle writes.
-- No authenticated INSERT/UPDATE/DELETE on subscriptions.

-- =====================================================================
-- 6. Done
-- =====================================================================
-- This migration is idempotent. It can be re-applied safely.
