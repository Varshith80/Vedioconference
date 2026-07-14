-- =====================================================================
-- Migration: 20260714000001_chapters_sessions.sql
-- Sprint:     3.5 — Curriculum Architecture Restructure
--
-- Description
-- -----------
-- Introduces the two bottom layers of the new curriculum hierarchy:
--
--   Course
--     └─ Chapter  (was `modules`; the table is renamed to clarify
--                 the role — a chapter groups N sessions, it is no
--                 longer itself the unit of booking)
--         └─ Session  (NEW — the atomic unit of purchase, booking,
--                      attendance, progress, and meeting creation)
--
-- Two nullable FKs are added to `public.courses`:
--   - program_id  (every course belongs to exactly one program)
--   - grade_id    (NULL for the BTS / Prépa programs; set for
--                  High School courses)
--
-- The pre-existing `courses.price_cents`, `courses.is_subscription`,
-- and `courses.level_group` columns are KEPT in this migration (they
-- are part of the v1 schema and existing demo data references them).
-- The application no longer writes to them; a follow-up cleanup
-- migration in Sprint 3.6 will drop them once the new services are
-- the only writer.
--
-- price_cents NULLability
-- -----------------------
-- `sessions.price_cents` is intentionally NULLABLE. The per-session
-- price is the responsibility of the Sprint 5 Excel curriculum
-- import — until then, no placeholder (e.g. 4500) is inserted and
-- the Stripe Checkout route returns a structured
-- `422 session_price_missing` if a student tries to buy an
-- un-priced session. The CHECK is therefore relaxed: NULL is the
-- "price TBD" sentinel.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER is guarded with `if not exists`. The
-- migration can be re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extend `courses` with two nullable FKs
-- ---------------------------------------------------------------------
alter table public.courses
    add column if not exists program_id uuid references public.programs(id) on delete restrict,
    add column if not exists grade_id   uuid references public.grades(id)   on delete restrict;

create index if not exists idx_courses_program_id on public.courses(program_id);
create index if not exists idx_courses_grade_id   on public.courses(grade_id);

-- ---------------------------------------------------------------------
-- 2. `chapters` — the new name for what was `modules`
-- ---------------------------------------------------------------------
create table if not exists public.chapters (
    id                     uuid primary key default gen_random_uuid(),
    course_id              uuid not null references public.courses(id) on delete cascade,
    position               integer not null check (position > 0),
    slug                   text not null,
    title                  text not null,
    description            text,
    default_duration_min   integer not null default 60 check (default_duration_min > 0),
    is_published           boolean not null default false,
    sort_order             integer not null default 0,
    metadata               jsonb not null default '{}'::jsonb,
    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now(),
    unique (course_id, position),
    unique (course_id, slug)
);

create index if not exists idx_chapters_course_id    on public.chapters(course_id);
create index if not exists idx_chapters_is_published on public.chapters(is_published);
create index if not exists idx_chapters_sort_order   on public.chapters(sort_order);

drop trigger if exists trg_chapters_updated_at on public.chapters;
create trigger trg_chapters_updated_at
    before update on public.chapters
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. `sessions` — the atomic unit of purchase, booking, attendance,
--    progress, and meeting creation
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
    id                 uuid primary key default gen_random_uuid(),
    chapter_id         uuid not null references public.chapters(id) on delete cascade,
    position           integer not null check (position > 0),
    slug               text not null,
    title              text not null,
    description        text,
    duration_min       integer check (duration_min is null or duration_min > 0),  -- override; NULL → chapter default
    -- price_cents is NULLABLE: NULL is the "price TBD" sentinel.
    -- Sprint 5 (Excel import) is the source of truth. Until then,
    -- the Stripe Checkout route returns 422 session_price_missing
    -- if a student tries to buy an un-priced session.
    price_cents        integer check (price_cents is null or price_cents >= 0),
    currency           char(3) not null default 'EUR',
    is_published       boolean not null default false,
    is_preview         boolean not null default false,                             -- free-preview flag (no purchase required)
    calendly_event_uri text,                                                       -- per-session Calendly event type
    sort_order         integer not null default 0,
    metadata           jsonb not null default '{}'::jsonb,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    unique (chapter_id, position),
    unique (chapter_id, slug)
);

create index if not exists idx_sessions_chapter_id       on public.sessions(chapter_id);
create index if not exists idx_sessions_is_published     on public.sessions(is_published);
create index if not exists idx_sessions_is_preview       on public.sessions(is_preview);
create index if not exists idx_sessions_sort_order       on public.sessions(sort_order);
create index if not exists idx_sessions_calendly_event   on public.sessions(calendly_event_uri);

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
    before update on public.sessions
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Audit triggers on the new tables
-- ---------------------------------------------------------------------
drop trigger if exists trg_chapters_audit on public.chapters;
create trigger trg_chapters_audit
    after insert or update or delete on public.chapters
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_sessions_audit on public.sessions;
create trigger trg_sessions_audit
    after insert or update or delete on public.sessions
    for each row execute function public.fn_audit_changes();

-- ---------------------------------------------------------------------
-- 5. Row-Level Security — published-only reads, admin writes
-- ---------------------------------------------------------------------
alter table public.chapters enable row level security;
alter table public.sessions enable row level security;

-- 5.1  `chapters`
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

-- 5.2  `sessions`
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

-- ---------------------------------------------------------------------
-- 6. Comments
-- ---------------------------------------------------------------------
comment on table public.chapters is
    'A pedagogical chapter of a course. Each chapter groups N sessions. The atomic unit of the curriculum.';
comment on table public.sessions is
    'The atomic unit of the platform: one Stripe charge, one Calendly booking, one Zoom meeting, one attendance record, one progress signal. NULL price_cents means "price TBD" (set by the Sprint 5 Excel import).';

comment on column public.sessions.is_preview is
    'Free-preview session flag. A preview session is bookable without a session_grant. Non-preview sessions require a paid grant.';
comment on column public.sessions.calendly_event_uri is
    'Per-session Calendly event-type URI. The Calendly embed on the dashboard reads this directly.';

-- ---------------------------------------------------------------------
-- 7. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
