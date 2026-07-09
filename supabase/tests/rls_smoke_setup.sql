-- =====================================================================
-- RLS smoke-test fixture — Sprint B2
-- =====================================================================
--
-- Purpose
-- -------
-- Idempotent fixture that prepares a known set of rows for the
-- RLS smoke test harness in `rls_smoke_assertions.sql`.
--
-- All rows are namespaced with the `rls_smoke_` slug prefix so
-- the assertions file can target them deterministically, and so
-- a partial re-run does not collide with the development seed
-- in `seed/000_seed.sql` (which uses its own `aaaaaaaa-…`,
-- `22222222-…`, etc. UUIDs).
--
-- The fixture is **safe to re-run**: every `insert` uses
-- `on conflict do nothing`. The cleanup section is opt-in
-- (call `select rls_smoke_cleanup();` or run `rls_smoke_teardown.sql`).
--
-- What it creates
-- ---------------
--   * 1 admin profile       (rls_smoke_admin@example.com)
--   * 1 tutor profile + row (rls_smoke_tutor@example.com)
--   * 2 student profiles    (A and B)
--   * 1 published course    ("rls-smoke-course")
--   * 1 module              ("rls-smoke-module")
--   * 2 enrollments         (A → course, B → course)
--   * 1 module_booking      (A's enrollment → module)
--   * 1 payment             (A's enrollment, status = 'pending')
--   * 1 meeting_link        (A's module_booking)
--   * 1 resource            (course-level, visibility = 'enrolled')
--   * 1 resource_grant      (course's resource → A's enrollment)
--
-- Required database
-- -----------------
-- The migration `20260709000001_modules_enrollments.sql` must
-- already be applied. The script uses the `service_role` to
-- bypass RLS while it inserts (the *assertions* are run as
-- `authenticated`; the *fixture* is run as `service_role`).
--
-- How to run
-- ----------
--   1. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_setup.sql`
--   2. `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_assertions.sql`
--   3. (optional) `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_teardown.sql`
--
-- See `supabase/tests/README.md` for the recommended wrapper.
-- =====================================================================

-- Stable UUIDs — fixed for cross-run determinism.
do $$
declare
    admin_id   constant uuid := 'a1a1a1a1-0000-0000-0000-000000000001';
    tutor_id   constant uuid := 'a1a1a1a1-0000-0000-0000-000000000002';
    student_a  constant uuid := 'a1a1a1a1-0000-0000-0000-000000000003';
    student_b  constant uuid := 'a1a1a1a1-0000-0000-0000-000000000004';
    course_id  constant uuid := 'a1a1a1a1-0000-0000-0000-000000000010';
    module_id  constant uuid := 'a1a1a1a1-0000-0000-0000-000000000011';
    enroll_a   constant uuid := 'a1a1a1a1-0000-0000-0000-000000000020';
    enroll_b   constant uuid := 'a1a1a1a1-0000-0000-0000-000000000021';
    booking_id constant uuid := 'a1a1a1a1-0000-0000-0000-000000000030';
    payment_id constant uuid := 'a1a1a1a1-0000-0000-0000-000000000040';
    meeting_id constant uuid := 'a1a1a1a1-0000-0000-0000-000000000050';
    resource_id constant uuid := 'a1a1a1a1-0000-0000-0000-000000000060';
    grant_id    constant uuid := 'a1a1a1a1-0000-0000-0000-000000000070';
begin
    -- 1. Auth users (the `auth.users` rows are required for the
    --    `auth.uid()` lookup to resolve during policy evaluation).
    insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at
    )
    values
        ('00000000-0000-0000-0000-000000000000', admin_id,  'authenticated', 'authenticated', 'rls_smoke_admin@example.com',  crypt('Admin#1234',  gen_salt('bf')), now(), jsonb_build_object('provider','email','providers', array['email']), jsonb_build_object('full_name','RLS Smoke Admin'),  now(), now()),
        ('00000000-0000-0000-0000-000000000000', tutor_id,  'authenticated', 'authenticated', 'rls_smoke_tutor@example.com',  crypt('Tutor#1234',  gen_salt('bf')), now(), jsonb_build_object('provider','email','providers', array['email']), jsonb_build_object('full_name','RLS Smoke Tutor'),  now(), now()),
        ('00000000-0000-0000-0000-000000000000', student_a, 'authenticated', 'authenticated', 'rls_smoke_student_a@example.com', crypt('StudentA#1234', gen_salt('bf')), now(), jsonb_build_object('provider','email','providers', array['email']), jsonb_build_object('full_name','RLS Smoke Student A'), now(), now()),
        ('00000000-0000-0000-0000-000000000000', student_b, 'authenticated', 'authenticated', 'rls_smoke_student_b@example.com', crypt('StudentB#1234', gen_salt('bf')), now(), jsonb_build_object('provider','email','providers', array['email']), jsonb_build_object('full_name','RLS Smoke Student B'), now(), now())
    on conflict (id) do nothing;

    -- 2. Profiles (the `is_admin()` helper reads `profiles.role`).
    insert into public.profiles (id, email, full_name, role)
    values
        (admin_id,  'rls_smoke_admin@example.com',  'RLS Smoke Admin',     'super_admin'),
        (tutor_id,  'rls_smoke_tutor@example.com',  'RLS Smoke Tutor',     'student'),
        (student_a, 'rls_smoke_student_a@example.com', 'RLS Smoke Student A', 'student'),
        (student_b, 'rls_smoke_student_b@example.com', 'RLS Smoke Student B', 'student')
    on conflict (id) do nothing;

    -- 3. Tutor row (the smoke tutor is mapped to the smoke course).
    insert into public.tutors (id, profile_id, bio, headline, years_experience, hourly_rate, is_published)
    values (
        'a1a1a1a1-0000-0000-0000-0000000000aa', tutor_id,
        'Smoke-test tutor.', 'Smoke', 3, 50.00, true
    )
    on conflict (id) do nothing;

    -- 4. Course (published) + module.
    insert into public.courses (id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published)
    values (
        course_id, 'rls-smoke-course', 'RLS Smoke Course', 'Smoke subtitle', 'Smoke description.',
        'Mathématiques', 'Lycée', 'high_school', 4500, 60, true
    )
    on conflict (id) do nothing;

    insert into public.modules (id, course_id, position, slug, title, duration_min, is_published, is_preview)
    values (
        module_id, course_id, 1, 'rls-smoke-module', 'Smoke Module', 60, true, false
    )
    on conflict (id) do nothing;

    -- 5. course_tutors link (tutor can see this course's enrollments).
    insert into public.course_tutors (course_id, tutor_id, is_primary)
    values (course_id, 'a1a1a1a1-0000-0000-0000-0000000000aa', true)
    on conflict do nothing;

    -- 6. Enrollments (A and B, both active).
    insert into public.enrollments (id, student_id, course_id, status, amount_cents, currency)
    values
        (enroll_a, student_a, course_id, 'active', 4500, 'EUR'),
        (enroll_b, student_b, course_id, 'active', 4500, 'EUR')
    on conflict (id) do nothing;

    -- 7. module_progress rows.
    insert into public.module_progress (enrollment_id, module_id, status)
    values
        (enroll_a, module_id, 'in_progress'),
        (enroll_b, module_id, 'in_progress')
    on conflict (enrollment_id, module_id) do nothing;

    -- 8. module_booking for A.
    insert into public.module_bookings (
        id, enrollment_id, module_id, tutor_id, student_id,
        status, scheduled_start, scheduled_end, timezone
    )
    values (
        booking_id, enroll_a, module_id,
        'a1a1a1a1-0000-0000-0000-0000000000aa', student_a,
        'scheduled', now() + interval '2 days', now() + interval '2 days' + interval '1 hour',
        'Europe/Paris'
    )
    on conflict (id) do nothing;

    -- 9. payment for A.
    insert into public.payments (id, enrollment_id, status, amount_cents, currency)
    values (payment_id, enroll_a, 'pending', 4500, 'EUR')
    on conflict (id) do nothing;

    -- 10. meeting_link for A's booking.
    insert into public.meeting_links (id, module_booking_id, provider, meeting_id, join_url)
    values (meeting_id, booking_id, 'zoom', 'smoke-meeting-001', 'https://zoom.example/smoke')
    on conflict (id) do nothing;

    -- 11. resource + resource_grant (course-level, enrolled-only).
    insert into public.resources (id, course_id, title, visibility, uploaded_by)
    values (resource_id, course_id, 'Smoke Resource', 'enrolled', tutor_id)
    on conflict (id) do nothing;

    insert into public.resource_grants (resource_id, enrollment_id, granted_by)
    values (resource_id, enroll_a, tutor_id)
    on conflict (resource_id, enrollment_id) do nothing;
end $$;
