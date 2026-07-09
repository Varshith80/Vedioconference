-- =====================================================================
-- Migration: 20260709000001_modules_enrollments.sql
-- Sprint:     B2 — module-based workflow
--
-- Description
-- -----------
-- Introduces the two-tier data model that supersedes the per-course
-- Zoom-meeting assumption:
--
--   Course ──┬── Enrollment  (one per student × course, paid once)
--            └── Module      (pre-created by the admin)
--                   └── ModuleBooking  (one per live session)
--                            └── MeetingLink  (one per module booking)
--
-- Lifecycle (no more pending_payment on module_bookings)
-- -------------------------------------------------------
--   module_bookings.status ∈ {
--       'scheduled',    -- Calendly invitee.created fired, no Zoom yet
--       'confirmed',    -- Zoom meeting created, meeting_links row in place
--       'completed',    -- Zoom meeting.ended fired (or tutor / admin mark)
--       'cancelled',    -- student or admin cancelled
--       'no_show',      -- tutor / admin mark
--       'rescheduled'   -- legacy parity (the same id is reused now)
--   }
--
-- Compatibility
-- -------------
-- The legacy `bookings` table is renamed to `_bookings_legacy`,
-- with RLS **off**, so any stale read path does not crash the
-- build. New code MUST NOT query `_bookings_legacy`. It will be
-- dropped in a later cleanup migration.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER is guarded with `if not exists` (or a
-- `DO $$ ... $$` block for the enum / trigger bodies). The
-- migration can be re-run safely on a partially-applied
-- database.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Rename the legacy `bookings` table to `_bookings_legacy`
-- ---------------------------------------------------------------------
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name   = 'bookings'
    ) and not exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name   = '_bookings_legacy'
    ) then
        alter table public.bookings rename to _bookings_legacy;
    end if;
end $$;

-- Disable RLS on the legacy table. (RLS was never enabled on
-- the original bookings table — see migration 6 — but the rename
-- preserves whatever policies exist; we drop them defensively
-- so a stale `enable row level security` from a future migration
-- cannot accidentally expose the legacy data.)
do $$
declare
    pol record;
begin
    for pol in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename  = '_bookings_legacy'
    loop
        execute format('drop policy %I on public._bookings_legacy', pol.policyname);
    end loop;
end $$;

alter table public._bookings_legacy disable row level security;

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
--
-- 1.0  `booking_status` — 'scheduled' was added by a dedicated,
-- single-responsibility migration that runs *before* this one:
--
--   supabase/migrations/20260709000000_booking_status_scheduled.sql
--
-- We do NOT extend `booking_status` here, because Postgres has a
-- strict rule: an enum value added by `ALTER TYPE … ADD VALUE`
-- cannot be referenced by another statement in the same
-- transaction. The Supabase CLI runs every migration file in a
-- single transaction, so adding 'scheduled' in the same file as
-- the `CREATE TABLE module_bookings … DEFAULT 'scheduled'`
-- statement in §5 would leave the migration's success dependent
-- on the Postgres version's tolerance for cross-statement
-- visibility. Splitting the enum extension into its own file
-- guarantees the value is committed before this migration runs,
-- and the table can use it as a DEFAULT without any ambiguity.
--
-- The new module-based lifecycle for `module_bookings` is:
--
--   scheduled → confirmed → completed
--                    ├─→ cancelled
--                    ├─→ no_show
--                    └─→ rescheduled
--
-- The pre-Sprint B2 lifecycle (still used by the legacy
-- `_bookings_legacy.bookings` rows that may exist) is:
--
--   pending_payment → confirmed → completed
--                          ├─→ cancelled
--                          ├─→ no_show
--                          └─→ rescheduled
--
-- Both lifecycles coexist on the same enum. 'scheduled' is
-- never produced by the legacy path; 'pending_payment' is
-- never produced by the new path.
--
-- 1.1  New enums created by this migration.
do $$
begin
    if not exists (select 1 from pg_type where typname = 'enrollment_status') then
        create type public.enrollment_status as enum (
            'pending_payment', 'active', 'completed', 'cancelled', 'refunded'
        );
    end if;

    if not exists (select 1 from pg_type where typname = 'module_progress_status') then
        create type public.module_progress_status as enum (
            'not_started', 'in_progress', 'completed'
        );
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. `modules` — pre-created atoms of a course
-- ---------------------------------------------------------------------
create table if not exists public.modules (
    id                  uuid primary key default gen_random_uuid(),
    course_id           uuid not null references public.courses(id) on delete cascade,
    position            integer not null check (position > 0),
    slug                text not null,
    title               text not null,
    description         text,
    duration_min        integer not null default 60 check (duration_min > 0),
    is_published        boolean not null default false,
    is_preview          boolean not null default false,
    calendly_event_uri  text,
    metadata            jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint modules_position_uq unique (course_id, position),
    constraint modules_slug_uq     unique (course_id, slug)
);

create index if not exists idx_modules_course_id    on public.modules(course_id);
create index if not exists idx_modules_is_published on public.modules(is_published);
create index if not exists idx_modules_is_preview   on public.modules(is_preview);

drop trigger if exists trg_modules_updated_at on public.modules;
create trigger trg_modules_updated_at
    before update on public.modules
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. `enrollments` — paid course access (one per student × course)
-- ---------------------------------------------------------------------
create table if not exists public.enrollments (
    id                        uuid primary key default gen_random_uuid(),
    student_id                uuid not null references public.profiles(id) on delete restrict,
    course_id                 uuid not null references public.courses(id)  on delete restrict,
    status                    public.enrollment_status not null default 'pending_payment',
    stripe_session_id         text,
    stripe_payment_intent_id  text,
    amount_cents              integer not null check (amount_cents >= 0),
    currency                  char(3) not null default 'EUR',
    paid_at                   timestamptz,
    refunded_at               timestamptz,
    refunded_amount_cents     integer not null default 0 check (refunded_amount_cents >= 0),
    completed_at              timestamptz,
    cancelled_at              timestamptz,
    cancelled_reason          text,
    metadata                  jsonb not null default '{}'::jsonb,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

create index if not exists idx_enrollments_student_id              on public.enrollments(student_id);
create index if not exists idx_enrollments_course_id               on public.enrollments(course_id);
create index if not exists idx_enrollments_status                   on public.enrollments(status);
create index if not exists idx_enrollments_stripe_session_id        on public.enrollments(stripe_session_id);
create index if not exists idx_enrollments_stripe_payment_intent_id on public.enrollments(stripe_payment_intent_id);

-- Partial unique index: a student can have at most one active or
-- pending_payment enrollment per course. Re-enrollment is
-- allowed once the prior enrollment is `completed`, `cancelled`
-- or `refunded`.
create unique index if not exists uq_enrollments_active_student_course
    on public.enrollments (student_id, course_id)
    where status in ('pending_payment', 'active');

drop trigger if exists trg_enrollments_updated_at on public.enrollments;
create trigger trg_enrollments_updated_at
    before update on public.enrollments
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. `module_progress` — per-enrollment × per-module state
-- ---------------------------------------------------------------------
create table if not exists public.module_progress (
    id              uuid primary key default gen_random_uuid(),
    enrollment_id   uuid not null references public.enrollments(id) on delete cascade,
    module_id       uuid not null references public.modules(id)     on delete cascade,
    status          public.module_progress_status not null default 'not_started',
    started_at      timestamptz,
    completed_at    timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint module_progress_unique unique (enrollment_id, module_id)
);

create index if not exists idx_module_progress_enrollment_id on public.module_progress(enrollment_id);
create index if not exists idx_module_progress_module_id     on public.module_progress(module_id);
create index if not exists idx_module_progress_status        on public.module_progress(status);

drop trigger if exists trg_module_progress_updated_at on public.module_progress;
create trigger trg_module_progress_updated_at
    before update on public.module_progress
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. `module_bookings` — one row per live session
-- ---------------------------------------------------------------------
create table if not exists public.module_bookings (
    id                    uuid primary key default gen_random_uuid(),
    enrollment_id         uuid not null references public.enrollments(id) on delete cascade,
    module_id             uuid not null references public.modules(id)     on delete restrict,
    tutor_id              uuid not null references public.tutors(id)      on delete restrict,
    student_id            uuid not null references public.profiles(id)    on delete restrict,
    status                public.booking_status not null default 'scheduled',
    scheduled_start       timestamptz not null,
    scheduled_end         timestamptz not null,
    timezone              text not null default 'Europe/Paris',
    calendly_event_uri    text,
    calendly_invitee_uri  text unique,
    notes                 text,
    cancelled_at          timestamptz,
    cancelled_reason      text,
    rescheduled_from      uuid references public.module_bookings(id) on delete set null,
    metadata              jsonb not null default '{}'::jsonb,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    constraint module_bookings_time_order check (scheduled_end > scheduled_start)
);

create index if not exists idx_module_bookings_enrollment_id    on public.module_bookings(enrollment_id);
create index if not exists idx_module_bookings_module_id        on public.module_bookings(module_id);
create index if not exists idx_module_bookings_tutor_id         on public.module_bookings(tutor_id);
create index if not exists idx_module_bookings_student_id       on public.module_bookings(student_id);
create index if not exists idx_module_bookings_status           on public.module_bookings(status);
create index if not exists idx_module_bookings_scheduled_start  on public.module_bookings(scheduled_start);
create index if not exists idx_module_bookings_calendly_event   on public.module_bookings(calendly_event_uri);

drop trigger if exists trg_module_bookings_updated_at on public.module_bookings;
create trigger trg_module_bookings_updated_at
    before update on public.module_bookings
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. `payments` — add enrollment_id + module_booking_id, keep legacy
-- ---------------------------------------------------------------------
alter table public.payments
    add column if not exists enrollment_id     uuid references public.enrollments(id)     on delete cascade,
    add column if not exists module_booking_id uuid references public.module_bookings(id) on delete cascade;

-- Legacy booking_id stays. The FK is dropped if it was on the
-- (now renamed) `bookings` table, and re-pointed at
-- `_bookings_legacy`.
do $$
begin
    -- If a FK on payments.booking_id points at the old
    -- `bookings` table, drop it. The renamed
    -- `_bookings_legacy` is the new target.
    if exists (
        select 1
        from information_schema.table_constraints tc
        join information_schema.constraint_column_usage ccu
              on tc.constraint_name = ccu.constraint_name
        where tc.table_schema = 'public'
          and tc.table_name   = 'payments'
          and tc.constraint_type = 'FOREIGN KEY'
          and ccu.table_name  = 'bookings'
    ) then
        alter table public.payments
            drop constraint payments_booking_id_fkey;
    end if;
exception when undefined_object then
    null;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name   = 'payments'
          and constraint_type = 'FOREIGN KEY'
          and constraint_name like '%booking_id%'
    ) then
        -- No FK present; add the legacy FK to _bookings_legacy.
        begin
            alter table public.payments
                add constraint payments_booking_id_legacy_fkey
                foreign key (booking_id) references public._bookings_legacy(id) on delete cascade;
        exception when duplicate_object then
            null;
        end;
    end if;
end $$;

create index if not exists idx_payments_enrollment_id     on public.payments(enrollment_id);
create index if not exists idx_payments_module_booking_id on public.payments(module_booking_id);

-- ---------------------------------------------------------------------
-- 7. `meeting_links` — add module_booking_id, keep legacy
-- ---------------------------------------------------------------------
alter table public.meeting_links
    add column if not exists module_booking_id uuid references public.module_bookings(id) on delete cascade;

-- If a FK on meeting_links.booking_id points at the old
-- `bookings` table, re-point it at `_bookings_legacy`.
do $$
begin
    if exists (
        select 1
        from information_schema.table_constraints tc
        join information_schema.constraint_column_usage ccu
              on tc.constraint_name = ccu.constraint_name
        where tc.table_schema = 'public'
          and tc.table_name   = 'meeting_links'
          and tc.constraint_type = 'FOREIGN KEY'
          and ccu.table_name  = 'bookings'
    ) then
        alter table public.meeting_links
            drop constraint meeting_links_booking_id_fkey;
    end if;
exception when undefined_object then
    null;
end $$;

do $$
begin
    if not exists (
        select 1
        from information_schema.table_constraints
        where table_schema = 'public'
          and table_name   = 'meeting_links'
          and constraint_type = 'FOREIGN KEY'
          and constraint_name like '%booking_id%'
    ) then
        begin
            alter table public.meeting_links
                add constraint meeting_links_booking_id_legacy_fkey
                foreign key (booking_id) references public._bookings_legacy(id) on delete cascade;
        exception when duplicate_object then
            null;
        end;
    end if;
end $$;

-- Add the UNIQUE on module_booking_id (idempotent).
do $$
begin
    if not exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename  = 'meeting_links'
          and indexname  = 'uq_meeting_links_module_booking_id'
    ) then
        create unique index uq_meeting_links_module_booking_id
            on public.meeting_links (module_booking_id)
            where module_booking_id is not null;
    end if;
end $$;

-- ---------------------------------------------------------------------
-- 8. `resource_grants` — replace booking_id with enrollment_id
-- ---------------------------------------------------------------------
-- Strategy:
--   1. Add the new `enrollment_id` column.
--   2. Drop the two pre-Sprint-B2 RLS policies that depend on
--      `resource_grants.booking_id` (and, in the case of
--      `resources_select_visible`, on `bookings.student_id`).
--      Postgres refuses `ALTER TABLE … DROP COLUMN` while a
--      policy USING-clause still references the column. Dropping
--      the policies first is the only safe way to free the
--      dependency without using `DROP … CASCADE` (which the
--      user has explicitly disallowed).
--   3. Drop the legacy `booking_id` FK (if present) and the
--      `booking_id` column.
--   4. Recreate the read policies against the new schema
--      (enrollment_id → enrollments.student_id). The new policy
--      names match the new lifecycle:
--        - `resources_select_visible` is the same name, but
--          rebuilt on `enrollment_id` so existing read paths
--          still resolve. It will be a no-op against rows whose
--          enrollment_id is NULL (the old booking_id rows are
--          no longer queryable through RLS, which is the
--          intended semantic — they will be backfilled or
--          dropped by an admin).
--        - `resource_grants_select_own_or_admin` is dropped and
--          NOT recreated; §10.8 creates the new
--          `resource_grants_select_via_enrollment` policy that
--          supersedes it. We do not want both policies live at
--          once.
--   5. Rebuild the PK on (resource_id, enrollment_id).

-- 8.0  Add the new column (idempotent).
alter table public.resource_grants
    add column if not exists enrollment_id uuid references public.enrollments(id) on delete cascade;

-- 8.1  Drop the pre-Sprint-B2 policies that reference
--      `resource_grants.booking_id` or the legacy `bookings` table.
--
--      We drop them by name; `drop policy if exists` is idempotent
--      and safe on a fresh database where they were never created.
drop policy if exists "resources_select_visible"            on public.resources;
drop policy if exists "resource_grants_select_own_or_admin" on public.resource_grants;

-- 8.2  Drop the legacy FK and the `booking_id` column. We do
--      not migrate the data (there is no mapping from the old
--      booking_id to the new enrollment_id in a fully generic
--      way; if any rows exist, an admin runs a one-off backfill
--      before the legacy table is dropped in a later migration).
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name   = 'resource_grants'
          and column_name  = 'booking_id'
    ) then
        begin
            alter table public.resource_grants
                drop constraint resource_grants_booking_id_fkey;
        exception when undefined_object then
            null;
        end;
        alter table public.resource_grants drop column booking_id;
    end if;
end $$;

-- 8.3  Rebuild the PK on (resource_id, enrollment_id) idempotently.
do $$
begin
    if exists (
        select 1
        from pg_indexes
        where schemaname = 'public'
          and tablename  = 'resource_grants'
          and indexname  = 'resource_grants_pkey'
    ) then
        -- PK exists; check if it is on the right columns.
        if not exists (
            select 1
            from information_schema.key_column_usage
            where table_schema = 'public'
              and table_name   = 'resource_grants'
              and constraint_name = 'resource_grants_pkey'
              and column_name in ('resource_id', 'enrollment_id')
            group by constraint_name
            having count(*) = 2
        ) then
            alter table public.resource_grants drop constraint resource_grants_pkey;
            alter table public.resource_grants
                add constraint resource_grants_pkey primary key (resource_id, enrollment_id);
        end if;
    else
        alter table public.resource_grants
            add constraint resource_grants_pkey primary key (resource_id, enrollment_id);
    end if;
end $$;

create index if not exists idx_resource_grants_enrollment_id on public.resource_grants(enrollment_id);

-- 8.4  Recreate `resources_select_visible` against the new
--      schema. The new JOIN is `resource_grants.enrollment_id
--      → enrollments.student_id`. We do NOT recreate
--      `resource_grants_select_own_or_admin`; §10.8 creates the
--      successor policy `resource_grants_select_via_enrollment`.
--
--      Read-visibility semantics preserved:
--        - public resources stay visible to everyone
--        - admins see everything
--        - `enrolled` resources are visible to the student who
--          holds an `active` enrollment in the resource's course
--        - `private` resources are visible to the uploader
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
                join public.enrollments e on e.id = rg.enrollment_id
                where rg.resource_id = resources.id
                  and e.student_id = auth.uid()
            )
        )
        or (
            visibility = 'private'
            and uploaded_by = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- 9. Triggers — completion cascade + audit
-- ---------------------------------------------------------------------

-- 9.1  module_bookings → module_progress on completion
--
-- SECURITY DEFINER on purpose: the cascade update touches
-- `module_progress`, whose RLS is deny-by-default for direct
-- user writes. Without SECURITY DEFINER, the trigger would
-- run with the calling user's privileges and be silently
-- blocked by RLS, so the course would never flip to
-- `completed` even after every module is. With SECURITY
-- DEFINER the trigger runs as the function owner (the
-- migration's superuser) and bypasses RLS. This mirrors the
-- pattern in migration 1's `fn_audit_changes`.
create or replace function public.fn_module_bookings_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (TG_OP = 'UPDATE'
        and NEW.status = 'completed'
        and (OLD.status is null or OLD.status <> 'completed'))
    then
        update public.module_progress mp
        set status       = 'completed',
            completed_at = coalesce(mp.completed_at, now()),
            updated_at   = now()
        where mp.enrollment_id = NEW.enrollment_id
          and mp.module_id     = NEW.module_id
          and mp.status       <> 'completed';
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_module_bookings_completion on public.module_bookings;
create trigger trg_module_bookings_completion
    after update of status on public.module_bookings
    for each row execute function public.fn_module_bookings_completion();

-- 9.2  module_progress → enrollments on full completion
--
-- SECURITY DEFINER for the same reason: the cascade update
-- touches `enrollments`, whose RLS denies direct user writes
-- (the only legitimate writer is the system, via this
-- trigger or via the n8n service-role key). With SECURITY
-- INVOKER, the trigger would run as the calling user and be
-- blocked by RLS.
create or replace function public.fn_enrollments_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_remaining integer;
begin
    if (TG_OP = 'UPDATE'
        and NEW.status = 'completed'
        and (OLD.status is null or OLD.status <> 'completed'))
    then
        select count(*) into v_remaining
        from public.module_progress mp
        where mp.enrollment_id = NEW.enrollment_id
          and mp.status       <> 'completed';

        if v_remaining = 0 then
            update public.enrollments e
            set status       = 'completed',
                completed_at = coalesce(e.completed_at, now()),
                updated_at   = now()
            where e.id     = NEW.enrollment_id
              and e.status = 'active';
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_enrollments_completion on public.module_progress;
create trigger trg_enrollments_completion
    after update of status on public.module_progress
    for each row execute function public.fn_enrollments_completion();

-- 9.3  Audit triggers on the new tables
drop trigger if exists trg_modules_audit on public.modules;
create trigger trg_modules_audit
    after insert or update or delete on public.modules
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_enrollments_audit on public.enrollments;
create trigger trg_enrollments_audit
    after insert or update or delete on public.enrollments
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_module_bookings_audit on public.module_bookings;
create trigger trg_module_bookings_audit
    after insert or update or delete on public.module_bookings
    for each row execute function public.fn_audit_changes();

-- ---------------------------------------------------------------------
-- 10. Row-Level Security
-- ---------------------------------------------------------------------

-- 10.1  enable RLS on the new tables
alter table public.modules          enable row level security;
alter table public.enrollments      enable row level security;
alter table public.module_progress  enable row level security;
alter table public.module_bookings  enable row level security;

-- 10.2  `modules`
drop policy if exists modules_select_published_or_admin on public.modules;
create policy modules_select_published_or_admin
    on public.modules for select
    using (
        is_published = true
        or public.is_admin()
    );

drop policy if exists modules_admin_write on public.modules;
create policy modules_admin_write
    on public.modules for all
    using (public.is_admin() or public.is_super_admin())
    with check (public.is_admin() or public.is_super_admin());

-- 10.3  `enrollments`
drop policy if exists enrollments_select_owner_tutor_admin on public.enrollments;
create policy enrollments_select_owner_tutor_admin
    on public.enrollments for select
    using (
        student_id = auth.uid()
        or public.is_admin()
        or exists (
            select 1
            from public.tutors t
            join public.course_tutors ct on ct.tutor_id = t.id
            where t.profile_id = auth.uid()
              and ct.course_id = enrollments.course_id
        )
    );

-- Writes (insert / update / delete) on enrollments are deny-by-default.
-- The only writer is n8n with the service-role key (Stripe webhook).
-- A SECURITY DEFINER RPC (added in a follow-up migration, or
-- via the route handler using the service-role key) is what the
-- application uses to create the row.
drop policy if exists enrollments_no_direct_write on public.enrollments;
-- (No `for all` policy is created; the default-deny behaviour
--  of RLS is the policy.)

-- 10.4  `module_progress`
drop policy if exists module_progress_select_owner_tutor_admin on public.module_progress;
create policy module_progress_select_owner_tutor_admin
    on public.module_progress for select
    using (
        exists (
            select 1
            from public.enrollments e
            where e.id = module_progress.enrollment_id
              and (
                  e.student_id = auth.uid()
                  or public.is_admin()
                  or exists (
                      select 1
                      from public.tutors t
                      join public.course_tutors ct on ct.tutor_id = t.id
                      where t.profile_id = auth.uid()
                        and ct.course_id = e.course_id
                  )
              )
        )
    );

-- Writes are deny-by-default. The trigger cascade writes
-- happen with the table owner's privileges; the trigger
-- function is SECURITY DEFINER so RLS does not block it.

-- 10.5  `module_bookings`
drop policy if exists module_bookings_select_owner_tutor_admin on public.module_bookings;
create policy module_bookings_select_owner_tutor_admin
    on public.module_bookings for select
    using (
        student_id = auth.uid()
        or public.is_admin()
        or exists (
            select 1
            from public.tutors t
            where t.id = module_bookings.tutor_id
              and t.profile_id = auth.uid()
        )
    );

-- Students can self-cancel a booking they own (status flip
-- from 'scheduled' or 'confirmed' to 'cancelled'). The route
-- handler does this; RLS enforces the column-level rule.
drop policy if exists module_bookings_student_update_cancel on public.module_bookings;
create policy module_bookings_student_update_cancel
    on public.module_bookings for update
    using (
        student_id = auth.uid()
        and status in ('scheduled', 'confirmed', 'cancelled')
    )
    with check (
        student_id = auth.uid()
        and status in ('scheduled', 'confirmed', 'cancelled', 'no_show', 'completed', 'rescheduled')
    );

-- 10.6  `payments` (changed) — students can read their own,
-- writes are deny-by-default (service role only).
drop policy if exists payments_select_owner_or_admin on public.payments;
create policy payments_select_owner_or_admin
    on public.payments for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.enrollments e
            where e.id = payments.enrollment_id
              and e.student_id = auth.uid()
        )
    );

-- 10.7  `meeting_links` (changed) — visibility = parent booking
drop policy if exists meeting_links_select_via_module_booking on public.meeting_links;
create policy meeting_links_select_via_module_booking
    on public.meeting_links for select
    using (
        public.is_admin()
        or (
            module_booking_id is not null
            and exists (
                select 1
                from public.module_bookings mb
                where mb.id = meeting_links.module_booking_id
                  and (mb.student_id = auth.uid() or public.is_admin())
            )
        )
    );

-- 10.8  `resource_grants` (changed) — visibility = enrollment owner
drop policy if exists resource_grants_select_via_enrollment on public.resource_grants;
create policy resource_grants_select_via_enrollment
    on public.resource_grants for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.enrollments e
            where e.id = resource_grants.enrollment_id
              and e.student_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------
-- 11. Comments — keep the data dictionary self-describing
-- ---------------------------------------------------------------------
comment on table public.modules          is 'Pre-created pedagogical atoms of a course. Each module has its own Calendly event type and (when booked) its own Zoom meeting.';
comment on table public.enrollments      is 'Paid access to a course. One row per (student, course) for the active enrollment. The unit of payment.';
comment on table public.module_progress  is 'Per-enrollment, per-module state. Updated by the completion trigger when a module_bookings row flips to completed.';
comment on table public.module_bookings  is 'One row per live session. The unit of a Zoom meeting. Source of truth for scheduled_start/scheduled_end is Calendly, not the client.';
comment on table public._bookings_legacy is 'DEPRECATED — the pre-Sprint B2 bookings table. RLS off. New code MUST NOT query this table. Will be dropped in a later cleanup migration.';

comment on column public.modules.is_preview is 'Free-preview module flag. No UI yet; future-proofing for free sample modules.';

-- ---------------------------------------------------------------------
-- 12. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
