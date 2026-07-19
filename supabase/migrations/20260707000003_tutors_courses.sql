-- =====================================================================
-- Migration: 20260707000003_tutors_courses.sql
-- Description: Standalone Tutors (no auth dependency) + courses +
--              the v2 curriculum links.
--
-- Sprint 3.8 — Tutor Architecture Refactor.
-- Tutors are NO LONGER 1:1 with auth.users / public.profiles.
-- They are STANDALONE reference records managed only by the
-- Admin. They exist for three purposes:
--   1. Assigning a tutor to a session (`sessions.tutor_id`).
--   2. Showing the assigned tutor in the admin Bookings page.
--   3. Letting the admin know who should receive the Zoom
--      meeting details for a given session.
--
-- There is NO tutor auth account, NO tutor profile, NO tutor
-- session, NO tutor JWT. The `profile_id` FK and the
-- `course_tutors` join table that tied tutors to a user's
-- profile are removed; sessions inherit the assigned tutor
-- directly (FK on `sessions.tutor_id`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- tutors – standalone reference records (no auth dependency)
-- ---------------------------------------------------------------------
create table if not exists public.tutors (
    id          uuid primary key default gen_random_uuid(),
    full_name   text not null,
    email       text not null,
    phone       text,
    -- 'active' = currently teaching on the platform,
    -- 'inactive' = paused but kept for history.
    status      text not null default 'active'
                  check (status in ('active', 'inactive')),
    notes       text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create unique index if not exists uq_tutors_email
    on public.tutors (lower(email));
create index if not exists idx_tutors_status
    on public.tutors (status);

drop trigger if exists trg_tutors_updated_at on public.tutors;
create trigger trg_tutors_updated_at
    before update on public.tutors
    for each row execute function public.set_updated_at();

comment on table public.tutors is
    'Standalone tutor reference records. NOT users. Admin-managed only. Used for session assignment and Zoom meeting ownership.';

-- ---------------------------------------------------------------------
-- courses – tutoring offerings (subject, level, price)
-- ---------------------------------------------------------------------
create table if not exists public.courses (
    id              uuid primary key default gen_random_uuid(),
    slug            text unique not null,
    title           text not null,
    subtitle        text,
    description     text,
    subject         text not null,                         -- Mathématiques, Physique, ...
    level           text not null,                         -- Lycée, Prépa, etc.
    level_group     text not null default 'high_school',   -- high_school | preparatory
    price_cents     integer not null,                      -- 4500 = 45.00 EUR
    currency        char(3) not null default 'EUR',
    duration_min    integer not null default 60,
    is_subscription boolean not null default false,        -- package / subscription flag
    is_published    boolean not null default false,
    cover_image     text,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_courses_slug          on public.courses(slug);
create index if not exists idx_courses_is_published  on public.courses(is_published);
create index if not exists idx_courses_level_group   on public.courses(level_group);
create index if not exists idx_courses_subject       on public.courses(subject);

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
    before update on public.courses
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- NOTE on `course_tutors`
-- ---------------------------------------------------------------------
-- The v1 many-to-many `course_tutors` table is DROPPED in this
-- migration (down from the previous 1:1 with `tutors.profile_id`).
-- Tutors are now assigned to SESSIONS (the atomic unit of the
-- v2 curriculum), not to whole courses. The `sessions.tutor_id`
-- column is the new single point of assignment (migration
-- 20260719000001). A course can be taught by N different tutors,
-- one per session.
--
-- We do not need to DROP an old `course_tutors` table here
-- because the v2 migrations that follow this one never reference
-- it again — the v2 RLS for `session_grants` and
-- `session_bookings` no longer joins through `course_tutors`
-- (see migration 20260714000002 / 20260714000003 / 20260714000007
-- for the rewritten policies).
