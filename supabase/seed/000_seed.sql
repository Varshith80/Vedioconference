-- =====================================================================
-- Seed file: 000_seed.sql
-- Description: Idempotent seed data for development / staging.
--              DO NOT run in production.
-- =====================================================================

-- Demo admin (idempotent)
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

-- Demo tutor
insert into public.profiles (id, email, full_name, role)
values ('33333333-3333-3333-3333-333333333333', 'tutor@example.com', 'Demo Tutor', 'student')
on conflict (id) do nothing;

insert into public.tutors (id, profile_id, bio, headline, years_experience, hourly_rate, is_published)
values ('cccccccc-cccc-cccc-cccc-cccccccccc01', '33333333-3333-3333-3333-333333333333',
        'Professeur certifié, 8 ans d''expérience.', 'Agrégé de Mathématiques', 8, 60.00, true)
on conflict (id) do nothing;

-- Course / tutor mapping
insert into public.course_tutors (course_id, tutor_id, is_primary)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccc01', true)
on conflict do nothing;
