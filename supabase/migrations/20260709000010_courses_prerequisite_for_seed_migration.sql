-- =====================================================================
-- Migration: 20260709000010_courses_prerequisite_for_seed_migration.sql
-- Sprint:     C — Phase 3 (dependency fix, applied at validation time)
--
-- Filename ordering
-- -----------------
-- This file is timestamped `20260709000010` so that the Supabase
-- CLI applies it AFTER `20260709000001_modules_enrollments.sql`
-- (which creates the `modules` and `module_bookings` tables with
-- their FK on `public.courses(id)`) and BEFORE
-- `20260710000000_enrollments_refund_trigger.sql` /
-- `20260710000001_module_unlock.sql` /
-- `20260710000002_seed_demo_courses_with_modules.sql` (which
-- insert rows into those tables).
--
-- Description
-- -----------
-- Inserts the 3 demo `public.courses` rows that the Sprint C
-- migration `20260710000002_seed_demo_courses_with_modules.sql`
-- references via its foreign key on
-- `modules.course_id`. Without these rows, the Sprint C
-- migration fails with:
--
--   ERROR: insert or update on table "modules" violates foreign
--   key constraint "modules_course_id_fkey" (SQLSTATE 23503)
--   Detail: Key (course_id)=(aaaaaaaa-…) is not present in
--   table "courses".
--
-- The 3 courses were originally created by
-- `supabase/seed/000_seed.sql` (the development seed, which the
-- Supabase CLI v2.x runs AFTER all migrations complete). That
-- ordering worked on the remote Supabase project because the
-- seed had been run there at some point (manually via the
-- Supabase Studio SQL Editor), but it does NOT work for a
-- clean `supabase start` because the seed runs post-migration.
--
-- This migration makes the chain order-independent by inserting
-- the prerequisite courses into the migration chain, with the
-- exact deterministic UUIDs the Sprint C migration expects.
-- It is idempotent (every insert is `on conflict do nothing`),
-- it touches only `public.courses`, and it does NOT duplicate
-- any of the other seed data (no auth.users, no profiles, no
-- tutors, no course_tutors, no enrollments, no bookings, no
-- resources, no notifications, no payments).
--
-- Why this is forward-only
-- ------------------------
-- This migration adds 3 rows. It does not modify any existing
-- row, does not drop or rename any table, and does not
-- change any column. The natural key is the deterministic
-- UUID; `on conflict (id) do nothing` makes a re-run a
-- no-op. The dev seed `supabase/seed/000_seed.sql` is left
-- untouched and continues to provide the same UUIDs as a
-- dev-only convenience.
--
-- What is intentionally NOT in this migration
-- -------------------------------------------
-- - The 5 auth.users INSERTs (admin, student, tutor, …) — those
--   are dev-only, not required for any migration to succeed.
-- - The 5 profiles INSERTs — same reason.
-- - The 1 tutor INSERT (UUID `cccccccc-cccc-cccc-cccc-cccccccccc01`)
--   — not required by the migration chain. (Sprint C's migration
--   only inserts into `modules` and updates `tutors.zoom_user_id`.)
--   The Sprint C migration's `update public.tutors set
--   zoom_user_id = … where id = 'cccccccc-…01'` step would no-op
--   on a clean database (the row does not exist), which is
--   safe — the `where id = … and zoom_user_id is null` clause
--   prevents any update to a non-existent row.
-- - The 1 course_tutors INSERT — not required.
--
-- The 3 courses in this migration have the exact same UUIDs,
-- slug, title, subtitle, description, subject, level,
-- level_group, price_cents, and duration_min as the dev seed
-- (`supabase/seed/000_seed.sql` lines 56–61). If the dev seed
-- ever diverges from this migration, the `on conflict do
-- nothing` keeps both safe to run independently.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Demo course: Mathématiques — Lycée
-- ---------------------------------------------------------------------
insert into public.courses (
    id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published
) values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'maths-lycee',
    'Mathématiques – Lycée',
    'Cours particuliers de la Seconde à la Terminale',
    'Algèbre, analyse, probabilités.',
    'Mathématiques',
    'Lycée',
    'high_school',
    4500,
    60,
    true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Demo course: Physique — Prépa
-- ---------------------------------------------------------------------
insert into public.courses (
    id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published
) values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'physique-prepa',
    'Physique – Prépa',
    'Mécanique, électromagnétisme, thermodynamique.',
    'Préparation intensive.',
    'Physique',
    'Prépa MPSI',
    'preparatory',
    6000,
    90,
    true
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Demo course: Français — Lycée
-- ---------------------------------------------------------------------
insert into public.courses (
    id, slug, title, subtitle, description, subject, level, level_group, price_cents, duration_min, is_published
) values (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'francais-lycee',
    'Français – Lycée',
    'Méthodologie, dissertation, commentaire.',
    'Aide au bac de français.',
    'Français',
    'Lycée',
    'high_school',
    4000,
    60,
    true
)
on conflict (id) do nothing;
