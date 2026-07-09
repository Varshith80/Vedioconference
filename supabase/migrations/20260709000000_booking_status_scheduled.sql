-- =====================================================================
-- Migration: 20260709000000_booking_status_scheduled.sql
-- Sprint:     B2 — module-based workflow
--
-- Description
-- -----------
-- Single responsibility: extend the existing
-- `public.booking_status` enum with the new 'scheduled' value
-- that the module-based booking lifecycle needs.
--
-- Why a separate migration
-- ------------------------
-- The new module-based lifecycle for `module_bookings` is:
--
--   scheduled → confirmed → completed
--                    ├─→ cancelled
--                    ├─→ no_show
--                    └─→ rescheduled
--
-- The pre-Sprint B2 lifecycle (still used by the legacy
-- `_bookings_legacy.bookings` rows that may exist) is:
--
--   pending_payment → confirmed → completed
--                          ├─→ cancelled
--                          ├─→ no_show
--                          └─→ rescheduled
--
-- We add 'scheduled' as a new value rather than rename
-- 'pending_payment' (see the in-file rationale in
-- 20260709000001_modules_enrollments.sql §1.0).
--
-- Why this lives in its own migration
-- -----------------------------------
-- Postgres has a strict rule: a value added by
-- `ALTER TYPE … ADD VALUE` cannot be referenced by another
-- statement in the same transaction. The Supabase CLI runs
-- each migration file in a single transaction, so adding
-- 'scheduled' in the same file as the `CREATE TABLE
-- module_bookings … DEFAULT 'scheduled'` statement would
-- leave the migration's success dependent on the Postgres
-- version's tolerance for cross-statement visibility. By
-- isolating the enum extension here, we guarantee the value
-- is committed before migration 9 starts and the
-- `module_bookings` table can use it as a DEFAULT without
-- any ambiguity.
--
-- Filename ordering
-- -----------------
-- `20260709000000` < `20260709000001` in lexical order, so
-- this migration is applied before `modules_enrollments`.
-- =====================================================================

do $$
begin
    if not exists (
        select 1
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'booking_status'
          and e.enumlabel = 'scheduled'
    ) then
        alter type public.booking_status add value 'scheduled' before 'confirmed';
    end if;
end $$;

comment on type public.booking_status is
    'Booking lifecycle. Pre-Sprint B2: pending_payment → confirmed → completed | cancelled | no_show | rescheduled. Sprint B2 adds ''scheduled'' for the module-based flow, used by `module_bookings` to mean "Calendly invitee.created fired, no Zoom yet".';
