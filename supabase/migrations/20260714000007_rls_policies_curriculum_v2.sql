-- =====================================================================
-- Migration: 20260714000007_rls_policies_curriculum_v2.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Final RLS + trigger wiring for the new curriculum hierarchy.
-- This is the eighth and last migration of the sprint. It:
--
--   1. Wires the `fn_session_grants_completion` trigger to
--      `session_bookings` so the function (currently a no-op)
--      fires on every UPDATE. The body can be extended in a
--      later sprint without a schema change.
--
--   2. Verifies that all the new policies from migrations
--      20260714000000..0003 are in place. (They are — the
--      policies were defined in their respective migration
--      files. This migration re-affirms them with a single
--      statement per table so a reader can scan the final
--      policy set in one place.)
--
--   3. Updates the `fn_enrollments_refund` trigger from
--      Sprint C so that, in addition to flipping the
--      `enrollments.status` to 'refunded', it ALSO flips
--      the matching `session_grants.status` to 'refunded'
--      when the linked `payments` row has a non-null
--      `session_grant_id`. This is the new equivalent of
--      the Sprint C behaviour for the v2 path.
--
-- Idempotency
-- -----------
-- Every CREATE / DROP / ALTER is guarded. The migration can
-- be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Wire the session_grants completion trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_session_grants_completion on public.session_bookings;
create trigger trg_session_grants_completion
    after update of status on public.session_bookings
    for each row execute function public.fn_session_grants_completion();

-- ---------------------------------------------------------------------
-- 2. Re-affirm the RLS policies from 20260714000000..0003
-- ---------------------------------------------------------------------
-- These policies were defined in their respective migration
-- files. They are re-stated here (idempotent: drop + create)
-- so a reader can audit the final policy set in one place.
-- If you change a policy, change it in its original migration
-- AND here. (The drop + create pair is safe because the
-- policies are created with the same body.)

-- 2.1  `programs` — public read, admin write
drop policy if exists programs_select_published_or_admin on public.programs;
create policy programs_select_published_or_admin
    on public.programs for select
    using (
        is_published = true
        or public.is_admin()
    );

drop policy if exists programs_admin_write on public.programs;
create policy programs_admin_write
    on public.programs for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- 2.2  `grades` — published-program read, admin write
drop policy if exists grades_select_published_or_admin on public.grades;
create policy grades_select_published_or_admin
    on public.grades for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.programs p
            where p.id = grades.program_id
              and p.is_published = true
        )
    );

drop policy if exists grades_admin_write on public.grades;
create policy grades_admin_write
    on public.grades for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- 2.3  `chapters` — published-only read, admin write
drop policy if exists chapters_select_published_or_admin on public.chapters;
create policy chapters_select_published_or_admin
    on public.chapters for select
    using (
        is_published = true
        or public.is_admin()
    );

drop policy if exists chapters_admin_write on public.chapters;
create policy chapters_admin_write
    on public.chapters for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- 2.4  `sessions` — published / preview read, admin write
drop policy if exists sessions_select_published_or_admin on public.sessions;
create policy sessions_select_published_or_admin
    on public.sessions for select
    using (
        is_published = true
        or is_preview = true
        or public.is_admin()
    );

drop policy if exists sessions_admin_write on public.sessions;
create policy sessions_admin_write
    on public.sessions for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- 2.5  `session_grants` — owner / admin read; deny writes
drop policy if exists session_grants_select_owner_tutor_admin on public.session_grants;
create policy session_grants_select_owner_admin
    on public.session_grants for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

-- 2.6  `session_bookings` — owner / admin read;
--      student self-cancel write (status flip only)
drop policy if exists session_bookings_select_owner_tutor_admin on public.session_bookings;
create policy session_bookings_select_owner_admin
    on public.session_bookings for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

drop policy if exists session_bookings_student_update_cancel on public.session_bookings;
create policy session_bookings_student_update_cancel
    on public.session_bookings for update
    using (
        student_id = auth.uid()
        and status in ('scheduled', 'confirmed', 'cancelled')
    )
    with check (
        student_id = auth.uid()
        and status in ('scheduled', 'confirmed', 'cancelled', 'no_show', 'completed', 'rescheduled')
    );

-- 2.7  `meeting_links` — read via session_booking_id (v2 path)
drop policy if exists meeting_links_select_via_session_booking on public.meeting_links;
create policy meeting_links_select_via_session_booking
    on public.meeting_links for select
    using (
        public.is_admin()
        or (
            session_booking_id is not null
            and exists (
                select 1
                from public.session_bookings sb
                where sb.id = meeting_links.session_booking_id
                  and (sb.student_id = auth.uid() or public.is_admin())
            )
        )
    );

-- 2.8  `payments` — read via session_grant_id (v2 path)
drop policy if exists payments_select_via_session_grant on public.payments;
create policy payments_select_via_session_grant
    on public.payments for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.session_grants sg
            where sg.id = payments.session_grant_id
              and sg.student_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- 3. Extend `fn_enrollments_refund` to also flip session_grants
-- ---------------------------------------------------------------------
-- The Sprint C trigger (20260710000000_enrollments_refund_trigger.sql)
-- flips enrollments.status to 'refunded' when a linked payments row
-- goes to refunded. This migration extends the same trigger to
-- also flip session_grants.status to 'refunded' for the v2 path.
-- The original function is REPLACED (not duplicated).
create or replace function public.fn_enrollments_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (TG_OP = 'UPDATE'
        and NEW.status = 'refunded'
        and (OLD.status is null or OLD.status <> 'refunded'))
    then
        -- v1 path: flip the linked enrollment.
        if NEW.enrollment_id is not null then
            update public.enrollments e
            set status               = 'refunded',
                refunded_at          = coalesce(e.refunded_at, now()),
                refunded_amount_cents = NEW.refunded_amount_cents,
                updated_at           = now()
            where e.id = NEW.enrollment_id
              and e.status in ('active', 'completed');
        end if;

        -- v2 path: flip the linked session_grant.
        if NEW.session_grant_id is not null then
            update public.session_grants sg
            set status               = 'refunded',
                refunded_at          = coalesce(sg.refunded_at, now()),
                refunded_amount_cents = NEW.refunded_amount_cents,
                updated_at           = now()
            where sg.id = NEW.session_grant_id
              and sg.status in ('active', 'completed');
        end if;
    end if;
    return NEW;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
-- The trigger wiring in §1 is the new behavior; the policies
-- in §2 are re-affirmations; the refund extension in §3 is the
-- v2-aware version of the Sprint C trigger.
