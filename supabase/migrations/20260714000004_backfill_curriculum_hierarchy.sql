-- =====================================================================
-- Migration: 20260714000004_backfill_curriculum_hierarchy.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Idempotent backfill that wires the existing demo data into the
-- new hierarchy. This migration is the bridge between the v1
-- schema and the new curriculum; it is the only migration that
-- reads from the v1 tables (modules, courses).
--
-- The 5 known programs and 2 High School grades are seeded by
-- 20260714000000_programs_grades.sql; this migration only:
--
--   1. Updates the 3 demo `courses` to set `program_id` and
--      `grade_id`:
--        - Mathématiques — Lycée → high_school / grade_11
--        - Français    — Lycée → high_school / grade_11
--        - Physique    — Prépa → preparatory / NULL
--
--   2. Inserts one `chapters` row per existing `modules` row,
--      copying `position`, `slug`, `title`, `description`,
--      `duration_min`, `is_published`, `is_preview`. The
--      `calendly_event_uri` from the v1 `modules` table moves
--      to the new `sessions` row.
--
--   3. Inserts one `sessions` row per existing `modules` row,
--      with `duration_min = modules.duration_min`. NO PRICE is
--      inserted — `sessions.price_cents` is set to NULL. The
--      session is published; the absence of a price is the only
--      blocker for purchase, surfaced at the Stripe Checkout
--      step (422 session_price_missing).
--
-- This is the user-approved Q5 answer. The 3 demo courses are
-- migrated; new programs / grades from the Excel land in Sprint 5
-- via the Excel import (out of scope for this sprint).
--
-- Idempotency
-- -----------
-- Every UPDATE / INSERT is guarded with `where not exists` or
-- `on conflict do nothing`. The migration can be re-applied
-- safely; a second run is a no-op.
-- =====================================================================

do $$
declare
    -- The 3 demo course UUIDs (seeded by 000_seed.sql).
    v_course_maths    constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    v_course_physique constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    v_course_francais constant uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    v_program_hs  uuid;
    v_program_pre uuid;
    v_grade_11    uuid;
    v_grade_12    uuid;
    v_chapter_id  uuid;
    v_module      record;
begin
    -- -------------------------------------------------------------
    -- 0. Resolve the program / grade ids
    -- -------------------------------------------------------------
    select id into v_program_hs  from public.programs where slug = 'high_school';
    select id into v_program_pre from public.programs where slug = 'preparatory';
    select id into v_grade_11    from public.grades   where slug = 'grade_11';
    select id into v_grade_12    from public.grades   where slug = 'grade_12';

    if v_program_hs is null or v_program_pre is null then
        raise exception 'backfill: programs missing — was 20260714000000_programs_grades.sql applied?';
    end if;

    -- -------------------------------------------------------------
    -- 1. Update the 3 demo courses (idempotent — only if program_id
    --    is currently NULL).
    -- -------------------------------------------------------------
    update public.courses
       set program_id = v_program_hs,
           grade_id   = v_grade_11
     where id = v_course_maths
       and program_id is null;

    update public.courses
       set program_id = v_program_hs,
           grade_id   = v_grade_11
     where id = v_course_francais
       and program_id is null;

    update public.courses
       set program_id = v_program_pre,
           grade_id   = null
     where id = v_course_physique
       and program_id is null;

    -- -------------------------------------------------------------
    -- 2 + 3. For each v1 `modules` row of the 3 demo courses, create
    --    a matching `chapters` row and a matching `sessions` row.
    --    The 1:1 split is true for the existing demo data; Sprint 5
    --    handles the real Excel data where a chapter has N sessions.
    -- -------------------------------------------------------------
    for v_module in
        select id, course_id, position, slug, title, description,
               duration_min, is_published, is_preview, calendly_event_uri
        from public.modules
        where course_id in (v_course_maths, v_course_physique, v_course_francais)
        order by course_id, position
    loop
        -- 2.1  Create the chapter (skip if already exists).
        select id into v_chapter_id
        from public.chapters
        where course_id = v_module.course_id
          and position  = v_module.position;

        if v_chapter_id is null then
            insert into public.chapters (
                course_id, position, slug, title, description,
                default_duration_min, is_published, sort_order
            )
            values (
                v_module.course_id,
                v_module.position,
                v_module.slug,
                v_module.title,
                v_module.description,
                v_module.duration_min,
                v_module.is_published,
                v_module.position
            )
            returning id into v_chapter_id;
        end if;

        -- 2.2  Create the session (skip if already exists).
        --      price_cents is NULL by design (Sprint 5 sets it).
        if not exists (
            select 1
            from public.sessions
            where chapter_id = v_chapter_id
              and position   = v_module.position
        ) then
            insert into public.sessions (
                chapter_id, position, slug, title, description,
                duration_min, price_cents, currency,
                is_published, is_preview,
                calendly_event_uri, sort_order
            )
            values (
                v_chapter_id,
                v_module.position,
                v_module.slug,
                v_module.title,
                v_module.description,
                v_module.duration_min,
                null,                  -- NO price (Sprint 5 sets it)
                'EUR',
                v_module.is_published, -- published; price is the only blocker
                v_module.is_preview,
                v_module.calendly_event_uri,
                v_module.position
            );
        end if;
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- Done. This migration is idempotent. Re-running is a no-op.
-- ---------------------------------------------------------------------
