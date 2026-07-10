-- =====================================================================
-- Migration: 20260710000000_enrollments_refund_trigger.sql
-- Sprint:     C — Phase 3 (Stripe refund cascade)
--
-- Description
-- -----------
-- Precondition 1 from the Sprint C kick-off: when a Stripe refund
-- fires (`charge.refunded` webhook → payments row flips to
-- `status='refunded'`), the linked `enrollments` row must flip
-- to `status='refunded'` atomically. The B2 webhook handler
-- updates the `payments` row but leaves `enrollments` untouched.
-- This trigger closes the loop.
--
-- Lifecycle now (Sprint C)
-- -------------------------
--   pending_payment ─┐
--                    ├─→ active ──→ completed
--                    │      │
--                    │      └─→ refunded   (NEW: this trigger)
--                    └─→ cancelled
--
-- Semantics
-- ---------
--   * The trigger fires `BEFORE UPDATE` on `payments`. If the row
--     flipped `OLD.status → 'refunded'` AND has a non-null
--     `enrollment_id`, cascade the flip on the linked enrollment
--     (`status`, `refunded_at`, `refunded_amount_cents`,
--     `updated_at`).
--   * The cascade is guarded: it only fires when the current
--     enrollment status is `active` or `completed`. A refund on
--     an already-refunded or already-cancelled enrollment is a
--     no-op (a re-fire of `charge.refunded` is harmless and
--     idempotent).
--   * The trigger is `SECURITY DEFINER` for the same reason as
--     the B2 completion triggers: the calling context may not
--     have `update` rights on `enrollments` (RLS denies direct
--     user writes — only n8n with the service-role key can
--     touch `enrollments` directly). The trigger runs as the
--     migration's superuser and bypasses RLS.
--
-- Idempotency
-- -----------
-- The migration guards every `create or replace`, every
-- `drop trigger if exists`, and every `drop policy if exists`.
-- Re-applying the file on a partially-applied database is safe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The cascade function
-- ---------------------------------------------------------------------
create or replace function public.fn_enrollments_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Only act when the payment row flips to 'refunded' and it
    -- is linked to an enrollment. Anything else (succeeded, failed,
    -- a re-fire that is already refunded) is a no-op.
    if (TG_OP = 'UPDATE'
        and NEW.status = 'refunded'
        and (OLD.status is null or OLD.status <> 'refunded')
        and NEW.enrollment_id is not null)
    then
        update public.enrollments e
        set status                = 'refunded',
            refunded_at           = coalesce(e.refunded_at, now()),
            refunded_amount_cents = coalesce(NEW.refunded_amount_cents, e.refunded_amount_cents),
            updated_at            = now()
        where e.id = NEW.enrollment_id
          and e.status in ('active', 'completed');

        -- Best-effort: any active module_bookings on the now-
        -- refunded enrollment are still owned by the student.
        -- The refund route handler is responsible for cancelling
        -- them one by one (a course-level refund does not
        -- implicitly cancel scheduled module sessions; the
        -- user must opt-in). We do NOT cascade-cancel here.
    end if;
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_enrollments_refund on public.payments;
create trigger trg_enrollments_refund
    before update of status on public.payments
    for each row execute function public.fn_enrollments_refund();

-- ---------------------------------------------------------------------
-- 3. Self-describe
-- ---------------------------------------------------------------------
comment on function public.fn_enrollments_refund()
    is 'Cascade refund: when a payments row flips to status=refunded and is linked to an enrollment, flip the enrollment too. SECURITY DEFINER (RLS bypass) because the calling context does not have UPDATE on enrollments.';
