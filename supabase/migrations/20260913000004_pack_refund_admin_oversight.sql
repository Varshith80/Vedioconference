-- =====================================================================
-- Migration: 20260913000004_pack_refund_admin_oversight.sql
-- Phase 1 — Feature B: Pack 10 admin grants + €35/unused-session refund.
--
-- This migration does TWO things, in order:
--
--   1. Opens `session_grants` writes to admins (current default
--      is deny-by-default for INSERT/UPDATE/DELETE per
--      20260714000002_session_grants.sql:113-114). The admin
--      needs to flip a Pack grant to `refunded` and stamp
--      `refunded_at` + `refunded_amount_cents` without going
--      through Stripe + n8n — the €35/unused-session refund
--      is initiated by the back-office from
--      /admin/packs/[id], not by a Stripe webhook. The
--      existing v2 cascade trigger
--      `fn_enrollments_refund` (in
--      20260715000000_drop_v1_back_compat_tables.sql) covers
--      the Stripe-webhook path; the new policy covers the
--      admin-route path. Both paths converge on the same
--      row state.
--
--   2. Tightens the cascade + adds a CHECK on
--      `refunded_amount_cents` so the row cannot carry a
--      refund larger than the original charge, and the
--      refunded_at stamp is required whenever the amount is
--      non-zero. Race-safety: the existing
--      `fn_consume_pack_credit` trigger (20260825000001)
--      blocks new bookings on an expired pool, so a refund
--      recorded after the 6-month expiry is still well-
--      defined and the partial unique indexes prevent
--      double-active grants.
--
-- Note: the COURSENLIGNE_FREE_TRIAL coupon seed previously lived
-- in this migration. It has been moved to Feature A's own
-- `20260913000003_free_trial_coupon_seed.sql` so that Feature A
-- can ship independently. The new migration is the canonical
-- owner; this comment is retained as a forward-pointer.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP is guarded with `if [not]
-- exists`. The migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Admin UPDATE policy on `session_grants`.
-- ---------------------------------------------------------------------
-- Default-deny was correct in Sprint 3.5 (only the Stripe
-- webhook + admin route wrote rows). The Pack refund admin
-- route is a NEW legitimate writer: it flips a Pack grant to
-- `refunded` and stamps `refunded_at` + `refunded_amount_cents`
-- without going through Stripe. This is the back-office path
-- for the €35/unused-session refund (Stripe does not know
-- about the per-session price; the operator computes the
-- amount from the credit pool and the existing payments
-- ledger).
--
-- The policy is `for update` ONLY. INSERT and DELETE stay
-- deny-by-default — only the Stripe webhook (service role)
-- and the trial/Pack create routes (which insert `pending_payment`
-- rows via SECURITY DEFINER RPCs) are allowed to insert.
--
-- The `with check` clause is permissive on `student_id` (the
-- admin is not changing ownership) and constrains `status`
-- to the documented `enrollment_status` lifecycle so a
-- misbehaving admin cannot move a row to a status the rest
-- of the system does not understand.
--
-- IMPORTANT: `session_grants.status` uses the
-- `enrollment_status` enum (Sprint 3.5, migration
-- 20260714000002_session_grants.sql), NOT the
-- `booking_status` enum. The `booking_status` enum has
-- `no_show` and `rescheduled` values; `enrollment_status`
-- does not. The valid list below mirrors the documented
-- `enrollment_status` range (Database.md §3.1):
--   pending_payment, active, completed, cancelled, refunded.
drop policy if exists session_grants_update_admin on public.session_grants;
create policy session_grants_update_admin
    on public.session_grants for update
    to authenticated
    using (public.is_admin())
    with check (
        public.is_admin()
        and status in (
            'pending_payment', 'active', 'completed',
            'cancelled', 'refunded'
        )
    );

-- ---------------------------------------------------------------------
-- 3. Refund integrity: amount must not exceed charge, and
--    refunded_at must be set iff refunded_amount_cents > 0.
-- ---------------------------------------------------------------------
-- Without this CHECK, a buggy admin route could stamp a
-- refund larger than the original charge (€299 Pack could
-- be refunded for €350), and could leave `refunded_at` set
-- with `refunded_amount_cents = 0` (a "phantom" refund
-- that would block the partial unique index on subsequent
-- attempts). The CHECK is the structural backstop; the
-- service layer is the primary guard.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'session_grants_refund_in_bounds'
    ) then
        alter table public.session_grants
            add constraint session_grants_refund_in_bounds
            check (
                refunded_amount_cents >= 0
                and refunded_amount_cents <= amount_cents
                and (
                    (refunded_amount_cents = 0 and refunded_at is null)
                 or (refunded_amount_cents > 0 and refunded_at is not null)
                )
            );
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Replace `fn_enrollments_refund` so the pack path is
--    explicit and race-safe.
-- ---------------------------------------------------------------------
-- The existing function (20260715000000 §1.5) cascades the
-- flip on EVERY linked session_grant. We tighten the
-- condition so the cascade ONLY fires for grants whose
-- current status allows a refund (`active` or `completed`).
-- A grant that is `cancelled` is left alone — the operator
-- must go through the new admin route for that edge case.
-- (`no_show` and `rescheduled` belong to the `booking_status`
-- enum, not to `enrollment_status`; they cannot appear on a
-- `session_grants` row.) The `fn_consume_pack_credit` trigger
-- (20260825000001) already blocks new bookings on an expired
-- pool, so the cascade does not need to re-check expiry here.
create or replace function public.fn_enrollments_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (TG_OP = 'UPDATE'
        and NEW.status = 'refunded'
        and (OLD.status is null or OLD.status <> 'refunded'))
    then
        if NEW.session_grant_id is not null then
            update public.session_grants sg
            set status                  = 'refunded',
                refunded_at             = coalesce(sg.refunded_at, now()),
                refunded_amount_cents   = NEW.refunded_amount_cents,
                updated_at              = now()
            where sg.id = NEW.session_grant_id
              and sg.status in ('active', 'completed');
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_enrollments_refund on public.payments;
create trigger trg_enrollments_refund
    before update of status on public.payments
    for each row execute function public.fn_enrollments_refund();

comment on function public.fn_enrollments_refund() is
    'Cascade refund (v2 + Feature B): when a payments row flips to status=refunded and is linked to a session_grant whose status is active or completed, flip the session_grant to refunded too. SECURITY DEFINER (RLS bypass) because the calling context does not have UPDATE on session_grants.';

-- ---------------------------------------------------------------------
-- 5. Self-describe
-- ---------------------------------------------------------------------
comment on policy session_grants_update_admin on public.session_grants is
    'Admin UPDATE only: lets /admin/packs/[id] flip a Pack grant to refunded and stamp refunded_at + refunded_amount_cents. The Stripe-webhook path (via fn_enrollments_refund) is unchanged; this policy adds the back-office path.';
