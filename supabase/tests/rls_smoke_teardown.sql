-- =====================================================================
-- RLS smoke-test teardown — Sprint B2
-- =====================================================================
--
-- Reverses the fixture created by `rls_smoke_setup.sql`. Safe to
-- run against a clean database (the deletes are no-ops when the
-- rows don't exist).
--
-- This is the ONLY place that deletes RLS-smoke rows. The setup
-- script is idempotent and additive.
-- =====================================================================

begin;

-- 1. Drop the schema holding our impersonation helpers.
drop schema if exists rls_smoke cascade;

-- 2. Delete fixture rows in FK-respecting order.
delete from public.resource_grants
    where resource_id = 'a1a1a1a1-0000-0000-0000-000000000060';

delete from public.resources
    where id = 'a1a1a1a1-0000-0000-0000-000000000060';

delete from public.meeting_links
    where id = 'a1a1a1a1-0000-0000-0000-000000000050';

delete from public.payments
    where id = 'a1a1a1a1-0000-0000-0000-000000000040';

delete from public.module_bookings
    where id = 'a1a1a1a1-0000-0000-0000-000000000030';

delete from public.module_progress
    where enrollment_id in (
        'a1a1a1a1-0000-0000-0000-000000000020',
        'a1a1a1a1-0000-0000-0000-000000000021'
    );

delete from public.enrollments
    where id in (
        'a1a1a1a1-0000-0000-0000-000000000020',
        'a1a1a1a1-0000-0000-0000-000000000021'
    );

delete from public.course_tutors
    where course_id = 'a1a1a1a1-0000-0000-0000-000000000010';

delete from public.modules
    where course_id = 'a1a1a1a1-0000-0000-0000-000000000010';

delete from public.courses
    where id = 'a1a1a1a1-0000-0000-0000-000000000010';

delete from public.tutors
    where id = 'a1a1a1a1-0000-0000-0000-0000000000aa';

delete from public.profiles
    where id in (
        'a1a1a1a1-0000-0000-0000-000000000001',
        'a1a1a1a1-0000-0000-0000-000000000002',
        'a1a1a1a1-0000-0000-0000-000000000003',
        'a1a1a1a1-0000-0000-0000-000000000004'
    );

delete from auth.users
    where id in (
        'a1a1a1a1-0000-0000-0000-000000000001',
        'a1a1a1a1-0000-0000-0000-000000000002',
        'a1a1a1a1-0000-0000-0000-000000000003',
        'a1a1a1a1-0000-0000-0000-000000000004'
    );

commit;
