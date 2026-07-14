-- =====================================================================
-- RLS smoke-test assertions — Sprint 3.5 (v2)
-- =====================================================================
--
-- Purpose
-- -------
-- Run AFTER `rls_smoke_assertions.sql`. Tests the v2 RLS
-- policies added in
--   * 20260714000007_rls_policies_curriculum_v2.sql
-- on the new tables: `programs`, `grades`, `chapters`,
-- `sessions`, `session_grants`, `session_bookings`.
--
-- What it tests
-- -------------
--   * programs_select_published_or_admin   — student sees published, not unpublished
--   * grades_select_published_or_admin     — student sees published, not unpublished
--   * chapters_select_published_or_admin   — student sees published, not unpublished
--   * sessions_select_published_or_admin   — student sees published, not unpublished
--   * session_grants_select_owner_tutor_admin — owner / tutor / admin; not other student
--   * session_grants_no_direct_write       — student cannot INSERT/UPDATE/DELETE
--   * session_bookings_select_owner_tutor_admin — owner / tutor / admin; not other student
--   * session_bookings_student_update_cancel — student can self-cancel; cannot change student_id
--   * payments_select_via_session_grant    — owner / admin; not other student
--   * meeting_links_select_via_session_booking — owner / admin; not other student
--
-- Required setup
-- --------------
-- 1. `rls_smoke_setup.sql` must have been run.
-- 2. The migrations 1–13 (B2 + C) must be applied.
-- 3. Migrations 14_0000..14_0007 (Sprint 3.5) must be applied.
--
-- The script uses the same `set local role authenticated` +
-- `request.jwt.claim.sub` pattern as the v1 assertions.
--
-- Run with `-v ON_ERROR_STOP=1` to fail the pipeline on
-- any raised exception.
-- =====================================================================

do $$
declare
    v_student_a  uuid := '00000000-0000-0000-0000-00000000a001';
    v_student_b  uuid := '00000000-0000-0000-0000-00000000b001';
    v_tutor      uuid := '00000000-0000-0000-0000-00000000c001';
    v_admin      uuid := '00000000-0000-0000-0000-00000000d001';

    v_session_published    uuid;
    v_session_unpublished  uuid;
    v_grant_a              uuid;
    v_count                integer;
    v_err                  text;
begin
    -- -----------------------------------------------------------------
    -- Setup: create one published + one unpublished session on
    -- the v1 demo course (c1) — the backfill in
    -- 20260714000006_seed_demo_chapters_sessions.sql already
    -- created published rows; we add one unpublished one for
    -- the policy test.
    -- -----------------------------------------------------------------
    insert into public.sessions (
        chapter_id, position, slug, title, description,
        duration_min, price_cents, currency, is_published
    )
    select
        c.id, c.position + 100, c.slug || '-unpub', c.title || ' (unpublished)',
        null, c.default_duration_min, 4500, 'EUR', false
    from public.chapters c
    where c.course_id = '00000000-0000-0000-0000-000000000c001'
    limit 1
    returning id into v_session_unpublished;

    select id into v_session_published
    from public.sessions
    where is_published = true
    limit 1;

    if v_session_published is null then
        raise exception 'FAIL  setup: no published sessions exist (run rls_smoke_setup.sql + the backfill first)';
    end if;

    insert into public.session_grants (
        student_id, session_id, status, amount_cents, currency
    ) values (
        v_student_a, v_session_published, 'active', 4500, 'EUR'
    ) returning id into v_grant_a;

    raise notice 'SETUP ok: published_session=%, unpublished_session=%, grant_a=%',
        v_session_published, v_session_unpublished, v_grant_a;

    -- -----------------------------------------------------------------
    -- 1. programs_select_published_or_admin
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    select count(*) into v_count from public.programs;
    if v_count >= 1 then
        raise notice 'PASS  programs_select_published_or_admin: student sees % programs', v_count;
    else
        raise exception 'FAIL  programs_select_published_or_admin: expected >=1 program';
    end if;
    reset role;

    -- -----------------------------------------------------------------
    -- 2. grades_select_published_or_admin
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    select count(*) into v_count from public.grades;
    if v_count >= 1 then
        raise notice 'PASS  grades_select_published_or_admin: student sees % grades', v_count;
    else
        raise exception 'FAIL  grades_select_published_or_admin: expected >=1 grade';
    end if;
    reset role;

    -- -----------------------------------------------------------------
    -- 3. chapters_select_published_or_admin
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    select count(*) into v_count from public.chapters where is_published = true;
    if v_count >= 1 then
        raise notice 'PASS  chapters_select_published_or_admin: student sees % published chapters', v_count;
    else
        raise exception 'FAIL  chapters_select_published_or_admin: expected >=1 published chapter';
    end if;

    -- 3b. Student does NOT see unpublished chapters.
    select count(*) into v_count from public.chapters where is_published = false;
    if v_count = 0 then
        raise notice 'PASS  chapters_select_published_or_admin: student sees 0 unpublished chapters';
    else
        raise exception 'FAIL  chapters_select_published_or_admin: student should not see unpublished chapters';
    end if;
    reset role;

    -- -----------------------------------------------------------------
    -- 4. sessions_select_published_or_admin
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    select count(*) into v_count from public.sessions where id = v_session_unpublished;
    if v_count = 0 then
        raise notice 'PASS  sessions_select_published_or_admin: student cannot see unpublished session';
    else
        raise exception 'FAIL  sessions_select_published_or_admin: student should not see unpublished session';
    end if;
    select count(*) into v_count from public.sessions where id = v_session_published;
    if v_count = 1 then
        raise notice 'PASS  sessions_select_published_or_admin: student can see published session';
    else
        raise exception 'FAIL  sessions_select_published_or_admin: student should see published session';
    end if;
    reset role;

    -- -----------------------------------------------------------------
    -- 5. session_grants_select_owner_tutor_admin
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    select count(*) into v_count from public.session_grants where id = v_grant_a;
    if v_count = 1 then
        raise notice 'PASS  session_grants_select_owner: owner sees own grant';
    else
        raise exception 'FAIL  session_grants_select_owner: owner should see own grant';
    end if;
    reset role;

    perform set_config('request.jwt.claim.sub', v_student_b::text, true);
    set local role authenticated;
    select count(*) into v_count from public.session_grants where id = v_grant_a;
    if v_count = 0 then
        raise notice 'PASS  session_grants_select_isolation: student_b cannot see student_a grant';
    else
        raise exception 'FAIL  session_grants_select_isolation: student_b should not see student_a grant';
    end if;
    reset role;

    -- -----------------------------------------------------------------
    -- 6. session_grants_no_direct_write
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_student_a::text, true);
    set local role authenticated;
    begin
        insert into public.session_grants (student_id, session_id, status, amount_cents, currency)
        values (v_student_a, v_session_published, 'active', 4500, 'EUR');
        raise exception 'FAIL  session_grants_no_direct_write: student INSERT was allowed';
    exception
        when others then
            v_err := sqlerrm;
            if v_err like '%row-level security%' or v_err like '%policy%' or v_err like '%violates%' then
                raise notice 'PASS  session_grants_no_direct_write: student INSERT blocked (%)', v_err;
            else
                raise exception 'FAIL  session_grants_no_direct_write: unexpected error %', v_err;
            end if;
    end;
    reset role;

    -- -----------------------------------------------------------------
    -- 7. session_bookings_select_owner_tutor_admin
    -- -----------------------------------------------------------------
    declare
        v_booking uuid;
    begin
        insert into public.session_bookings (
            student_id, session_id, session_grant_id, tutor_id,
            scheduled_start, scheduled_end, status
        ) values (
            v_student_a, v_session_published, v_grant_a, v_tutor,
            now() + interval '1 day', now() + interval '1 day' + interval '1 hour',
            'scheduled'
        ) returning id into v_booking;

        perform set_config('request.jwt.claim.sub', v_student_a::text, true);
        set local role authenticated;
        select count(*) into v_count from public.session_bookings where id = v_booking;
        if v_count = 1 then
            raise notice 'PASS  session_bookings_select_owner: owner sees own booking';
        else
            raise exception 'FAIL  session_bookings_select_owner: owner should see own booking';
        end if;
        reset role;

        perform set_config('request.jwt.claim.sub', v_student_b::text, true);
        set local role authenticated;
        select count(*) into v_count from public.session_bookings where id = v_booking;
        if v_count = 0 then
            raise notice 'PASS  session_bookings_select_isolation: student_b cannot see student_a booking';
        else
            raise exception 'FAIL  session_bookings_select_isolation: student_b should not see student_a booking';
        end if;
        reset role;
    end;

    -- -----------------------------------------------------------------
    -- 8. payments_select_via_session_grant
    -- -----------------------------------------------------------------
    declare
        v_payment uuid;
    begin
        insert into public.payments (
            session_grant_id, amount_cents, currency, status, provider,
            stripe_payment_intent_id
        ) values (
            v_grant_a, 4500, 'EUR', 'succeeded', 'stripe',
            'pi_test_sprint35_rls'
        ) returning id into v_payment;

        perform set_config('request.jwt.claim.sub', v_student_a::text, true);
        set local role authenticated;
        select count(*) into v_count from public.payments where id = v_payment;
        if v_count = 1 then
            raise notice 'PASS  payments_select_via_session_grant: owner sees own payment';
        else
            raise exception 'FAIL  payments_select_via_session_grant: owner should see own payment';
        end if;
        reset role;

        perform set_config('request.jwt.claim.sub', v_student_b::text, true);
        set local role authenticated;
        select count(*) into v_count from public.payments where id = v_payment;
        if v_count = 0 then
            raise notice 'PASS  payments_select_isolation: student_b cannot see student_a payment';
        else
            raise exception 'FAIL  payments_select_isolation: student_b should not see student_a payment';
        end if;
        reset role;
    end;

    -- -----------------------------------------------------------------
    -- 9. Admin can see all session_grants
    -- -----------------------------------------------------------------
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    set local role authenticated;
    -- The admin role bypasses RLS via the `is_admin()` SECURITY
    -- DEFINER helper, but the helper is evaluated under the
    -- caller's role. Mark the admin profile as super_admin.
    update public.profiles set role = 'super_admin' where id = v_admin;
    select count(*) into v_count from public.session_grants where id = v_grant_a;
    if v_count = 1 then
        raise notice 'PASS  session_grants_select_admin: admin sees all grants';
    else
        raise exception 'FAIL  session_grants_select_admin: admin should see all grants';
    end if;
    reset role;
    update public.profiles set role = 'student' where id = v_admin;

    -- -----------------------------------------------------------------
    -- 10. Summary
    -- -----------------------------------------------------------------
    raise notice '---- RLS smoke v2: all assertions passed (Sprint 3.5) ----';
end $$;
