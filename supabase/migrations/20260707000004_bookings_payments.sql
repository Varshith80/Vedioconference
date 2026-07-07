-- =====================================================================
-- Migration: 20260707000004_bookings_payments.sql
-- Description: Bookings, payments, and meeting links.
--              The booking row is the source of truth that links the
--              student, the tutor, the course, and the eventual Zoom
--              meeting / Stripe payment.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'booking_status') then
        create type public.booking_status as enum (
            'pending_payment', 'confirmed', 'completed',
            'cancelled', 'no_show', 'rescheduled'
        );
    end if;
    if not exists (select 1 from pg_type where typname = 'payment_status') then
        create type public.payment_status as enum (
            'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
        );
    end if;
    if not exists (select 1 from pg_type where typname = 'payment_provider') then
        create type public.payment_provider as enum ('stripe', 'other');
    end if;
end $$;

-- ---------------------------------------------------------------------
-- bookings – one row per scheduled class
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
    id                  uuid primary key default gen_random_uuid(),
    student_id          uuid not null references public.profiles(id) on delete restrict,
    tutor_id            uuid not null references public.tutors(id)   on delete restrict,
    course_id           uuid not null references public.courses(id)  on delete restrict,
    status              public.booking_status not null default 'pending_payment',
    scheduled_start     timestamptz not null,
    scheduled_end       timestamptz not null,
    timezone            text not null default 'Europe/Paris',
    -- External references (filled by n8n)
    calendly_event_uri  text,
    calendly_invitee_uri text,
    stripe_session_id   text,
    stripe_payment_intent_id text,
    -- Money snapshot (in cents) – captured at booking time
    amount_cents        integer not null,
    currency            char(3) not null default 'EUR',
    -- Cancellation / reschedule
    cancelled_at        timestamptz,
    cancelled_reason    text,
    rescheduled_from    uuid references public.bookings(id) on delete set null,
    notes               text,
    metadata            jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint bookings_time_order check (scheduled_end > scheduled_start)
);

create index if not exists idx_bookings_student_id       on public.bookings(student_id);
create index if not exists idx_bookings_tutor_id         on public.bookings(tutor_id);
create index if not exists idx_bookings_course_id        on public.bookings(course_id);
create index if not exists idx_bookings_status           on public.bookings(status);
create index if not exists idx_bookings_scheduled_start  on public.bookings(scheduled_start);
create index if not exists idx_bookings_stripe_session   on public.bookings(stripe_session_id);
create index if not exists idx_bookings_calendly_uri     on public.bookings(calendly_event_uri);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
    before update on public.bookings
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- payments – one or more payments per booking (e.g. retries / refunds)
-- ---------------------------------------------------------------------
create table if not exists public.payments (
    id                      uuid primary key default gen_random_uuid(),
    booking_id              uuid not null references public.bookings(id) on delete cascade,
    provider                public.payment_provider not null default 'stripe',
    status                  public.payment_status   not null default 'pending',
    amount_cents            integer not null,
    currency                char(3) not null default 'EUR',
    stripe_payment_intent_id text unique,
    stripe_charge_id        text,
    stripe_receipt_url      text,
    paid_at                 timestamptz,
    refunded_at             timestamptz,
    refunded_amount_cents   integer default 0,
    raw_payload             jsonb not null default '{}'::jsonb,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create index if not exists idx_payments_booking_id on public.payments(booking_id);
create index if not exists idx_payments_status     on public.payments(status);

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
    before update on public.payments
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- meeting_links – one Zoom meeting per confirmed booking
-- ---------------------------------------------------------------------
create table if not exists public.meeting_links (
    id              uuid primary key default gen_random_uuid(),
    booking_id      uuid unique not null references public.bookings(id) on delete cascade,
    provider        text not null default 'zoom',
    meeting_id      text not null,
    join_url        text not null,
    start_url       text,                                 -- only the host sees this
    passcode        text,
    host_url        text,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index if not exists idx_meeting_links_booking_id on public.meeting_links(booking_id);

drop trigger if exists trg_meeting_links_updated_at on public.meeting_links;
create trigger trg_meeting_links_updated_at
    before update on public.meeting_links
    for each row execute function public.set_updated_at();
