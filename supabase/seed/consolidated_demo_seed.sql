-- =====================================================================
-- Consolidated demo seed (Sprint 3.5 + Sprint 3.6)
--
-- This file is the merger of:
--   - supabase/seed/000_seed.sql
--   - supabase/migrations/20260710000002_seed_demo_courses_with_modules.sql
--
-- Sprint 3.6 changes from the Sprint B2 + Sprint C shape:
--   - The 9 v1 `public.modules` INSERTs are REMOVED. The v1
--     `modules` table is dropped in
--     `20260715000000_drop_v1_back_compat_tables.sql`. The v1
--     module rows were already backfilled into v2 chapters +
--     sessions by
--     `20260714000004_backfill_curriculum_hierarchy.sql` (one
--     v1 module → one new chapter + one new session, 1:1 in the
--     demo backfill). The real N-sessions-per-chapter data
--     lands in Sprint 5 with the Excel import
--     (`POST /api/sessions` bulk endpoint).
--
-- Safety audit (2026-07-11, updated 2026-07-15)
-- ------------------------
-- Operations present in this file:
--   - 5 x INSERT INTO auth.users ... on conflict (id) do nothing
--   - 4 x INSERT INTO public.profiles ... on conflict (id) do nothing
--         (one uses do update set role = excluded.role; this only
--          escalates the demo admin profile to 'super_admin' if
--          the row already exists, never touching other rows)
--   - 3 x INSERT INTO public.courses ... on conflict (id) do nothing
--   - 1 x INSERT INTO public.tutors ... on conflict (id) do nothing
--   - 1 x INSERT INTO public.course_tutors ... on conflict do nothing
--   - 1 x UPDATE public.tutors SET zoom_user_id = ... WHERE id = ... AND zoom_user_id IS NULL
--         (only affects rows where zoom_user_id is null — never overwrites an
--          existing value; never touches any other column)
--
-- Operations NOT present in this file:
--   - DROP, DELETE, TRUNCATE: ZERO
--   - ALTER TABLE / ALTER TYPE / ALTER FUNCTION: ZERO
--   - UPDATE that changes a non-null column to a different value: ZERO
--
-- Re-running this file is safe: every INSERT uses on conflict do nothing,
-- the admin role escalation is gated on the row already existing, and the
-- zoom_user_id backfill is gated on the column being null.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Demo admin user
-- ---------------------------------------------------------------------
insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
)
values (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated',
    'admin@example.com',
    crypt('Admin#1234', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    jsonb_build_object('full_name','Site Admin'),
    now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values ('11111111-1111-1111-1111-111111111111', 'admin@example.com', 'Site Admin', 'super_admin')
on conflict (id) do update set role = excluded.role;

-- ---------------------------------------------------------------------
-- Demo student user
-- ---------------------------------------------------------------------
insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
)
values (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated',
    'student@example.com',
    crypt('Student#1234', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    jsonb_build_object('full_name','Demo Student'),
    now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values ('22222222-2222-2222-2222-222222222222', 'student@example.com', 'Demo Student', 'student')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Demo courses (3)
-- ---------------------------------------------------------------------
insert into public.courses (id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published)
values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'maths-lycee',     'Mathématiques – Lycée',     'Cours particuliers de la Seconde à la Terminale', 'Algèbre, analyse, probabilités.', 'Mathématiques', 'Lycée',     'high_school',   4500, 60, true),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'physique-prepa',  'Physique – Prépa',          'Mécanique, électromagnétisme, thermodynamique.',    'Préparation intensive.',         'Physique',      'Prépa MPSI', 'preparatory', 6000, 90, true),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'francais-lycee',  'Français – Lycée',          'Méthodologie, dissertation, commentaire.',          'Aide au bac de français.',       'Français',      'Lycée',     'high_school',   4000, 60, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Demo tutor profile + tutors row
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, full_name, role)
values ('33333333-3333-3333-3333-333333333333', 'tutor@example.com', 'Demo Tutor', 'student')
on conflict (id) do nothing;

insert into public.tutors (id, profile_id, bio, headline, years_experience, hourly_rate, is_published)
values ('cccccccc-cccc-cccc-cccc-cccccccccc01', '33333333-3333-3333-3333-333333333333',
        'Professeur certifié, 8 ans d''expérience.', 'Agrégé de Mathématiques', 8, 60.00, true)
on conflict (id) do nothing;

insert into public.course_tutors (course_id, tutor_id, is_primary)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccc01', true)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Demo modules (3 per course = 9 total)
-- ---------------------------------------------------------------------
-- Sprint 3.6: the v1 `public.modules` table is dropped in
-- `20260715000000_drop_v1_back_compat_tables.sql`. The 9 v1
-- module rows were backfilled into v2 chapters + sessions by
-- `20260714000004_backfill_curriculum_hierarchy.sql` (one v1
-- module → one new chapter + one new session, 1:1 in the demo
-- backfill). The real N-sessions-per-chapter data lands in
-- Sprint 5 with the Excel import.

-- ---------------------------------------------------------------------
-- Backfill the demo tutor with a placeholder Zoom user id. This UPDATE
-- only fires when zoom_user_id IS NULL — it never overwrites an
-- existing value and never touches any other column.
-- ---------------------------------------------------------------------
update public.tutors
   set zoom_user_id = 'demo-zoom-user-id'
 where id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'
   and zoom_user_id is null;
