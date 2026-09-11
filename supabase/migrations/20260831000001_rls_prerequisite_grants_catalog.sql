-- Sprint 8 — RLS prerequisite GRANTs for the catalog and finance tables
-- that the authenticated role actually queries from admin/student pages.
--
-- Context:
--   The catalog/finance tables (programs, grades, courses, tutors, payments)
--   already have RLS policies that scope rows to the caller's role
--   (admin / super_admin via is_admin() / is_super_admin(), or the owning
--   student). However, in PostgreSQL, GRANT is checked BEFORE RLS, so
--   without an explicit grant the authenticated role receives 42501 even
--   when an RLS policy would have allowed the row.
--
-- This migration grants the minimum required privilege — SELECT only —
-- to authenticated for the catalog and finance tables, so that the
-- existing RLS policies become effective. No write privilege is added:
-- writes still go through the service-role client in route handlers
-- and n8n webhooks, which remains the locked architecture.
--
-- Pages that needed this fix (verified against the dev log):
--   - /admin (overview)               -> public.programs, public.payments, public.courses
--   - /admin/programs                 -> public.programs
--   - /admin/tutors                   -> public.tutors
--   - /admin/grades                   -> public.programs, public.grades
--   - /admin/courses                  -> public.programs, public.grades, public.courses
--   - /admin/chapters                 -> public.courses (label only)
--   - /admin/sessions, /admin/sessions/[id] -> public.tutors (label only)
--   - /admin/bookings, /admin/bookings/[id] -> public.programs (label only)
--   - /admin/payments                 -> public.payments
--   - /dashboard (student)            -> public.programs (label only)
--   - /dashboard/bookings             -> public.programs (label only)
--
-- This migration is GRANT-only and idempotent: re-running it is a no-op
-- because the existing privileges are preserved.

begin;

-- Catalog -----------------------------------------------------------------
grant select on table public.programs to authenticated;
grant select on table public.grades   to authenticated;
grant select on table public.courses  to authenticated;
grant select on table public.tutors   to authenticated;

-- Finance -----------------------------------------------------------------
grant select on table public.payments to authenticated;

commit;
