-- =====================================================================
-- Migration: 20260707000006_rls_policies.sql
-- Description: Row Level Security policies for every public table.
--
-- Rules of thumb:
--   * Students can SELECT/UPDATE only their own rows.
--   * Admins can do anything.
--   * Public catalog data (courses, published tutors) is readable by
--     everyone (including anonymous visitors) for the marketing pages.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable RLS on every table
-- ---------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.tutors      enable row level security;
alter table public.courses     enable row level security;
alter table public.bookings    enable row level security;
alter table public.payments    enable row level security;
alter table public.meeting_links enable row level security;
alter table public.resources   enable row level security;
alter table public.resource_grants enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs  enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
    on public.profiles for select
    using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
    on public.profiles for insert
    with check (auth.uid() = id);

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
    on public.profiles for update
    using (auth.uid() = id or public.is_admin())
    with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_delete_admin_only" on public.profiles;
create policy "profiles_delete_admin_only"
    on public.profiles for delete
    using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- tutors – admin-only access (standalone reference records)
-- ---------------------------------------------------------------------
-- Tutors are NOT users and are not exposed to the public
-- marketing site. They are managed by the admin only. There
-- is no public read, no self-read, no student-readable join.
drop policy if exists "tutors_select_public_published" on public.tutors;
drop policy if exists "tutors_write_admin_only" on public.tutors;
create policy "tutors_admin_all"
    on public.tutors for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- courses – public can read published courses
-- ---------------------------------------------------------------------
drop policy if exists "courses_select_public_published" on public.courses;
create policy "courses_select_public_published"
    on public.courses for select
    using (is_published = true or public.is_admin());

drop policy if exists "courses_write_admin_only" on public.courses;
create policy "courses_write_admin_only"
    on public.courses for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- bookings
-- ---------------------------------------------------------------------
drop policy if exists "bookings_select_own_or_admin" on public.bookings;
create policy "bookings_select_own_or_admin"
    on public.bookings for select
    using (auth.uid() = student_id or public.is_admin());

drop policy if exists "bookings_insert_self" on public.bookings;
create policy "bookings_insert_self"
    on public.bookings for insert
    with check (auth.uid() = student_id or public.is_admin());

drop policy if exists "bookings_update_own_or_admin" on public.bookings;
create policy "bookings_update_own_or_admin"
    on public.bookings for update
    using (auth.uid() = student_id or public.is_admin())
    with check (auth.uid() = student_id or public.is_admin());

drop policy if exists "bookings_delete_admin_only" on public.bookings;
create policy "bookings_delete_admin_only"
    on public.bookings for delete
    using (public.is_admin());

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin"
    on public.payments for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.bookings b
            where b.id = payments.booking_id
              and b.student_id = auth.uid()
        )
    );

drop policy if exists "payments_write_admin_only" on public.payments;
create policy "payments_write_admin_only"
    on public.payments for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- meeting_links
-- ---------------------------------------------------------------------
drop policy if exists "meeting_links_select_own_or_admin" on public.meeting_links;
create policy "meeting_links_select_own_or_admin"
    on public.meeting_links for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.bookings b
            where b.id = meeting_links.booking_id
              and b.student_id = auth.uid()
        )
    );

drop policy if exists "meeting_links_write_admin_only" on public.meeting_links;
create policy "meeting_links_write_admin_only"
    on public.meeting_links for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------
drop policy if exists "resources_select_visible" on public.resources;
create policy "resources_select_visible"
    on public.resources for select
    using (
        visibility = 'public'
        or public.is_admin()
        or (
            visibility = 'enrolled'
            and exists (
                select 1
                from public.resource_grants rg
                join public.bookings b on b.id = rg.booking_id
                where rg.resource_id = resources.id
                  and b.student_id = auth.uid()
            )
        )
        or (
            visibility = 'private'
            and uploaded_by = auth.uid()
        )
    );

drop policy if exists "resources_write_admin_or_tutor" on public.resources;
create policy "resources_write_admin_or_tutor"
    on public.resources for all
    using (public.is_admin() or uploaded_by = auth.uid())
    with check (public.is_admin() or uploaded_by = auth.uid());

drop policy if exists "resource_grants_select_own_or_admin" on public.resource_grants;
create policy "resource_grants_select_own_or_admin"
    on public.resource_grants for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.bookings b
            where b.id = resource_grants.booking_id
              and b.student_id = auth.uid()
        )
    );

drop policy if exists "resource_grants_write_admin_only" on public.resource_grants;
create policy "resource_grants_write_admin_only"
    on public.resource_grants for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
    on public.notifications for select
    using (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
    on public.notifications for update
    using (auth.uid() = user_id or public.is_admin())
    with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "notifications_insert_admin_or_service" on public.notifications;
create policy "notifications_insert_admin_or_service"
    on public.notifications for insert
    with check (public.is_admin() or user_id = auth.uid());

-- ---------------------------------------------------------------------
-- audit_logs – admin read only; writes come from triggers
-- ---------------------------------------------------------------------
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin"
    on public.audit_logs for select
    using (public.is_admin());
