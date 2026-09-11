-- Migration: 20260911000001_restore_session_bookings_select_policy.sql
--
-- Context. The local Supabase stack was last seeded through
-- migration 20260720000001. The migration that creates the
-- `session_bookings_select_owner_admin` SELECT policy
-- (20260714000007_rls_policies_curriculum_v2.sql, section 2.6)
-- is declared in the migration set but is not present in the
-- live local database. Only the `session_bookings_student_update_cancel`
-- WRITE policy exists on `public.session_bookings`, so the
-- admin's Supabase client (authenticated role) returns 0 rows
-- for any tutor's `session_bookings`. That breaks the
-- Admin Tutor deletion pre-flight, which broadens the
-- pre-flight read to all `session_bookings` rows; without the
-- SELECT policy, the pre-flight sees no blockers and the actual
-- DELETE hits the 23503 FK error and surfaces a generic
-- fallback message instead of the structured blocker list.
--
-- Fix. Re-create the SELECT policy exactly as declared in the
-- original migration 20260714000007_rls_policies_curriculum_v2.sql,
-- section 2.6. Forward-only. The policy already exists in
-- version control; this migration is a restoration of the
-- declared behavior, not a redesign.
--
-- Scope. One table, one policy. No other RLS policies are
-- modified. No GRANT changes. No FK changes. No ON DELETE
-- behavior changes. No remote Supabase changes (local only).
--
-- The policy expression is intentionally a verbatim copy of the
-- source-of-truth migration so the catalog and the migration
-- file stay in lock-step.

drop policy if exists session_bookings_select_owner_admin on public.session_bookings;

create policy session_bookings_select_owner_admin
    on public.session_bookings for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

comment on policy session_bookings_select_owner_admin on public.session_bookings is
    'Students can SELECT their own session_bookings (student_id = auth.uid()); admins can SELECT any row through public.is_admin(). Restored by 20260911000001 to match the policy declared in 20260714000007_rls_policies_curriculum_v2.sql section 2.6.';
