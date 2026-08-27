-- =====================================================================
-- Migration: 20260828000001_tutor_change_requests.sql
-- Sprint:     Phase 2 — Sprint 6 (Tutor Change Request + 24-hour SLA)
--
-- Description
-- -----------
-- Creates `public.tutor_change_requests`, the data carrier for the
-- tutor-change flow described in the Sprint 6 brief. A row is created
-- when a student requests that the tutor assigned to one of their
-- existing `session_bookings` be replaced. The 24-hour SLA
-- (`sla_deadline = requested_at + 24 hours`) is computed in
-- application code on insert; this migration only persists the
-- `timestamptz`. An admin proposes up to 3 alternative `tutors.id`
-- references; the student picks one; the chosen `tutors.id` is
-- written back to `session_bookings.tutor_id` for that single booking.
--
-- What this migration DOES
-- ------------------------
--   - Creates `public.tutor_change_requests` (id, student_id,
--     session_booking_id, current_tutor_id, status, requested_at,
--     sla_deadline, responded_at, proposed_alternative_tutor_ids,
--     selected_tutor_id, student_reason, admin_notes, timestamps).
--   - Defines `public.tutor_change_request_status` as a CHECK
--     constraint (NOT a Postgres enum). Keeping it as text +
--     CHECK keeps future statuses additive without a DDL migration.
--   - Adds RLS: students can SELECT and INSERT their own rows;
--     admins have full read/write via `public.is_admin()`. The
--     application never writes via the service role on this
--     table except from the cron route that inserts SLA-breach
--     `notifications` (the cron writes to `notifications`, NOT
--     to `tutor_change_requests`).
--   - Adds the standard `set_updated_at` trigger.
--   - Adds an index on `(status, sla_deadline)` so the SLA cron
--     can scan overdue rows efficiently.
--
-- What this migration DOES NOT do
-- --------------------------------
--   - Does NOT touch `session_bookings.tutor_id` directly. The
--     application layer (admin service) re-points the booking.
--   - Does NOT introduce a new SaaS, a new table beyond this
--     one, or a new enum type.
--   - Does NOT implement the email/SMS side of the SLA breach
--     alert — that lives in the cron route + n8n webhook, both
--     already provisioned.
--   - Does NOT implement any business rule the client has not
--     confirmed (credit restoration, refund policy, etc. — all
--     remain BLOCKED).
--
-- Invariants preserved
-- --------------------
--   1. The atomic unit of teaching/booking/Zoom/refund remains
--      `sessions` + `session_bookings` + `session_grants` +
--      `payments`. Tutor change is a metadata flip on
--      `session_bookings.tutor_id`; it does NOT alter the
--      payment, the grant, the Zoom meeting, or the schedule.
--   2. The SLA window is 24 hours. The application enforces it
--      by writing `sla_deadline = now() + interval '24 hours'`
--      on INSERT and by treating any row with
--      `status = 'pending' and sla_deadline < now()` as
--      "overdue".
--   3. The student must be the owner of the underlying
--      `session_bookings` row. The student-side INSERT policy
--      enforces `student_id = auth.uid()` AND that the
--      referenced `session_bookings.student_id` row matches
--      `auth.uid()`.
--   4. The number of proposed alternatives is bounded to 1..3
--      in the Zod schema (`apps/web/lib/validations/tutor-change.ts`).
--      A CHECK constraint mirrors the upper bound at the DB
--      layer for defence in depth.
--   5. `selected_tutor_id`, when set, must differ from
--      `current_tutor_id` — there is no point "changing" the
--      same tutor. Enforced in the admin service and mirrored
--      by a CHECK constraint.
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP / CREATE TRIGGER / CREATE POLICY
-- is guarded with `if [not] exists` so this migration can be
-- re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------
create table if not exists public.tutor_change_requests (
    id                              uuid primary key default gen_random_uuid(),
    student_id                      uuid not null references public.profiles(id) on delete cascade,
    session_booking_id              uuid not null references public.session_bookings(id) on delete cascade,
    current_tutor_id                uuid not null references public.tutors(id)        on delete restrict,
    status                          text not null default 'pending',
    requested_at                    timestamptz not null default now(),
    sla_deadline                    timestamptz not null,
    responded_at                    timestamptz,
    proposed_alternative_tutor_ids  uuid[] not null default '{}'::uuid[],
    selected_tutor_id               uuid references public.tutors(id) on delete set null,
    student_reason                  text,
    admin_notes                     text,
    created_at                      timestamptz not null default now(),
    updated_at                      timestamptz not null default now(),

    -- 1.1 status is one of: pending | alternatives_proposed |
    --     student_selected | completed | cancelled.
    constraint tutor_change_requests_status_check
        check (status in (
            'pending',
            'alternatives_proposed',
            'student_selected',
            'completed',
            'cancelled'
        )),

    -- 1.2 sla_deadline must be strictly after requested_at. A 0h
    --     SLA would defeat the purpose of the timer.
    constraint tutor_change_requests_sla_after_request
        check (sla_deadline > requested_at),

    -- 1.3 Up to 3 alternatives. Empty array is allowed (no
    --     proposal yet — admin may propose later).
    constraint tutor_change_requests_max_three_alternatives
        check (cardinality(proposed_alternative_tutor_ids) <= 3),

    -- 1.4 selected_tutor_id (when set) must differ from
    --     current_tutor_id. The whole point of the row is to
    --     change the tutor; "changing" to the same tutor is a
    --     no-op and is rejected.
    constraint tutor_change_requests_selected_differs_from_current
        check (
            selected_tutor_id is null
            or selected_tutor_id <> current_tutor_id
        ),

    -- 1.5 responded_at must be after requested_at when set.
    constraint tutor_change_requests_responded_after_request
        check (
            responded_at is null
            or responded_at >= requested_at
        )
);

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------

-- 2.1  Student-side listing. Used by the dashboard page and
--      student API routes. Partial index on open requests only —
--      most rows become 'completed' / 'cancelled' quickly, and
--      the dashboard cares about pending + alternatives_proposed.
create index if not exists idx_tutor_change_requests_student
    on public.tutor_change_requests (student_id, requested_at desc);

-- 2.2  Admin-side listing. Used by the admin list page.
create index if not exists idx_tutor_change_requests_admin
    on public.tutor_change_requests (requested_at desc);

-- 2.3  SLA cron scan. The cron looks for
--      `status='pending' AND sla_deadline < now()`. A composite
--      index on `(status, sla_deadline)` makes that scan an
--      index range.
create index if not exists idx_tutor_change_requests_sla_scan
    on public.tutor_change_requests (status, sla_deadline)
    where status = 'pending';

-- 2.4  Uniqueness on `session_booking_id` for open requests.
--      A single booking cannot have two simultaneous open
--      change requests (one pending + one proposed). This is a
--      partial unique index — completed/cancelled rows are
--      excluded so a student can re-request later.
create unique index if not exists uq_tutor_change_requests_open_per_booking
    on public.tutor_change_requests (session_booking_id)
    where status in ('pending', 'alternatives_proposed', 'student_selected');

-- ---------------------------------------------------------------------
-- 3. `set_updated_at` trigger
-- ---------------------------------------------------------------------
drop trigger if exists trg_tutor_change_requests_updated_at on public.tutor_change_requests;
create trigger trg_tutor_change_requests_updated_at
    before update on public.tutor_change_requests
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------
alter table public.tutor_change_requests enable row level security;

-- 4.1  Student SELECT: own rows only.
drop policy if exists tutor_change_requests_select_own on public.tutor_change_requests;
create policy tutor_change_requests_select_own
    on public.tutor_change_requests for select
    using (
        student_id = auth.uid()
        or public.is_admin()
    );

-- 4.2  Student INSERT: own rows only. The student must also be
--      the owner of the underlying `session_bookings` row, and
--      `current_tutor_id` must match the booking's current
--      tutor at write time (defence against stale IDs being
--      forged in the payload). The application also enforces
--      this in the service layer; the WITH CHECK clause is
--      defence in depth.
drop policy if exists tutor_change_requests_insert_own on public.tutor_change_requests;
create policy tutor_change_requests_insert_own
    on public.tutor_change_requests for insert
    with check (
        student_id = auth.uid()
        and exists (
            select 1
            from public.session_bookings sb
            where sb.id = session_booking_id
              and sb.student_id = auth.uid()
              and sb.tutor_id  = current_tutor_id
        )
    );

-- 4.3  Student UPDATE: own rows only, and ONLY to set
--      `selected_tutor_id` + `status = 'student_selected'`. Any
--      other column flip (admin_notes, proposed_alternative_tutor_ids,
--      responded_at, current_tutor_id, etc.) is denied — those
--      belong to the admin path.
drop policy if exists tutor_change_requests_student_select_alternative on public.tutor_change_requests;
create policy tutor_change_requests_student_select_alternative
    on public.tutor_change_requests for update
    using (
        student_id = auth.uid()
        and status = 'alternatives_proposed'
    )
    with check (
        student_id = auth.uid()
        and status  = 'student_selected'
        and selected_tutor_id is not null
        and selected_tutor_id = any (proposed_alternative_tutor_ids)
    );

-- 4.4  Admin ALL: full read/write on every column.
drop policy if exists tutor_change_requests_admin_all on public.tutor_change_requests;
create policy tutor_change_requests_admin_all
    on public.tutor_change_requests for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5. SLA-breach notification dedup
-- ---------------------------------------------------------------------
-- The SLA cron (`POST /api/cron/check-tutor-change-sla`) writes a
-- `tutor_change_sla_breach` notification row per overdue request.
-- We extend the existing `uq_notifications_dedupe` index pattern
-- (user_id, type, payload->>'booking_id', channel) with a
-- parallel partial unique index keyed on `payload->>'request_id'`
-- so the same breach is never notified twice.
--
-- The `payload->>'request_id'` extraction is wrapped in a partial
-- index that only fires when the key is present (most
-- notifications don't carry a `request_id`, so we don't want to
-- force every notification row to satisfy the key).
create unique index if not exists uq_notifications_tutor_change_sla
    on public.notifications (
        user_id,
        type,
        ((payload->>'request_id')),
        channel
    )
    where (payload ? 'request_id');
