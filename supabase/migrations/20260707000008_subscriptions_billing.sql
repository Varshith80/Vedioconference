-- =====================================================================
-- Migration: 20260707000008_subscriptions_billing.sql
-- Description: Subscriptions, coupons, webhook dedupe, n8n observability,
--              invoices, double-booking guard, role-protection trigger.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$
begin
    if not exists (select 1 from pg_type where typname = 'subscription_status') then
        create type public.subscription_status as enum (
            'trialing', 'active', 'past_due', 'cancelled', 'incomplete', 'incomplete_expired'
        );
    end if;
    if not exists (select 1 from pg_type where typname = 'coupon_kind') then
        create type public.coupon_kind as enum ('percent', 'amount');
    end if;
    if not exists (select 1 from pg_type where typname = 'invoice_status') then
        create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');
    end if;
end $$;

-- ---------------------------------------------------------------------
-- subscriptions – recurring billing (Phase 5 full UI)
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
    id                      uuid primary key default gen_random_uuid(),
    student_id              uuid not null references public.profiles(id) on delete restrict,
    course_id               uuid references public.courses(id) on delete set null,
    status                  public.subscription_status not null default 'active',
    stripe_subscription_id  text unique,
    stripe_price_id         text,
    current_period_start    timestamptz not null,
    current_period_end      timestamptz not null,
    cancel_at_period_end    boolean not null default false,
    cancelled_at            timestamptz,
    metadata                jsonb not null default '{}'::jsonb,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    constraint subscriptions_period_order check (current_period_end > current_period_start)
);

create index if not exists idx_subscriptions_student_id on public.subscriptions(student_id);
create index if not exists idx_subscriptions_status     on public.subscriptions(status);
create index if not exists idx_subscriptions_period_end on public.subscriptions(current_period_end);

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
    before update on public.subscriptions
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- coupons
-- ---------------------------------------------------------------------
create table if not exists public.coupons (
    id              uuid primary key default gen_random_uuid(),
    code            text unique not null,
    kind            public.coupon_kind not null,
    percent_off     integer,                          -- 0–100
    amount_off_cents integer,
    currency        char(3) default 'EUR',
    max_redemptions integer,
    redeemed_count  integer not null default 0,
    expires_at      timestamptz,
    is_active       boolean not null default true,
    metadata        jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint coupons_value_chk
        check (
            (kind = 'percent'  and percent_off between 1 and 100 and amount_off_cents is null)
         or (kind = 'amount'   and amount_off_cents > 0             and percent_off     is null)
        )
);

create index if not exists idx_coupons_code     on public.coupons(code);
create index if not exists idx_coupons_is_active on public.coupons(is_active);

drop trigger if exists trg_coupons_updated_at on public.coupons;
create trigger trg_coupons_updated_at
    before update on public.coupons
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- webhook_events – idempotency for inbound webhooks
-- ---------------------------------------------------------------------
create table if not exists public.webhook_events (
    id          uuid primary key default gen_random_uuid(),
    provider    text not null,                        -- 'stripe' | 'calendly' | 'n8n'
    event_id    text not null,
    event_type  text not null,
    payload     jsonb not null,
    processed   boolean not null default false,
    error       text,
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    unique (provider, event_id)
);

create index if not exists idx_webhook_events_provider on public.webhook_events(provider);
create index if not exists idx_webhook_events_received on public.webhook_events(received_at desc);

-- ---------------------------------------------------------------------
-- n8n_executions – observability for n8n workflows
-- ---------------------------------------------------------------------
create table if not exists public.n8n_executions (
    id          uuid primary key default gen_random_uuid(),
    workflow    text not null,
    run_id      text unique,
    status      text not null,                        -- 'started' | 'completed' | 'failed'
    attempts    integer not null default 1,
    request_id  text,
    payload     jsonb not null default '{}'::jsonb,
    error       text,
    started_at  timestamptz not null default now(),
    finished_at timestamptz,
    duration_ms integer
);

create index if not exists idx_n8n_executions_workflow   on public.n8n_executions(workflow);
create index if not exists idx_n8n_executions_status     on public.n8n_executions(status);
create index if not exists idx_n8n_executions_started_at on public.n8n_executions(started_at desc);

-- ---------------------------------------------------------------------
-- n8n_dead_letters – permanent failure queue
-- ---------------------------------------------------------------------
create table if not exists public.n8n_dead_letters (
    id             uuid primary key default gen_random_uuid(),
    workflow       text not null,
    original_event jsonb not null,
    error          text not null,
    retry_count    integer not null default 0,
    resolved_at    timestamptz,
    created_at     timestamptz not null default now()
);

create index if not exists idx_n8n_dead_letters_workflow    on public.n8n_dead_letters(workflow);
create index if not exists idx_n8n_dead_letters_resolved_at on public.n8n_dead_letters(resolved_at);
create index if not exists idx_n8n_dead_letters_created_at on public.n8n_dead_letters(created_at desc);

-- ---------------------------------------------------------------------
-- invoices – Stripe invoice mirror for re-emission
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
    id                  uuid primary key default gen_random_uuid(),
    student_id          uuid not null references public.profiles(id) on delete restrict,
    booking_id          uuid references public.bookings(id) on delete set null,
    subscription_id     uuid references public.subscriptions(id) on delete set null,
    status              public.invoice_status not null default 'draft',
    amount_cents        integer not null,
    currency            char(3) not null default 'EUR',
    stripe_invoice_id   text unique,
    pdf_url             text,
    issued_at           timestamptz,
    paid_at             timestamptz,
    metadata            jsonb not null default '{}'::jsonb,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists idx_invoices_student_id on public.invoices(student_id);
create index if not exists idx_invoices_status     on public.invoices(status);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
    before update on public.invoices
    for each row execute function public.set_updated_at();

-- =====================================================================
-- Triggers
-- =====================================================================

-- Prevent a tutor from having two CONFIRMED bookings whose time ranges
-- overlap. Excludes cancelled / no_show / rescheduled.
create or replace function public.fn_no_tutor_overlap()
returns trigger
language plpgsql
as $$
begin
    if new.status = 'confirmed' then
        if exists (
            select 1
            from public.bookings b
            where b.tutor_id = new.tutor_id
              and b.id <> new.id
              and b.status in ('confirmed', 'pending_payment')
              and tstzrange(b.scheduled_start, b.scheduled_end, '[)')
                  && tstzrange(new.scheduled_start, new.scheduled_end, '[)')
        ) then
            raise exception 'tutor % is already booked in this time range', new.tutor_id
                using errcode = '23505';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_bookings_no_tutor_overlap on public.bookings;
create trigger trg_bookings_no_tutor_overlap
    before insert or update on public.bookings
    for each row execute function public.fn_no_tutor_overlap();

-- Disallow self-elevation of role via the profiles.update policy.
create or replace function public.fn_block_role_self_escalation()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' and new.role is distinct from old.role then
        if auth.uid() = old.id and not public.is_super_admin() then
            raise exception 'role self-elevation is not allowed'
                using errcode = '42501';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_profiles_block_role_escalation on public.profiles;
create trigger trg_profiles_block_role_escalation
    before update on public.profiles
    for each row execute function public.fn_block_role_self_escalation();

-- Lock tutor.profile_id after creation (a tutor cannot be reassigned
-- to a different profile).
create or replace function public.fn_lock_tutor_profile_id()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id then
        raise exception 'tutor.profile_id is immutable'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_tutors_lock_profile on public.tutors;
create trigger trg_tutors_lock_profile
    before update on public.tutors
    for each row execute function public.fn_lock_tutor_profile_id();

-- Prevent cancellation after the meeting has started.
create or replace function public.fn_block_late_cancel()
returns trigger
language plpgsql
as $$
begin
    if tg_op = 'UPDATE'
       and old.status not in ('cancelled', 'completed', 'no_show')
       and new.status = 'cancelled'
       and new.cancelled_at is not null
       and new.cancelled_at > old.scheduled_start then
        raise exception 'cannot cancel a booking that has already started'
            using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_bookings_block_late_cancel on public.bookings;
create trigger trg_bookings_block_late_cancel
    before update on public.bookings
    for each row execute function public.fn_block_late_cancel();

-- Reminder / confirmation dedupe: only one row per (user, type, booking, channel).
create unique index if not exists uq_notifications_dedupe
    on public.notifications (user_id, type, (payload->>'booking_id'), channel);

-- =====================================================================
-- RLS – new tables
-- =====================================================================

alter table public.subscriptions    enable row level security;
alter table public.coupons          enable row level security;
alter table public.webhook_events   enable row level security;
alter table public.n8n_executions   enable row level security;
alter table public.n8n_dead_letters enable row level security;
alter table public.invoices         enable row level security;

-- subscriptions
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin"
    on public.subscriptions for select
    using (auth.uid() = student_id or public.is_admin());

drop policy if exists "subscriptions_write_admin_only" on public.subscriptions;
create policy "subscriptions_write_admin_only"
    on public.subscriptions for all
    using (public.is_admin())
    with check (public.is_admin());

-- coupons – public can read active, only admin can write
drop policy if exists "coupons_select_active" on public.coupons;
create policy "coupons_select_active"
    on public.coupons for select
    using (is_active = true and (expires_at is null or expires_at > now()) or public.is_admin());

drop policy if exists "coupons_write_admin_only" on public.coupons;
create policy "coupons_write_admin_only"
    on public.coupons for all
    using (public.is_admin())
    with check (public.is_admin());

-- webhook_events / n8n_executions / n8n_dead_letters – admin read only
drop policy if exists "webhook_events_admin_read" on public.webhook_events;
create policy "webhook_events_admin_read"
    on public.webhook_events for select
    using (public.is_admin());

drop policy if exists "n8n_executions_admin_read" on public.n8n_executions;
create policy "n8n_executions_admin_read"
    on public.n8n_executions for select
    using (public.is_admin());

drop policy if exists "n8n_dead_letters_admin_read" on public.n8n_dead_letters;
create policy "n8n_dead_letters_admin_read"
    on public.n8n_dead_letters for select
    using (public.is_admin());

-- invoices
drop policy if exists "invoices_select_own_or_admin" on public.invoices;
create policy "invoices_select_own_or_admin"
    on public.invoices for select
    using (auth.uid() = student_id or public.is_admin());

drop policy if exists "invoices_write_admin_only" on public.invoices;
create policy "invoices_write_admin_only"
    on public.invoices for all
    using (public.is_admin())
    with check (public.is_admin());

-- Tighten course_tutors (was previously 'public read' with no write policy)
drop policy if exists "course_tutors_write_admin_only" on public.course_tutors;
create policy "course_tutors_write_admin_only"
    on public.course_tutors for all
    using (public.is_admin())
    with check (public.is_admin());
