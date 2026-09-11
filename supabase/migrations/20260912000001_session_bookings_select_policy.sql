-- Migration: 20260912000001_session_bookings_select_policy.sql
--
-- Context. Sprint 8 close-out recovery. The live remote Supabase
-- project is missing exactly one RLS policy on the v2 path:
-- `session_bookings_select_owner_admin`. Without it, the
-- `authenticated` role sees zero rows for any tutor's
-- `session_bookings`, which breaks the Admin Tutor deletion
-- pre-flight, the bookings dashboard, the manual-complete
-- flow, and any RSC that embeds a join through
-- `session_bookings` (e.g. `meeting_links!meeting_links_session_booking_id_fkey`).
--
-- The policy IS declared in the v2 source-of-truth:
-- `20260714000007_rls_policies_curriculum_v2.sql` section 2.6,
-- lines 131-137. The migration that originally created it
-- either never reached the remote project, or was rolled back
-- during a recovery; either way the declared behaviour and
-- the live behaviour are out of sync. This migration is a
-- restoration of the declared behaviour, not a redesign.
--
-- The companion policy in the same section 2.6,
-- `session_bookings_student_update_cancel` (FOR UPDATE), IS
-- present on the live remote — verified at apply time via
-- `select policyname from pg_policies where schemaname =
-- 'public' and tablename = 'session_bookings'`. It is not
-- touched here. The intended UPDATE surface for the
-- session_bookings table is therefore the existing
-- `session_bookings_student_update_cancel` (student self-
-- cancel) — admin updates remain service-role / direct
-- Postgres, matching the rest of the v2 catalog.
--
-- Policy body. The CREATE POLICY statement below is a
-- verbatim copy of the source-of-truth body from
-- 20260714000007_rls_policies_curriculum_v2.sql section 2.6
-- (lines 132-137), so the catalog and the migration file
-- stay in lock-step. No column names, no helper-function
-- names, no role names differ.
--
-- Why this is the smallest correct fix.
--
--   1. We re-create exactly the policy the v2 source-of-truth
--      already declares. We do not add a new predicate, do
--      not widen the visibility, and do not add an admin-only
--      write policy (the v2 source-of-truth does not declare
--      one and the live remote does not need one).
--   2. We do NOT add a GRANT. The `authenticated` role
--      already holds `SELECT` on `public.session_bookings`
--      on the live remote (verified via
--      `information_schema.role_table_grants` — the ACL is
--      wide-open on remote; see Sprint 8 close-out recovery
--      analysis). RLS only runs after the GRANT check, so
--      restoring the policy is sufficient to unblock reads.
--   3. We do NOT add a policy for `anon`. RLS denies
--      anonymous reads by default; the existing
--      `session_bookings_student_update_cancel` (FOR UPDATE)
--      does not match an anonymous `auth.uid()` either.
--   4. We do NOT touch the `session_bookings` table itself,
--      its columns, its grants, its triggers, or any other
--      RLS policy. The recovery analysis (Task #545) and the
--      live `pg_trigger` / `pg_proc` inspection confirmed
--      that every other expected policy, trigger, and helper
--      function is present and correctly wired on remote.
--
-- Idempotency. `drop policy if exists` + `create policy` is
-- safe to re-apply: the policy body is identical, and the
-- `if exists` guard makes the drop a no-op when the policy
-- is already present.
--
-- Forward-only. No data is modified. No existing policy is
-- dropped in steady state. No `auth.users` is touched. No
-- service-role key is involved. No remote DDL outside this
-- file.

drop policy if exists session_bookings_select_owner_admin on public.session_bookings;

create policy session_bookings_select_owner_admin
    on public.session_bookings for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

comment on policy session_bookings_select_owner_admin on public.session_bookings is
    'Students can SELECT their own session_bookings (student_id = auth.uid()); admins can SELECT any row through public.is_admin(). Restored by 20260912000001 to match the policy declared in 20260714000007_rls_policies_curriculum_v2.sql section 2.6. The companion session_bookings_student_update_cancel FOR UPDATE policy (also section 2.6) is already present on the live remote and is unchanged here.';
