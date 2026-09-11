-- =====================================================================
-- Migration: 20260825000001_session_grants_pack_subscription.sql
-- Sprint:     Phase 2 — Sprint 5 (commercial flows)
--
-- Description
-- -----------
-- Extends `public.session_grants` to support the Pack 10 and
-- €109/month Monthly Support offers, on top of the existing
-- per-session PAYG flow.
--
-- Background
-- ----------
-- Before this migration, `session_grants` enforced a 1:1 invariant
-- between a paid grant and a specific `sessions.id`:
--
--   session_id uuid NOT NULL references public.sessions(id)
--   unique (student_id, session_id) where status in
--       ('pending_payment', 'active')
--
-- Pack 10 (€299, 10 credits) and Monthly Support (€109/mo,
-- 4 credits/month) are pre-paid pools the student will later
-- allocate to specific `sessions`. At purchase time, no
-- `sessions.id` exists yet. The pool row must therefore be
-- storable without a `session_id`.
--
-- Invariants preserved
-- --------------------
-- 1. The atomic unit of teaching, booking, Zoom meeting, and
--    refund settlement remains the Session. Pack/Subscription
--    rows are PRE-PAID CREDIT POOLS that get debited one credit
--    per `session_bookings` insert via `fn_consume_pack_credit`.
-- 2. Normal individual PAYG purchases continue to REQUIRE a
--    valid `sessions.id` (CHECK constraint below).
-- 3. `session_bookings.session_id` remains NOT NULL. The link
--    from a pool row to a specific session lives on the
--    `session_bookings` row, NOT on the `session_grants` row.
-- 4. Existing RLS policies are preserved verbatim.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP is guarded with `if exists` so
-- the migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. New enum: `grant_type` classifies every session_grants row
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'grant_type') then
        create type public.grant_type as enum ('individual', 'pack', 'subscription');
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Extend `session_grants` schema
-- ---------------------------------------------------------------------

-- 2.1  Drop the v1 partial unique index. It cannot represent
--      pack/subscription rows (their `session_id` is NULL). It
--      is replaced by three narrower indexes in §2.2.
drop index if exists public.uq_session_grants_active_student_session;

-- 2.2  Make `session_id` nullable and add the four new columns.
alter table public.session_grants
    alter column session_id drop not null;

alter table public.session_grants
    add column if not exists grant_type       public.grant_type not null default 'individual';

alter table public.session_grants
    add column if not exists total_credits    integer;

alter table public.session_grants
    add column if not exists consumed_credits integer not null default 0;

alter table public.session_grants
    add column if not exists expires_at       timestamptz;

-- 2.3  CHECK: individual rows REQUIRE session_id; pack/subscription
--      rows MUST have session_id NULL. This is the load-bearing
--      constraint that classifies rows and prevents both legacy
--      and new code from inserting malformed data.
alter table public.session_grants
    drop constraint if exists session_grants_session_id_required_for_individual;

alter table public.session_grants
    add constraint session_grants_session_id_required_for_individual
    check (
        (grant_type = 'individual' and session_id is not null)
     or (grant_type in ('pack', 'subscription') and session_id is null)
    );

-- 2.4  CHECK: credit-pool rows MUST declare total_credits > 0;
--      individual rows MUST have total_credits NULL and
--      consumed_credits 0 (no consumption tracking on PAYG).
alter table public.session_grants
    drop constraint if exists session_grants_credit_pool_shape;

alter table public.session_grants
    add constraint session_grants_credit_pool_shape
    check (
        (grant_type = 'individual'
            and total_credits is null
            and consumed_credits = 0)
     or (grant_type in ('pack', 'subscription')
            and total_credits is not null
            and total_credits > 0)
    );

-- 2.5  CHECK: consumed_credits is bounded by [0, total_credits].
alter table public.session_grants
    drop constraint if exists session_grants_credits_bounded;

alter table public.session_grants
    add constraint session_grants_credits_bounded
    check (
        consumed_credits >= 0
        and (total_credits is null or consumed_credits <= total_credits)
    );

-- 2.6  CHECK: pack rows have a finite expiry (6 months from
--      creation); subscription rows may have a finite or NULL
--      expiry (NULL means "no hard cap, the period end is the
--      source of truth").
alter table public.session_grants
    drop constraint if exists session_grants_pack_has_expires_at;

alter table public.session_grants
    add constraint session_grants_pack_has_expires_at
    check (
        (grant_type in ('individual', 'subscription'))
     or (grant_type = 'pack' and expires_at is not null and expires_at > created_at)
    );

-- 2.7  Three narrower partial unique indexes — one per grant type.
--      PAYG: at most one active/pending grant per (student, session).
--      Pack / Subscription: at most one active pool per student.
create unique index if not exists uq_session_grants_individual_active
    on public.session_grants (student_id, session_id)
    where grant_type = 'individual'
      and status in ('pending_payment', 'active');

create unique index if not exists uq_session_grants_pack_active
    on public.session_grants (student_id)
    where grant_type = 'pack'
      and status = 'active';

create unique index if not exists uq_session_grants_subscription_active
    on public.session_grants (student_id)
    where grant_type = 'subscription'
      and status = 'active';

-- 2.8  Lookup index for the credit-pool scan that runs at every
--      `session_bookings` insert (find an active pool with
--      remaining credits and a future expires_at).
create index if not exists idx_session_grants_credit_pool_lookup
    on public.session_grants (student_id, grant_type, expires_at)
    where grant_type in ('pack', 'subscription')
      and status = 'active';

-- ---------------------------------------------------------------------
-- 3. Trigger: consume one credit per session_bookings insert
-- ---------------------------------------------------------------------

-- 3.1  `fn_consume_pack_credit` runs BEFORE INSERT on
--      `session_bookings`. It validates the referenced grant
--      and atomically increments `consumed_credits` (and flips
--      `status` to 'completed' when the pool is drained).
create or replace function public.fn_consume_pack_credit()
returns trigger
language plpgsql
as $$
declare
    g public.session_grants;
begin
    select * into g
        from public.session_grants
        where id = new.session_grant_id
        for update;

    if not found then
        raise exception 'session_grants row % not found', new.session_grant_id
            using errcode = '23503';
    end if;

    -- PAYG rows do not participate in credit-pool accounting.
    if g.grant_type = 'individual' then
        return new;
    end if;

    -- The grant must be active.
    if g.status <> 'active' then
        raise exception 'cannot consume credit: grant status=% (must be active)', g.status
            using errcode = '42501';
    end if;

    -- The grant must not have expired.
    if g.expires_at is not null and g.expires_at <= now() then
        raise exception 'cannot consume credit: grant expired at %', g.expires_at
            using errcode = '42501';
    end if;

    -- The pool must have a remaining credit.
    if g.consumed_credits >= g.total_credits then
        raise exception 'cannot consume credit: pool exhausted (%/% used)',
            g.consumed_credits, g.total_credits
            using errcode = '23514';
    end if;

    -- Debit one credit atomically. Flip status to 'completed'
    -- when the pool is drained.
    update public.session_grants
        set consumed_credits = consumed_credits + 1,
            updated_at = now(),
            completed_at = case
                when consumed_credits + 1 >= total_credits
                    and completed_at is null
                then now()
                else completed_at
            end,
            status = case
                when consumed_credits + 1 >= total_credits
                then 'completed'
                else status
            end
        where id = g.id;

    return new;
end;
$$;

drop trigger if exists trg_session_bookings_consume_credit on public.session_bookings;

create trigger trg_session_bookings_consume_credit
    before insert on public.session_bookings
    for each row execute function public.fn_consume_pack_credit();

-- ---------------------------------------------------------------------
-- 4. RLS — unchanged from `20260714000002_session_grants.sql`
-- ---------------------------------------------------------------------
-- The existing policies are:
--   - `session_grants_select_owner_admin` (SELECT: student OR admin)
--   - default-deny for INSERT/UPDATE/DELETE
-- No policy changes are required by this migration. The new
-- trigger runs as SECURITY INVOKER (the caller's role) and is
-- invoked from the same INSERT the application code already
-- issues; RLS permits the application's authenticated write.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------
comment on column public.session_grants.grant_type is
    'Classification of the row: ''individual'' (per-session PAYG), ''pack'' (Pack 10 credit pool), ''subscription'' (Monthly Support period credit pool).';

comment on column public.session_grants.total_credits is
    'Total credit count for pack/subscription rows. NULL on individual rows.';

comment on column public.session_grants.consumed_credits is
    'Credits consumed by session_bookings rows. Always 0 on individual rows.';

comment on column public.session_grants.expires_at is
    'When a pack/subscription row stops being consumable. NULL on individual rows and on subscription rows whose end is governed by `subscriptions.current_period_end`.';

comment on function public.fn_consume_pack_credit() is
    'BEFORE INSERT trigger on session_bookings. For pack/subscription grants, atomically debits one credit from the referenced session_grants row and flips status to completed when the pool is drained. PAYG rows pass through unchanged.';

-- ---------------------------------------------------------------------
-- 6. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.