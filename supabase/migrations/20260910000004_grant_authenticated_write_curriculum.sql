-- supabase/migrations/20260910000004_grant_authenticated_write_curriculum.sql
--
-- Purpose
-- -------
-- Grant the minimum base PostgreSQL privileges on the five curriculum
-- tables (programs, grades, courses, chapters, sessions) to the
-- authenticated role so that admin CREATE / UPDATE / DELETE requests
-- from PostgREST can reach RLS evaluation.
--
-- The manual CRUD UI in /admin/{programs,grades,courses,chapters,sessions}
-- has been returning HTTP 500 with the message
-- "permission denied for table <name>" (PostgreSQL 42501). The root
-- cause is the GRANT layer, not the RLS layer: the RLS policy stack
-- (programs_admin_write, grades_admin_write, courses_admin_write,
-- chapters_admin_write, sessions_admin_write) already restricts
-- INSERT / UPDATE / DELETE to admins via `using (public.is_admin() or
-- public.is_super_admin())` with the same `with check` — but the
-- `authenticated` role currently has only SELECT (no INSERT, UPDATE,
-- DELETE) on these tables, so the request never reaches RLS at all
-- and is rejected by the GRANT check with 42501.
--
-- This follows the same pattern that migration
-- 20260901000001_grant_tutors_write_to_authenticated.sql used to
-- unblock the tutor CRUD endpoints.
--
-- Security model (must remain intact)
-- -----------------------------------
-- 1. This migration grants base table privileges only. It does NOT
--    touch Row-Level Security. RLS stays enabled
--    (relrowsecurity = true) on every one of the five tables and
--    the existing `*_admin_write` policy stack remains the sole
--    authority for whether a given authenticated user may mutate a
--    row.
-- 2. Non-admin authenticated users will still be denied INSERT /
--    UPDATE / DELETE because no policy exposes a USING or WITH
--    CHECK expression that allows them. The GRANT alone is not
--    sufficient.
-- 3. The service-role key is not used as a workaround by this
--    migration and must not be used as a workaround by the
--    application code path. All mutations still flow through the
--    user-context Supabase client in app/api/**/route.ts.
--
-- Scope
-- -----
-- Touches: privilege grants on exactly five tables
-- (public.programs, public.grades, public.courses, public.chapters,
-- public.sessions) for exactly one role (authenticated).
-- Does NOT touch: schema, columns, indexes, triggers, RLS enablement,
-- RLS policies, data, or any other table.
--
-- Idempotency
-- -----------
-- GRANT statements in PostgreSQL are idempotent: re-running this
-- migration is a no-op.
--
-- Forward-only
-- ------------
-- New file. Does not modify any previously applied migration.

begin;

grant insert, update, delete on table public.programs to authenticated;
grant insert, update, delete on table public.grades   to authenticated;
grant insert, update, delete on table public.courses  to authenticated;
grant insert, update, delete on table public.chapters to authenticated;
grant insert, update, delete on table public.sessions to authenticated;

commit;
