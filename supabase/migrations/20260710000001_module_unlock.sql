-- =====================================================================
-- Migration: 20260710000001_module_unlock.sql
-- Sprint:     C — Phase 3 (module completion cascade)
--
-- Description
-- -----------
-- Precondition 2 from the Sprint C kick-off: a student can only
-- book the next module of a course. The Calendly embed currently
-- lets the student pick any event type. Sprint C enforces the
-- rule "module N+1 unlocks when module N is completed" in the
-- database (source of truth) and double-checks it in the service
-- layer (defensive UX).
--
-- Rule
-- ----
--   * A module at `position = P` is bookable by an enrollment
--     when every other module of the same course at
--     `position < P` has `module_progress.status = 'completed'`
--     for that enrollment.
--   * A module flagged `is_preview = true` bypasses the check
--     (free-preview modules are always bookable).
--   * The trigger is `BEFORE INSERT` on `module_bookings`. It
--     raises `P0001` (generic raise_exception, with a custom
--     `errcode` set explicitly to `P0001` for portability) when
--     a preceding module is not yet completed. The route handler
--     at `/api/enrollments/[id]/modules` (the only legitimate
--     caller per `Database.md` §6.2) maps the error to a
--     `409 module_locked` response.
--
-- Defense-in-depth
-- ----------------
-- The DB is the source of truth. The service-side helper in
-- `services/bookings/module-unlock.ts` runs the same check before
-- the insert and returns a friendlier error code so the client
-- can show a meaningful toast without a round-trip. If the
-- service is wrong, the DB still rejects the insert.
--
-- SECURITY DEFINER
-- ----------------
-- The trigger runs with the calling user's privileges by default.
-- It does not WRITE to `module_progress` (it only reads), so
-- SECURITY DEFINER is not strictly required for this trigger.
-- We mark it as such for consistency with the B2 completion
-- triggers and to future-proof against a possible future version
-- that also writes (e.g. auto-creating a `module_progress` row
-- with `status='in_progress'` on first booking).
--
-- Idempotency
-- -----------
-- Every `create or replace` and `drop trigger if exists` is
-- guarded. Re-applying the file is safe.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The unlock-check function
-- ---------------------------------------------------------------------
create or replace function public.fn_module_unlock_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_course_id      uuid;
    v_position       int;
    v_is_preview     boolean;
    v_blocking_count int;
begin
    -- Look up the module being booked.
    select m.course_id, m.position, m.is_preview
      into v_course_id, v_position, v_is_preview
      from public.modules m
     where m.id = NEW.module_id;

    -- A free-preview module is always bookable. Bypass the check.
    if v_is_preview then
        return NEW;
    end if;

    -- Count the modules of the same course at a lower position
    -- that are still not completed for this enrollment.
    --
    -- The `is_published = true` predicate matches the B2 RLS
    -- policy `modules_select_published_or_admin`: an unpublished
    -- module cannot be booked anyway, so it does not block.
    select count(*) into v_blocking_count
    from public.modules m
    left join public.module_progress mp
           on mp.module_id = m.id
          and mp.enrollment_id = NEW.enrollment_id
          and mp.status = 'completed'
    where m.course_id = v_course_id
      and m.position < v_position
      and m.is_published = true
      and mp.id is null;

    if v_blocking_count > 0 then
        raise exception 'module_locked: % preceding module(s) not yet completed', v_blocking_count
          using errcode = 'P0001',
                hint    = 'Complete the previous module before booking this one.';
    end if;

    return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. The trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_module_unlock on public.module_bookings;
create trigger trg_module_unlock
    before insert on public.module_bookings
    for each row execute function public.fn_module_unlock_check();

-- ---------------------------------------------------------------------
-- 3. Self-describe
-- ---------------------------------------------------------------------
comment on function public.fn_module_unlock_check()
    is 'Module unlock check: reject INSERT into module_bookings when a preceding module of the same course is not yet completed (per module_progress for this enrollment). is_preview=true modules bypass the check. Raises P0001 (custom message "module_locked: …") so the route handler can map to 409 module_locked.';
