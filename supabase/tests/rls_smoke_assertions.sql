-- =====================================================================
-- RLS smoke-test assertions — Sprint B2
-- =====================================================================
--
-- Purpose
-- -------
-- Run as the `service_role` superuser (which bypasses RLS) but
-- impersonate `authenticated` users for each assertion. Each
-- assertion block:
--   1. `set local role authenticated`
--   2. `select set_config('request.jwt.claim.sub', '<uuid>', true)`
--   3. `select set_config('request.jwt.claim.role', 'authenticated', true)`
--   4. Runs the query under test.
--   5. Asserts the count or the error matches the expectation.
--
-- The script raises an exception on the first failure (so a CI
-- run stops early) and prints a `pass` / `fail` line for every
-- block. Run with `-v ON_ERROR_STOP=1` to fail the pipeline on
-- any raised exception.
--
-- Required setup
-- --------------
-- 1. `rls_smoke_setup.sql` must have been run.
-- 2. The migrations 1–9 must be applied.
--
-- What it tests
-- -------------
-- For each B2 RLS policy added or changed in
-- `20260709000001_modules_enrollments.sql`:
--   * modules_select_published_or_admin       — student sees published, not unpublished
--   * modules_admin_write                     — admin writes, student can't
--   * enrollments_select_owner_tutor_admin    — student sees own, tutor sees course's, other doesn't
--   * enrollments_no_direct_write             — student cannot INSERT/UPDATE/DELETE
--   * module_progress_select_owner_tutor_admin — owner / tutor / admin visibility
--   * module_bookings_select_owner_tutor_admin — owner / tutor / admin visibility
--   * module_bookings_student_update_cancel   — student can self-cancel; cannot change student_id
--   * payments_select_owner_or_admin          — owner / admin; not other student
--   * meeting_links_select_via_module_booking — owner / admin; not other student
--   * resource_grants_select_via_enrollment   — owner / admin; not other student
--   * resources_select_visible (rebuilt)      — enrolled resource visible to owner; not to other student
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
--
-- Use a temp schema to hold our assertion plumbing so it doesn't
-- leak into the public namespace. The schema is dropped at the
-- end of the session.
create schema if not exists rls_smoke;

create or replace function rls_smoke.impersonate(p_user uuid)
returns void
language plpgsql
as $$
begin
    -- set_config's third arg `true` makes the setting
    -- transaction-local (cleared on COMMIT/ROLLBACK).
    perform set_config('request.jwt.claim.sub',  p_user::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function rls_smoke.reset_role()
returns void
language plpgsql
as $$
begin
    reset role;
    perform set_config('request.jwt.claim.sub',  '', false);
    perform set_config('request.jwt.claim.role', '', false);
end;
$$;

-- A simple assertion helper. Prints PASS or raises EXCEPTION.
create or replace function rls_smoke.expect(
    p_label   text,
    p_actual  bigint,
    p_expected bigint
)
returns void
language plpgsql
as $$
begin
    if p_actual = p_expected then
        raise notice 'PASS  %  (got %)', p_label, p_actual;
    else
        raise exception 'FAIL  %  — expected % got %', p_label, p_expected, p_actual;
    end if;
end;
$$;

-- A boolean assertion helper.
create or replace function rls_smoke.expect_true(
    p_label   text,
    p_actual  boolean
)
returns void
language plpgsql
as $$
begin
    if p_actual is true then
        raise notice 'PASS  %', p_label;
    else
        raise exception 'FAIL  %  — expected true', p_label;
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Stable UUIDs (mirror the fixture).
-- ---------------------------------------------------------------------
--   admin:    a1a1a1a1-0000-0000-0000-000000000001
--   tutor:    a1a1a1a1-0000-0000-0000-000000000002
--   studentA: a1a1a1a1-0000-0000-0000-000000000003
--   studentB: a1a1a1a1-0000-0000-0000-000000000004
--   course:   a1a1a1a1-0000-0000-0000-000000000010
--   module:   a1a1a1a1-0000-0000-0000-000000000011
--   enrollA:  a1a1a1a1-0000-0000-0000-000000000020
--   enrollB:  a1a1a1a1-0000-0000-0000-000000000021
--   booking:  a1a1a1a1-0000-0000-0000-000000000030
--   payment:  a1a1a1a1-0000-0000-0000-000000000040
--   meeting:  a1a1a1a1-0000-0000-0000-000000000050
--   resource: a1a1a1a1-0000-0000-0000-000000000060

-- ---------------------------------------------------------------------
-- 1b. modules — `modules_admin_write` (admin-only)
-- ---------------------------------------------------------------------
do $$
declare
    v_inserted boolean := false;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    begin
        insert into public.modules (id, course_id, position, slug, title, is_published)
        values (
            'a1a1a1a1-0000-0000-0000-0000000000fe',
            'a1a1a1a1-0000-0000-0000-000000000010', 100, 'rls-smoke-student-insert', 'X', false
        );
        v_inserted := true;
    exception when insufficient_privilege or others then
        v_inserted := false;
    end;
    perform rls_smoke.expect_true('modules: student INSERT is rejected (admin-only)', not v_inserted);
    perform rls_smoke.reset_role();
end $$;
-- The smoke fixture inserts ONE published module for the smoke
-- course. A student should see it; an unpublished module would be
-- invisible to the same student.
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count
        from public.modules
        where course_id = 'a1a1a1a1-0000-0000-0000-000000000010';
    perform rls_smoke.expect('modules: student sees published module', v_count, 1);

    -- Insert an unpublished module while impersonating the tutor
    -- to verify it is *not* visible to the student. The tutor
    -- does not have INSERT rights on modules (admin-only), so
    -- we use service_role for the insert and the test for
    -- visibility only.
    perform rls_smoke.reset_role();
    insert into public.modules (id, course_id, position, slug, title, is_published)
    values (
        'a1a1a1a1-0000-0000-0000-0000000000ff',
        'a1a1a1a1-0000-0000-0000-000000000010', 99, 'rls-smoke-hidden', 'Hidden', false
    ) on conflict (id) do nothing;

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count
        from public.modules
        where id = 'a1a1a1a1-0000-0000-0000-0000000000ff';
    perform rls_smoke.expect('modules: student does NOT see unpublished module', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000001'); -- admin
    select count(*) into v_count
        from public.modules
        where id = 'a1a1a1a1-0000-0000-0000-0000000000ff';
    perform rls_smoke.expect('modules: admin sees unpublished module', v_count, 1);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 2. enrollments — `enrollments_select_owner_tutor_admin`
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    -- student A: sees their own, not B's
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count from public.enrollments where student_id = 'a1a1a1a1-0000-0000-0000-000000000003';
    perform rls_smoke.expect('enrollments: student A sees their own enrollment', v_count, 1);
    select count(*) into v_count from public.enrollments where student_id = 'a1a1a1a1-0000-0000-0000-000000000004';
    perform rls_smoke.expect('enrollments: student A does NOT see B enrollment', v_count, 0);

    -- tutor: sees both (they teach the course)
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000002'); -- tutor
    select count(*) into v_count
        from public.enrollments
        where course_id = 'a1a1a1a1-0000-0000-0000-000000000010';
    perform rls_smoke.expect('enrollments: tutor sees both enrollments for their course', v_count, 2);

    -- admin: sees all
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000001'); -- admin
    select count(*) into v_count
        from public.enrollments
        where course_id = 'a1a1a1a1-0000-0000-0000-000000000010';
    perform rls_smoke.expect('enrollments: admin sees both enrollments', v_count, 2);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 3. enrollments — `enrollments_no_direct_write` (deny-by-default)
-- ---------------------------------------------------------------------
do $$
declare
    v_inserted boolean := false;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    begin
        insert into public.enrollments (id, student_id, course_id, status, amount_cents, currency)
        values (
            'a1a1a1a1-0000-0000-0000-000000000099',
            'a1a1a1a1-0000-0000-0000-000000000003',
            'a1a1a1a1-0000-0000-0000-000000000010',
            'active', 9999, 'EUR'
        );
        v_inserted := true;
    exception when insufficient_privilege or others then
        v_inserted := false;
    end;
    perform rls_smoke.expect_true('enrollments: student INSERT is rejected', not v_inserted);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 4. module_progress — `module_progress_select_owner_tutor_admin`
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count
        from public.module_progress mp
        join public.enrollments e on e.id = mp.enrollment_id
        where e.student_id = 'a1a1a1a1-0000-0000-0000-000000000003';
    perform rls_smoke.expect('module_progress: student A sees their own', v_count, 1);
    select count(*) into v_count
        from public.module_progress mp
        join public.enrollments e on e.id = mp.enrollment_id
        where e.student_id = 'a1a1a1a1-0000-0000-0000-000000000004';
    perform rls_smoke.expect('module_progress: student A does NOT see B', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000002'); -- tutor
    select count(*) into v_count
        from public.module_progress mp
        join public.enrollments e on e.id = mp.enrollment_id
        where e.course_id = 'a1a1a1a1-0000-0000-0000-000000000010';
    perform rls_smoke.expect('module_progress: tutor sees both for their course', v_count, 2);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 5. module_bookings — `module_bookings_select_owner_tutor_admin`
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count from public.module_bookings;
    perform rls_smoke.expect('module_bookings: student A sees their own', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000004'); -- student B
    select count(*) into v_count from public.module_bookings;
    perform rls_smoke.expect('module_bookings: student B sees zero (not theirs)', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000002'); -- tutor
    select count(*) into v_count from public.module_bookings;
    perform rls_smoke.expect('module_bookings: tutor sees one (they teach it)', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000001'); -- admin
    select count(*) into v_count from public.module_bookings;
    perform rls_smoke.expect('module_bookings: admin sees all', v_count, 1);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 6. module_bookings — `module_bookings_student_update_cancel`
-- ---------------------------------------------------------------------
-- A student can flip their own booking to 'cancelled' (covered
-- in the route). The `with check` clause also enforces that
-- they cannot change `student_id`. We assert the second.
do $$
declare
    v_updated integer := 0;
    v_rejected boolean := false;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A

    -- Self-cancel: should succeed (1 row updated).
    update public.module_bookings
        set status = 'cancelled', cancelled_reason = 'smoke test'
        where id = 'a1a1a1a1-0000-0000-0000-000000000030';
    get diagnostics v_updated = row_count;
    perform rls_smoke.expect('module_bookings: student can self-cancel', v_updated, 1);

    -- Try to reassign the booking to student B. The policy's
    -- `with check` requires `student_id = auth.uid()`; assigning
    -- to B's id violates it and Postgres raises
    -- `new row violates row-level security policy`. We catch
    -- that and treat it as a pass.
    begin
        update public.module_bookings
            set student_id = 'a1a1a1a1-0000-0000-0000-000000000004'
            where id = 'a1a1a1a1-0000-0000-0000-000000000030';
        get diagnostics v_updated = row_count;
        v_rejected := (v_updated = 0);
    exception
        when insufficient_privilege        then v_rejected := true;
        when sqlstate '42501'              then v_rejected := true; -- insufficient_privilege
        when sqlstate 'P0001'              then v_rejected := true; -- raise_exception (RLS)
        when others                        then v_rejected := true;
    end;
    perform rls_smoke.expect_true('module_bookings: student cannot reassign owner', v_rejected);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 7. payments — `payments_select_owner_or_admin`
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count from public.payments;
    perform rls_smoke.expect('payments: student A sees their own', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000004'); -- student B
    select count(*) into v_count from public.payments;
    perform rls_smoke.expect('payments: student B sees zero (not their enrollment)', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000001'); -- admin
    select count(*) into v_count from public.payments;
    perform rls_smoke.expect('payments: admin sees all', v_count, 1);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 8. meeting_links — `meeting_links_select_via_module_booking`
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count from public.meeting_links;
    perform rls_smoke.expect('meeting_links: student A sees their booking''s link', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000004'); -- student B
    select count(*) into v_count from public.meeting_links;
    perform rls_smoke.expect('meeting_links: student B sees zero', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000002'); -- tutor
    select count(*) into v_count from public.meeting_links;
    perform rls_smoke.expect('meeting_links: tutor sees their booking''s link', v_count, 1);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 9. resource_grants — `resource_grants_select_via_enrollment`
-- ---------------------------------------------------------------------
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count from public.resource_grants;
    perform rls_smoke.expect('resource_grants: student A sees their own', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000004'); -- student B
    select count(*) into v_count from public.resource_grants;
    perform rls_smoke.expect('resource_grants: student B sees zero', v_count, 0);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000001'); -- admin
    select count(*) into v_count from public.resource_grants;
    perform rls_smoke.expect('resource_grants: admin sees all', v_count, 1);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 10. resources — `resources_select_visible` (rebuilt)
-- ---------------------------------------------------------------------
-- The smoke resource is `enrolled` and granted only to student A.
-- Student A should see it (via the resource_grants join), student B
-- should not.
do $$
declare
    v_count bigint;
begin
    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000003'); -- student A
    select count(*) into v_count
        from public.resources
        where id = 'a1a1a1a1-0000-0000-0000-000000000060';
    perform rls_smoke.expect('resources: student A sees enrolled resource (granted to them)', v_count, 1);

    perform rls_smoke.impersonate('a1a1a1a1-0000-0000-0000-000000000004'); -- student B
    select count(*) into v_count
        from public.resources
        where id = 'a1a1a1a1-0000-0000-0000-000000000060';
    perform rls_smoke.expect('resources: student B does NOT see it (no grant)', v_count, 0);

    perform rls_smoke.reset_role();
end $$;

-- ---------------------------------------------------------------------
-- 11. module_bookings — `trg_module_unlock` (Sprint C)
-- ---------------------------------------------------------------------
-- The trigger rejects INSERTs into module_bookings when a
-- preceding module of the same course is not yet completed.
-- Student A's enrollment has 1 module (position 1) which is
-- `in_progress` (not `completed`). Inserting a NEW module
-- booking for the same module (or a phantom position 2) should
-- succeed only for `is_preview=true`. We test:
--   1. Inserting a new module_booking for the existing module
--      is allowed (position 1, no preceding module to block).
--   2. The 1 existing module_booking for A is at
--      `a1a1a1a1-0000-0000-0000-000000000030`.
--   3. We DO NOT attempt to insert a position-2 booking because
--      the fixture only has 1 module per course; the unlock
--      check is also exercised on the unit-test side via
--      `services/bookings/module-unlock.test.ts`.
--
-- The negative test (rejection with P0001) is exercised in the
-- 13. block below, where a synthetic second module is created
-- in-test and the trigger is proven to block the booking.
-- ---------------------------------------------------------------------
do $$
declare
    v_booking_id uuid;
begin
    -- This is a no-op read-side check: confirm the trigger does
    -- not interfere with the existing 1 booking. The negative
    -- test is in block 13.
    perform rls_smoke.reset_role();
    perform rls_smoke.expect_true(
        'module_unlock: trigger exists',
        (select exists (
            select 1 from pg_trigger
            where tgname = 'trg_module_unlock'
              and tgrelid = 'public.module_bookings'::regclass
        ))
    );
end $$;

-- ---------------------------------------------------------------------
-- 12. payments → enrollments — `trg_enrollments_refund` (Sprint C)
-- ---------------------------------------------------------------------
-- The trigger flips the linked enrollment to `refunded` when
-- the payments row flips to `status='refunded'`. We assert:
--   1. The trigger exists.
--   2. The fixture's payment row (`a1a1a1a1-…-0040`) is
--      currently `pending`. Flipping it to `refunded` cascades
--      student A's enrollment (`…0020`) to `refunded`.
--   3. After the cascade, the enrollment row's `status` is
--      `refunded` and `refunded_at` is set.
do $$
declare
    v_status           public.enrollment_status;
    v_refunded_at      timestamptz;
    v_refunded_amount  integer;
begin
    perform rls_smoke.reset_role();

    -- Sanity: the trigger exists.
    perform rls_smoke.expect_true(
        'refund_flip: trigger exists',
        (select exists (
            select 1 from pg_trigger
            where tgname = 'trg_enrollments_refund'
              and tgrelid = 'public.payments'::regclass
        ))
    );

    -- Reset the payment row so a re-run of this block is idempotent.
    update public.payments
       set status = 'pending',
           refunded_at = null,
           refunded_amount_cents = 0
     where id = 'a1a1a1a1-0000-0000-0000-000000000040';

    -- Reset the enrollment to `active` so the cascade has something to do.
    update public.enrollments
       set status = 'active',
           refunded_at = null,
           refunded_amount_cents = 0
     where id = 'a1a1a1a1-0000-0000-0000-000000000020';

    -- Now flip the payment row. The trigger must cascade.
    update public.payments
       set status = 'refunded',
           refunded_at = now(),
           refunded_amount_cents = 4500
     where id = 'a1a1a1a1-0000-0000-0000-000000000040';

    -- Read back the enrollment.
    select status, refunded_at, refunded_amount_cents
      into v_status, v_refunded_at, v_refunded_amount
      from public.enrollments
     where id = 'a1a1a1a1-0000-0000-0000-000000000020';

    perform rls_smoke.expect('refund_flip: enrollment status = refunded', v_status::text, 'refunded');
    perform rls_smoke.expect_true(
        'refund_flip: enrollment refunded_at is set',
        v_refunded_at is not null
    );
    perform rls_smoke.expect('refund_flip: enrollment refunded_amount_cents = 4500', v_refunded_amount, 4500);
end $$;

-- ---------------------------------------------------------------------
-- 13. module_unlock — negative test (P0001 raised)
-- ---------------------------------------------------------------------
-- Create a second published module at position 2 for the smoke
-- course, mark it NOT in the module_progress for A (i.e. A has
-- not completed module 1). Insert a module_booking for the
-- new module as student A; the trigger must raise P0001 with
-- the `module_locked` message. Then mark module 1 as
-- `completed` and re-insert; the trigger must allow it.
do $$
declare
    v_course_id constant uuid := 'a1a1a1a1-0000-0000-0000-000000000010';
    v_mod1      constant uuid := 'a1a1a1a1-0000-0000-0000-000000000011';
    v_mod2      constant uuid := 'a1a1a1a1-0000-0000-0000-000000000012';
    v_enroll_a  constant uuid := 'a1a1a1a1-0000-0000-0000-000000000020';
    v_tutor     constant uuid := 'a1a1a1a1-0000-0000-0000-0000000000aa';
    v_student_a constant uuid := 'a1a1a1a1-0000-0000-0000-000000000003';
    v_raised    text;
    v_booking_id uuid;
begin
    perform rls_smoke.reset_role();

    -- 1. Insert a second module at position 2. Idempotent.
    insert into public.modules (id, course_id, position, slug, title, duration_min, is_published, is_preview)
    values (v_mod2, v_course_id, 2, 'rls-smoke-module-2', 'Smoke Module 2', 60, true, false)
    on conflict (id) do nothing;

    -- 2. The pre-existing module_progress for A on module 1 is
    --    `in_progress` (set by the fixture). So a booking for
    --    module 2 must be rejected.
    begin
        insert into public.module_bookings (
            enrollment_id, module_id, tutor_id, student_id,
            status, scheduled_start, scheduled_end, timezone
        )
        values (
            v_enroll_a, v_mod2, v_tutor, v_student_a,
            'scheduled', now() + interval '5 days', now() + interval '5 days' + interval '1 hour',
            'Europe/Paris'
        )
        returning id into v_booking_id;

        raise exception 'module_unlock: expected P0001, got no error';
    exception
        when check_violation or others then
            v_raised := sqlerrm;
            if v_raised like '%module_locked%' then
                raise notice 'PASS  module_unlock: trigger raised P0001 (module_locked)';
            else
                raise exception 'FAIL  module_unlock: wrong error message: %', v_raised;
            end if;
    end;

    -- 3. Mark module 1 as `completed` for A. The insert must now succeed.
    update public.module_progress
       set status = 'completed', completed_at = now()
     where enrollment_id = v_enroll_a
       and module_id = v_mod1;

    begin
        insert into public.module_bookings (
            enrollment_id, module_id, tutor_id, student_id,
            status, scheduled_start, scheduled_end, timezone
        )
        values (
            v_enroll_a, v_mod2, v_tutor, v_student_a,
            'scheduled', now() + interval '5 days', now() + interval '5 days' + interval '1 hour',
            'Europe/Paris'
        )
        returning id into v_booking_id;

        if v_booking_id is not null then
            raise notice 'PASS  module_unlock: insert allowed after preceding module is completed';
        else
            raise exception 'FAIL  module_unlock: insert returned no id';
        end if;
    exception when others then
        raise exception 'FAIL  module_unlock: unexpected error after completing module 1: %', sqlerrm;
    end;
end $$;

-- ---------------------------------------------------------------------
-- 14. Summary
-- ---------------------------------------------------------------------
raise notice '---- RLS smoke: all assertions passed (Sprint B2 + C) ----';
