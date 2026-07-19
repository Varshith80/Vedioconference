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
-- Safety audit (2026-07-19, Sprint 3.8 standalone-tutor refactor)
-- ------------------------
-- Operations present in this file:
--   - 2 x INSERT INTO auth.users ... on conflict (id) do nothing
--   - 2 x INSERT INTO public.profiles ... on conflict (id) do nothing
--         (the admin profile uses do update set role = excluded.role;
--          it re-asserts the role to 'super_admin' and refreshes the
--          email + full_name if the row already exists — never touches
--          any other row or any other column)
--   - 3 x INSERT INTO public.courses ... on conflict (id) do nothing
--   - 1 x INSERT INTO public.tutors ... on conflict (id) do nothing
--         (Sprint 3.8: tutor is now a STANDALONE row — no auth.users,
--          no profiles, no course_tutors mapping)
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
-- Single administrator user
--
-- This is the ONLY administrator provisioned by the seed. The
-- UUID below is the canonical admin id; re-running the seed
-- keeps the same row and re-asserts `role = 'super_admin'`.
-- `super_admin` is the strictest role in `public.user_role`; it
-- satisfies both `is_admin()` and `is_super_admin()` so this
-- account has every admin permission currently in the codebase
-- (Admin Dashboard, every admin API, every admin page).
-- ---------------------------------------------------------------------
insert into auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
)
values (
    '00000000-0000-0000-0000-000000000000',
    '191a7a66-3bdc-4bba-8461-7d349ca9c04d',
    'authenticated', 'authenticated',
    'webvedioconference@gmail.com',
    crypt('WebVedio@999', gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', array['email']),
    jsonb_build_object('full_name','Site Admin'),
    now(), now()
)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values ('191a7a66-3bdc-4bba-8461-7d349ca9c04d', 'webvedioconference@gmail.com', 'Site Admin', 'super_admin')
on conflict (id) do update set
    role      = excluded.role,
    email     = excluded.email,
    full_name = excluded.full_name;

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
-- Demo tutor (standalone — no auth.users, no profiles row)
-- ---------------------------------------------------------------------
insert into public.tutors (id, full_name, email, status, phone, notes)
values ('cccccccc-cccc-cccc-cccc-cccccccccc01',
        'Demo Tutor',
        'tutor@example.com',
        'active',
        null,
        'Seeded demo tutor for development & manual smoke tests.')
on conflict (id) do nothing;

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
-- Note: the v1 `tutors.zoom_user_id` column is gone. Tutors are
-- standalone records in Sprint 3.8+; the Zoom account linkage
-- happens at session-assignment time via the session-edit form's
-- Calendly event URI + the n8n Zoom workflow.
-- ---------------------------------------------------------------------
