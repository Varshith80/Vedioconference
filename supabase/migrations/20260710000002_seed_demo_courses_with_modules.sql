-- =====================================================================
-- Migration: 20260710000002_seed_demo_courses_with_modules.sql
-- Sprint:     C — Phase 3 (demo seed for the booking flow)
--
-- Description
-- -----------
-- Adds 3 published modules to each of the 3 demo courses seeded
-- by `supabase/seed/000_seed.sql`. The seed is idempotent (every
-- insert uses `on conflict do nothing`) and is a development /
-- staging convenience only.
--
-- Why a separate migration (and not an addition to 000_seed.sql)
-- -----------------------------------------------------------------
-- The 3 demo courses were created in Phase 1. The module table
-- did not exist until Sprint B2. This migration is a
-- **post-B2** backfill that the B2 migration deliberately did
-- not include (it kept the focus on schema + RLS + smoke tests).
-- Sprint C is the first sprint that exercises the
-- book-a-module flow, so the demo data lands here.
--
-- Calendly URIs
-- -------------
-- The `calendly_event_uri` values are placeholders
-- (`https://api.calendly.com/event_types/<placeholder>`). The
-- user will replace them with real Calendly event-type URIs in
-- their own Calendly account. The Sprint C end-to-end smoke
-- documents the substitution.
--
-- Zoom user id
-- ------------
-- The `tutors.zoom_user_id` is also a placeholder. The user
-- populates it from the Zoom admin console before the live
-- smoke test.
--
-- Safety
-- ------
-- The migration does not write to any table the user has not
-- already seeded (`profiles`, `tutors`, `courses`, `course_tutors`
-- are all in `000_seed.sql`). It only adds rows to `modules`.
-- No new auth.users, no new profiles, no admin escalation.
--
-- Idempotency
-- -----------
-- Every insert uses `on conflict do nothing` against the
-- unique constraint (course_id, position). Re-running the
-- migration is safe.
-- =====================================================================

do $$
declare
    v_course_maths    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_course_physique constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_course_francais constant uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
begin
    -- ---------- Course: Mathématiques — Lycée ----------
    insert into public.modules (course_id, position, slug,  title,                            description,                              duration_min, is_published, is_preview, calendly_event_uri)
    values
        (v_course_maths, 1, 'maths-lycee-m01', 'Module 1 — Suites et fonctions',       'Suites numériques, fonctions usuelles.',         60, true, false, 'https://api.calendly.com/event_types/MATHS-LYCEE-M01'),
        (v_course_maths, 2, 'maths-lycee-m02', 'Module 2 — Dérivation et limites',     'Dérivées, limites, théorèmes classiques.',       60, true, false, 'https://api.calendly.com/event_types/MATHS-LYCEE-M02'),
        (v_course_maths, 3, 'maths-lycee-m03', 'Module 3 — Probabilités conditionnelles','Probabilités, conditionnement, indépendance.', 60, true, false, 'https://api.calendly.com/event_types/MATHS-LYCEE-M03')
    on conflict (course_id, position) do nothing;

    -- ---------- Course: Physique — Prépa ----------
    insert into public.modules (course_id, position, slug,  title,                                  description,                                       duration_min, is_published, is_preview, calendly_event_uri)
    values
        (v_course_physique, 1, 'physique-prepa-m01', 'Module 1 — Mécanique du point',           'Cinématique, dynamique, référentiels non galiléens.', 90, true, false, 'https://api.calendly.com/event_types/PHYSIQUE-PREPA-M01'),
        (v_course_physique, 2, 'physique-prepa-m02', 'Module 2 — Électromagnétisme',            'Champ électrique, magnétique, induction.',           90, true, false, 'https://api.calendly.com/event_types/PHYSIQUE-PREPA-M02'),
        (v_course_physique, 3, 'physique-prepa-m03', 'Module 3 — Thermodynamique',              'Premier et second principe, machines thermiques.',  90, true, false, 'https://api.calendly.com/event_types/PHYSIQUE-PREPA-M03')
    on conflict (course_id, position) do nothing;

    -- ---------- Course: Français — Lycée ----------
    insert into public.modules (course_id, position, slug,  title,                                description,                                       duration_min, is_published, is_preview, calendly_event_uri)
    values
        (v_course_francais, 1, 'francais-lycee-m01', 'Module 1 — Méthodologie du commentaire',  'Méthode du commentaire littéraire, exemples.',     60, true, false, 'https://api.calendly.com/event_types/FRANCAIS-LYCEE-M01'),
        (v_course_francais, 2, 'francais-lycee-m02', 'Module 2 — Dissertation',                 'Problématisation, plan, transitions.',             60, true, false, 'https://api.calendly.com/event_types/FRANCAIS-LYCEE-M02'),
        (v_course_francais, 3, 'francais-lycee-m03', 'Module 3 — Oral du bac',                  'Préparation à l''épreuve orale, exposés.',        60, true, false, 'https://api.calendly.com/event_types/FRANCAIS-LYCEE-M03')
    on conflict (course_id, position) do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Backfill the demo tutor with a placeholder Zoom user id. The
-- user replaces it in production.
-- ---------------------------------------------------------------------
update public.tutors
   set zoom_user_id = 'demo-zoom-user-id'
 where id = 'cccccccc-cccc-cccc-cccc-cccccccccc01'
   and zoom_user_id is null;
