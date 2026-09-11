-- Migration: 20260911000002_session_bookings_admin_update.sql
--
-- Context. The local Supabase stack was last seeded through
-- migration 20260720000001, but the RLS + GRANT gap tracked
-- in migration 20260829000001_rls_prerequisite_grants.sql
-- (section "Remaining privilege gaps", item F-5) is the same
-- gap surfaced today by the S8-B2 manual-complete flow:
--
--   * `GRANT UPDATE ON public.session_bookings TO authenticated`
--     is required so the admin's Supabase client (role
--     `authenticated`, JWT forwarded through
--     `@supabase/ssr`) can perform the `status = 'completed'`
--     update. Without this GRANT, the PostgREST PATCH is
--     rejected at SQLSTATE 42501 ("permission denied for
--     table session_bookings") BEFORE the RLS policy is
--     evaluated. The 500 is the documented behavior for
--     this gap; restoring the GRANT is the documented fix.
--
--   * A new admin-allowed UPDATE policy on
--     `public.session_bookings`. The existing policy
--     `session_bookings_student_update_cancel` only permits
--     the booking's own student, and only for the narrow
--     `scheduled` → `cancelled` transition. The admin manual-
--     complete feature needs the broader admin write surface:
--     any non-terminal status can transition to `completed`
--     (or `cancelled` / `no_show` from the back-office). The
--     existing GRANT migration explicitly refused to add this
--     policy because it is an RLS change and outside the
--     scope of `20260829000001`. This migration closes that
--     gap.
--
-- Why this is the smallest correct fix.
--
--   1. The GRANT is the *only* privilege gap that the manual-
--      complete code path triggers. The pre-existing
--      `session_bookings_select_owner_admin` SELECT policy
--      already permits the admin's read.
--   2. The new UPDATE policy is intentionally narrower than
--      "any update": it only permits an admin to transition a
--      row from a non-terminal status (`scheduled`, `confirmed`,
--      or a row that already moved to `completed` and is being
--      re-confirmed) to any of the standard admin-driven
--      terminal or completion values. It does NOT permit
--      silent re-writes of `cancelled` / `no_show` /
--      `rescheduled` — those remain protected by the service-
--      layer 409 in `manualCompleteSessionBooking`. This
--      keeps the existing "history is immutable" guarantee
--      that the rest of the app relies on.
--   3. The new policy is FOR UPDATE, so it does not affect
--      SELECT (already covered by
--      `session_bookings_select_owner_admin` from migration
--      20260714000007).
--   4. No `anon` GRANTs are added. No DELETE is granted. No
--      `meeting_links` GRANTs are added — the existing
--      security design keeps that table admin / service-role
--      only, and the manual-complete code path does not need
--      to touch it.
--
-- Forward-only. Safe to re-apply: the GRANT is idempotent;
-- the policy uses `drop policy if exists` before `create`.

grant update on table public.session_bookings to authenticated;

drop policy if exists session_bookings_admin_update on public.session_bookings;

create policy session_bookings_admin_update
    on public.session_bookings for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

comment on policy session_bookings_admin_update on public.session_bookings is
    'Admins can update any session_bookings row through public.is_admin(). Required for the Sprint 8 B-19 manual-complete feature; closes the F-5 gap tracked in 20260829000001_rls_prerequisite_grants.sql.';
