-- =====================================================================
-- Migration: 20260707000005_resources_notifications_audit.sql
-- Description: Resources (study material), notifications, and the
--              audit log.
-- =====================================================================

-- ---------------------------------------------------------------------
-- resources – study material uploaded by admins
-- ---------------------------------------------------------------------
-- Sprint 3.8 — `tutor_id` column removed. Tutors are standalone
-- reference records in the new architecture; they have no
-- authorship role. The `uploaded_by` FK (pointing at
-- `public.profiles`) records which admin user uploaded the
-- file. Resources are admin-managed only in this MVP.
create table if not exists public.resources (
    id              uuid primary key default gen_random_uuid(),
    course_id       uuid references public.courses(id) on delete cascade,
    title           text not null,
    description     text,
    file_path       text not null,                        -- relative to the storage bucket
    file_name       text not null,
    mime_type       text,
    size_bytes      bigint,
    visibility      text not null default 'enrolled',     -- public | enrolled | private
    uploaded_by     uuid references public.profiles(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint resources_visibility_chk
        check (visibility in ('public', 'enrolled', 'private'))
);

create index if not exists idx_resources_course_id  on public.resources(course_id);
create index if not exists idx_resources_visibility on public.resources(visibility);

drop trigger if exists trg_resources_updated_at on public.resources;
create trigger trg_resources_updated_at
    before update on public.resources
    for each row execute function public.set_updated_at();

-- Join: which bookings give access to which resources (enrolled)
create table if not exists public.resource_grants (
    resource_id uuid not null references public.resources(id) on delete cascade,
    booking_id  uuid not null references public.bookings(id)  on delete cascade,
    granted_at  timestamptz not null default now(),
    primary key (resource_id, booking_id)
);

-- ---------------------------------------------------------------------
-- notifications – in-app notification log (mirror of emails sent)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    type            text not null,                        -- booking_confirmed | reminder_24h | ...
    channel         text not null default 'email',       -- email | in_app
    subject         text,
    body            text,
    payload         jsonb not null default '{}'::jsonb,
    read_at         timestamptz,
    sent_at         timestamptz not null default now(),
    created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_type    on public.notifications(type);
create index if not exists idx_notifications_read_at on public.notifications(read_at);

-- ---------------------------------------------------------------------
-- audit_logs – generic write-ahead log of mutations
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
    id          uuid primary key default gen_random_uuid(),
    table_name  text not null,
    row_id      uuid,
    action      text not null,                            -- insert | update | delete
    actor_id    uuid references public.profiles(id) on delete set null,
    changes     jsonb not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_table_name on public.audit_logs(table_name);
create index if not exists idx_audit_logs_row_id     on public.audit_logs(row_id);
create index if not exists idx_audit_logs_actor_id   on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- Enable audit triggers for sensitive tables
drop trigger if exists trg_bookings_audit on public.bookings;
create trigger trg_bookings_audit
    after insert or update or delete on public.bookings
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_payments_audit on public.payments;
create trigger trg_payments_audit
    after insert or update or delete on public.payments
    for each row execute function public.fn_audit_changes();

drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit
    after update on public.profiles
    for each row execute function public.fn_audit_changes();
