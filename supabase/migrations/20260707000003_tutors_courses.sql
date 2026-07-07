-- =====================================================================
-- Migration: 20260707000003_tutors_courses.sql
-- Description: Tutors and courses (with the course <-> tutor mapping).
-- =====================================================================

-- ---------------------------------------------------------------------
-- tutors – a teacher profile, linked 1:1 to a public.profiles row
-- ---------------------------------------------------------------------
create table if not exists public.tutors (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid unique not null references public.profiles(id) on delete cascade,
    bio             text,
    headline        text,                                  -- e.g. "Agrégé de Mathématiques"
    years_experience integer default 0,
    hourly_rate     numeric(10, 2) not null,               -- in EUR
    currency        char(3) not null default 'EUR',
    calendly_event_uri text,                               -- e.g. https://api.calendly.com/event_types/AAA
    zoom_user_id    text,                                  -- Zoom user id
    is_published    boolean not null default false,
    rating_avg      numeric(3, 2) default 0,               -- 0.00 – 5.00
    rating_count    integer not null default 0,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_tutors_profile_id   on public.tutors(profile_id);
create index if not exists idx_tutors_is_published on public.tutors(is_published);

drop trigger if exists trg_tutors_updated_at on public.tutors;
create trigger trg_tutors_updated_at
    before update on public.tutors
    for each row execute function public.set_updated_at();

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
-- course_tutors – many-to-many join between courses and tutors
-- ---------------------------------------------------------------------
create table if not exists public.course_tutors (
    course_id   uuid not null references public.courses(id) on delete cascade,
    tutor_id    uuid not null references public.tutors(id)  on delete cascade,
    is_primary  boolean not null default false,
    created_at  timestamptz not null default now(),
    primary key (course_id, tutor_id)
);

create index if not exists idx_course_tutors_tutor_id on public.course_tutors(tutor_id);
