-- =====================================================================
-- Migration: 20260825000002_subscriptions_pack_monthly_support.sql
-- Sprint:     Phase 1 — Sprint 5 (commercial flows)
--
-- Description
-- -----------
-- Extends `public.subscriptions` to carry the Monthly Support
-- (€109 / month, 4 credits / month) product on top of the existing
-- per-course subscription row. Monthly Support is a recurring
-- billing artefact at the `subscriptions` layer and a credit-pool
-- artefact at the `session_grants` layer; this migration makes
-- the link explicit by adding a nullable `session_grant_id` FK on
-- `subscriptions` pointing at the credit-pool row provisioned by
-- the Pack / Subscription purchase webhook.
--
-- Background
-- ----------
-- Before this migration, `public.subscriptions` represented a
-- per-student × per-course recurring billing row
-- (`student_id`, `course_id`, `stripe_subscription_id`,
-- `current_period_start` / `current_period_end`). It already has:
--
--   - `course_id` NULLABLE  (no schema change required)
--   - `stripe_subscription_id` UNIQUE  (preserved verbatim)
--   - `stripe_price_id` text  (preserved verbatim)
--   - RLS: `subscriptions_select_own_or_admin`,
--          `subscriptions_write_admin_only`  (preserved verbatim)
--
-- Monthly Support does NOT bind to a single `courses.id`: the
-- student may use the 4 monthly credits against any session of
-- any course. The Monthly Support credit pool therefore lives on
-- `session_grants` (as a row of `grant_type = 'subscription'`,
-- created by the Pack / Subscription webhook in P1-A's world).
-- The `subscriptions` row remains the Stripe recurring-billing
-- artefact.
--
-- Invariants preserved
-- --------------------
-- 1. The atomic unit of teaching, booking, Zoom meeting, and
--    refund settlement remains the Session. Subscription rows are
--    PRE-PAID RECURRING BILLING ARTEFACTS that fund a credit pool
--    on `session_grants` (row with `grant_type = 'subscription'`).
-- 2. `session_grants.session_id` remains NULL for pool rows.
--    The link from a pool row to a specific session lives on the
--    `session_bookings` row (debited by `fn_consume_pack_credit`),
--    NOT on the `session_grants` row.
-- 3. Every existing `subscriptions` row is preserved. Existing
--    RLS policies are preserved verbatim.
-- 4. No business rule is silently implemented: the partial unique
--    index below only enforces the model invariant that one
--    credit-pool row links to at most one `subscriptions` row,
--    not the policy decision of which grants must exist or how
--    credits behave on suspension, cancellation, or priority.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP is guarded with `if exists` so the
-- migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New columns on `public.subscriptions`
-- ---------------------------------------------------------------------

-- 1.1  `session_grant_id` — nullable FK to the credit-pool row
--      (`session_grants.id`) that this subscription period funds.
--      A subscription row may exist before the credit pool is
--      provisioned (the Stripe webhook creates the `subscriptions`
--      row first, then the credit pool is created in the same
--      workflow). ON DELETE SET NULL so that removing a
--      `session_grants` row never cascades into removing billing
--      history.
alter table public.subscriptions
    add column if not exists session_grant_id
        uuid references public.session_grants(id) on delete set null;

-- 1.2  `stripe_customer_id` — the Stripe Customer object that
--      owns this recurring subscription. The v1 schema only had
--      `stripe_subscription_id`; recurring billing requires a
--      Customer. UNIQUE because one Stripe Customer per row (one
--      Customer can own many `subscriptions` over time, but only
--      one row references a given Customer at a time).
alter table public.subscriptions
    add column if not exists stripe_customer_id text;

do $$
begin
    if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename  = 'subscriptions'
          and indexname  = 'subscriptions_stripe_customer_id_key'
    ) then
        alter table public.subscriptions
            add constraint subscriptions_stripe_customer_id_key
            unique (stripe_customer_id);
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------

-- 2.1  Lookup by credit pool (admin dashboards, refund flows,
--      reconciliation).
create index if not exists idx_subscriptions_session_grant_id
    on public.subscriptions (session_grant_id);

-- 2.2  Partial unique index on session_grant_id — model
--      invariant: at most one `subscriptions` row per credit-pool
--      row. NULLs are excluded so multiple legacy rows
--      (subscription without a linked pool) can coexist.
create unique index if not exists uq_subscriptions_session_grant_id
    on public.subscriptions (session_grant_id)
    where session_grant_id is not null;

-- ---------------------------------------------------------------------
-- 3. CHECK constraint — model invariant
-- ---------------------------------------------------------------------
-- `stripe_customer_id` is required iff a `stripe_subscription_id`
-- is set. A subscription without either is a manual / non-Stripe
-- artefact (kept for backwards compatibility on legacy rows). The
-- new columns are independent: a subscription may carry a
-- `session_grant_id` without a Stripe ID (admin-seeded) and vice
-- versa (legacy).
--
-- NOTE: this migration deliberately does NOT add a CHECK like
--       "session_grant_id IS NOT NULL" or "exactly one of
--       course_id / session_grant_id is set". Those would silently
--       implement the business decision of "every subscription
--       must fund a credit pool" / "Monthly Support never binds
--       to a single course", which remain EXPLICITLY PENDING
--       per the user's standing instruction.

alter table public.subscriptions
    drop constraint if exists subscriptions_stripe_customer_id_shape;

alter table public.subscriptions
    add constraint subscriptions_stripe_customer_id_shape
    check (
        stripe_customer_id is null
        or stripe_subscription_id is not null
    );

-- ---------------------------------------------------------------------
-- 4. RLS — read policy via the new `session_grant_id` link
-- ---------------------------------------------------------------------
-- The existing policies are:
--   - `subscriptions_select_own_or_admin` (SELECT: owner or admin)
--   - `subscriptions_write_admin_only`    (writes: admin only)
-- Both are preserved verbatim. The new policy below adds a
-- second SELECT path: a student can read a `subscriptions` row
-- whose linked `session_grants` row they own. This mirrors the
-- Sprint 3.5 pattern in `20260714000003_session_bookings_*` for
-- `payments_select_via_session_grant`.
--
-- Drop the new policy first to keep the migration idempotent.
drop policy if exists subscriptions_select_via_session_grant on public.subscriptions;

create policy subscriptions_select_via_session_grant
    on public.subscriptions for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.session_grants sg
            where sg.id = subscriptions.session_grant_id
              and sg.student_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------
comment on column public.subscriptions.session_grant_id is
    'FK to the credit-pool row (`session_grants.id`) that this subscription period funds. NULL for legacy per-course subscriptions and for Stripe-only artefacts that have not yet been paired with a credit pool.';

comment on column public.subscriptions.stripe_customer_id is
    'The Stripe Customer object that owns this recurring subscription. Required for any Stripe subscription. UNIQUE because one Stripe Customer per row.';

comment on constraint subscriptions_stripe_customer_id_shape on public.subscriptions is
    'If a Stripe Customer ID is set, a Stripe Subscription ID must also be set (recurring billing requires both). NULL Stripe Customer is allowed for non-Stripe artefacts.';

-- ---------------------------------------------------------------------
-- 6. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.