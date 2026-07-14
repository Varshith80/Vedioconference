-- =====================================================================
-- Migration: 20260714000005_drop_module_progress_module_unlock.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Drops the pre-Sprint-3.5 `module_progress` table + its enum +
-- the `trg_module_unlock` trigger + the `fn_module_unlock_check`
-- function. These rows are no longer needed because:
--
--   - `module_progress` was the per-enrollment × per-module
--     progress signal of the v1 hierarchy. The new hierarchy has
--     no "course" as the unit of progress; the `session_grant`
--     itself is the progress. The `session_bookings.status`
--     column (a `booking_status` enum value: scheduled /
--     confirmed / completed / cancelled / no_show) is the
--     equivalent signal.
--
--   - `trg_module_unlock` enforced the strict ordering rule
--     "module at position P is bookable only if every module at
--     position < P is completed". The user-approved Q4 answer
--     drops this rule — students can now book any session of a
--     course they own a grant for, in any order. The Calendly
--     embed on the dashboard lists the sessions in `position`
--     order but does not gate on completion.
--
-- What is added back
-- ------------------
-- A no-op `fn_session_grants_completion` trigger function is
-- created so the `session_grants` table has an audit-friendly
-- hook for future completion logic (e.g. a tutor-side
-- attendance confirmation). The trigger body is intentionally
-- minimal — it does not cascade, because the new model has no
-- concept of "course completion". The grant itself is the
-- progress.
--
-- Idempotency
-- -----------
-- Every DROP / CREATE is guarded with `if exists` (or
-- `drop policy if exists`). The migration can be re-applied
-- safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop the unlock rule trigger + function
-- ---------------------------------------------------------------------
drop trigger if exists trg_module_unlock on public.module_bookings;
drop function if exists public.fn_module_unlock_check();

-- ---------------------------------------------------------------------
-- 2. Drop the module_progress table + its enum
-- ---------------------------------------------------------------------
drop trigger if exists trg_module_progress_updated_at on public.module_progress;
drop trigger if exists trg_module_progress_audit      on public.module_progress;
drop trigger if exists trg_enrollments_completion    on public.module_progress;

drop table    if exists public.module_progress;
drop type     if exists public.module_progress_status;

-- ---------------------------------------------------------------------
-- 3. Add a no-op completion hook for session_grants
-- ---------------------------------------------------------------------
-- The body is intentionally minimal. A future sprint (Sprint 5
-- or later) can extend this to:
--   - flip session_grants.status to 'completed' on
--     session_bookings.status = 'completed'
--   - send a Resend "session attended" email
--   - create a resource_grant for post-session materials
-- The hook is in place so adding the trigger is a one-line
-- change, not a new migration.
create or replace function public.fn_session_grants_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- No-op in Sprint 3.5. See the comment above for future
    -- extensions. The function exists so the trigger can be
    -- wired without a separate migration.
    return NEW;
end;
$$;

-- The trigger is NOT created in this migration — it is created
-- in 20260714000007_rls_policies_curriculum_v2.sql once the
-- RLS policies are in place and the v1 `module_progress` reads
-- are verified to be gone. (Adding the trigger here would
-- require the function to exist on the table, which it does,
-- but the trigger body is a no-op anyway and adds noise to
-- the diff; the wiring lands with the RLS migration where it
-- can be reviewed alongside the other trigger additions.)

-- ---------------------------------------------------------------------
-- 4. Comments
-- ---------------------------------------------------------------------
comment on function public.fn_session_grants_completion() is
    'No-op completion hook for session_grants. Wired in 20260714000007_rls_policies_curriculum_v2.sql. Future extensions (Sprint 5+) may flip the grant to completed, send a Resend email, or create a resource_grant.';

-- ---------------------------------------------------------------------
-- 5. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
