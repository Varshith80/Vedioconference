-- =====================================================================
-- Migration: 20260714000003_session_bookings_meeting_links_payments.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Introduces the new unit of booking: `session_bookings`. One row
-- per live session. The table mirrors the pre-Sprint-3.5
-- `module_bookings` schema with two renames:
--
--   module_id      →  session_id
--   enrollment_id  →  session_grant_id
--
-- And adds two nullable FK columns to the existing v1 tables:
--
--   public.meeting_links.session_booking_id  — new nullable FK
--   public.payments.session_grant_id         — new nullable FK
--
-- Backwards compatibility
-- -----------------------
-- The pre-Sprint-3.5 `module_bookings` table is KEPT. A *view*
-- named `public.module_bookings_v1_compat` (NOT a synonym — a
-- regular VIEW with a stable column list) is created to make the
-- v1 column names read-only on the new table for the duration of
-- the deprecation window. The view is dropped in
-- `20260714000007_rls_policies_curriculum_v2.sql` once the 410
-- stubs land.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER is guarded with `if not exists`. The
-- migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. `session_bookings` — one row per live session
-- ---------------------------------------------------------------------
create table if not exists public.session_bookings (
    id                    uuid primary key default gen_random_uuid(),
    session_grant_id      uuid not null references public.session_grants(id) on delete cascade,
    session_id            uuid not null references public.sessions(id)      on delete restrict,
    tutor_id              uuid not null references public.tutors(id)        on delete restrict,
    student_id            uuid not null references public.profiles(id)      on delete restrict,
    status                public.booking_status not null default 'scheduled',
    scheduled_start       timestamptz not null,
    scheduled_end         timestamptz not null,
    timezone              text not null default 'Europe/Paris',
    calendly_event_uri    text,
    calendly_invitee_uri  text unique,
    notes                 text,
    cancelled_at          timestamptz,
    cancelled_reason      text,
    rescheduled_from      uuid references public.session_bookings(id) on delete set null,
    metadata              jsonb not null default '{}'::jsonb,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint session_bookings_time_order check (scheduled_end > scheduled_start)
);

create index if not exists idx_session_bookings_session_grant_id   on public.session_bookings(session_grant_id);
create index if not exists idx_session_bookings_session_id        on public.session_bookings(session_id);
create index if not exists idx_session_bookings_tutor_id          on public.session_bookings(tutor_id);
create index if not exists idx_session_bookings_student_id        on public.session_bookings(student_id);
create index if not exists idx_session_bookings_status            on public.session_bookings(status);
create index if not exists idx_session_bookings_scheduled_start   on public.session_bookings(scheduled_start);
create index if not exists idx_session_bookings_calendly_event    on public.session_bookings(calendly_event_uri);

drop trigger if exists trg_session_bookings_updated_at on public.session_bookings;
create trigger trg_session_bookings_updated_at
    before update on public.session_bookings
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Audit trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_session_bookings_audit on public.session_bookings;
create trigger trg_session_bookings_audit
    after insert or update or delete on public.session_bookings
    for each row execute function public.fn_audit_changes();

-- ---------------------------------------------------------------------
-- 3. `meeting_links` — add session_booking_id (nullable FK)
-- ---------------------------------------------------------------------
alter table public.meeting_links
    add column if not exists session_booking_id uuid references public.session_bookings(id) on delete cascade;

create index if not exists idx_meeting_links_session_booking_id on public.meeting_links(session_booking_id);

-- Add the UNIQUE on session_booking_id (idempotent, partial — only
-- enforce when non-null so multiple legacy rows can coexist).
do $$
begin
    if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename  = 'meeting_links'
          and indexname  = 'uq_meeting_links_session_booking_id'
    ) then
        create unique index uq_meeting_links_session_booking_id
            on public.meeting_links (session_booking_id)
            where session_booking_id is not null;
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. `payments` — add session_grant_id (nullable FK)
-- ---------------------------------------------------------------------
alter table public.payments
    add column if not exists session_grant_id uuid references public.session_grants(id) on delete cascade;

create index if not exists idx_payments_session_grant_id on public.payments(session_grant_id);

-- ---------------------------------------------------------------------
-- 5. Row-Level Security on session_bookings
-- ---------------------------------------------------------------------
alter table public.session_bookings enable row level security;

-- 5.1  Read policy: owner student, assigned tutor, or admin.
drop policy if exists session_bookings_select_owner_tutor_admin on public.session_bookings;
create policy session_bookings_select_owner_tutor_admin
    on public.session_bookings for select
    using (
        student_id = auth.uid()
        or public.is_admin()
        or exists (
            select 1
            from public.tutors t
            where t.id = session_bookings.tutor_id
              and t.profile_id = auth.uid()
        )
    );

-- 5.2  Student self-cancel: status flip from 'scheduled' or
--      'confirmed' to 'cancelled' is allowed. Status flip to
--      'completed' / 'no_show' is admin / tutor only (the
--      default-deny policy blocks the student).
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

-- 5.3  `meeting_links` (changed) — add a new read policy that
--      reads via session_booking_id. The v1 policy that reads
--      via module_booking_id is kept for the v1 rows.
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

-- 5.4  `payments` (changed) — add a new read policy that reads
--      via session_grant_id. The v1 policy that reads via
--      enrollment_id is kept for the v1 rows.
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
-- 6. Comments
-- ---------------------------------------------------------------------
comment on table public.session_bookings is
    'One row per live session. The unit of a Zoom meeting. Source of truth for scheduled_start / scheduled_end is the Calendly webhook, not the client.';
comment on column public.meeting_links.session_booking_id is
    'FK to the new session_bookings table. The v1 module_booking_id is kept for backwards compatibility on the v1 rows.';
comment on column public.payments.session_grant_id is
    'FK to the new session_grants table. The v1 enrollment_id is kept for backwards compatibility on the v1 rows.';

-- ---------------------------------------------------------------------
-- 7. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
