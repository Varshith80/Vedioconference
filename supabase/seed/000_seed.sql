-- =====================================================================
-- Seed file: 000_seed.sql
-- Description: Idempotent seed data for development / staging.
--              DO NOT run in production.
-- =====================================================================

-- Single administrator (idempotent).
--
-- This is the ONLY administrator provisioned by the seed. The
-- UUID below is the canonical admin id; re-running the seed
-- keeps the same row and re-asserts `role = 'super_admin'`.
-- `super_admin` is the strictest role in `public.user_role`; it
-- satisfies both `is_admin()` and `is_super_admin()` so this
-- account has every admin permission currently in the codebase
-- (Admin Dashboard, every admin API, every admin page).
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

-- Demo student
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

-- Demo courses
insert into public.courses (id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published)
values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'maths-lycee',     'Mathématiques – Lycée',     'Cours particuliers de la Seconde à la Terminale', 'Algèbre, analyse, probabilités.', 'Mathématiques', 'Lycée',     'high_school',   4500, 60, true),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'physique-prepa',  'Physique – Prépa',          'Mécanique, électromagnétisme, thermodynamique.',    'Préparation intensive.',         'Physique',      'Prépa MPSI', 'preparatory', 6000, 90, true),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'francais-lycee',  'Français – Lycée',          'Méthodologie, dissertation, commentaire.',          'Aide au bac de français.',       'Français',      'Lycée',     'high_school',   4000, 60, true)
on conflict (id) do nothing;

-- Demo tutor (standalone — no auth.users, no profiles row)
insert into public.tutors (id, full_name, email, status, phone, notes)
values ('cccccccc-cccc-cccc-cccc-cccccccccc01',
        'Demo Tutor',
        'tutor@example.com',
        'active',
        null,
        'Seeded demo tutor for development & manual smoke tests.')
on conflict (id) do nothing;
