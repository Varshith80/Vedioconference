-- =====================================================================
-- Migration: 20260915000001_student_tutor_change_events.sql
-- Sprint:     Phase 2 — Sprint 6.5 (Feature G — Student 24h Cooldown)
--
-- Description
-- -----------
-- Adds the per-student cooldown audit table + the BEFORE INSERT
-- trigger that prevents a new tutor-change request while the
-- student is in cooldown.
--
-- The cooldown is GLOBAL per student and starts ONLY after a
-- SUCCESSFUL tutor reassignment (student `selectAlternative`
-- path OR admin `resolveRequest` with `selected_tutor_id`).
-- Submitted requests, rejected requests, cancelled requests, and
-- failed reassignments do NOT start the cooldown.
--
-- The contract is:
--   - one row in `public.student_tutor_change_events` per
--     successful reassignment, keyed by `request_id` (UNIQUE)
--   - the student cannot INSERT a new `tutor_change_requests`
--     row while the most-recent event for them is within the
--     previous 24 hours. The DB enforces this server-side via
--     `trg_student_tutor_change_events_cooldown` BEFORE INSERT.
--   - students can SELECT their own events; no INSERT/UPDATE/
--     DELETE policy for `authenticated` (writes flow through
--     the service-role admin client inside the student/admin
--     service layer, which the route layer already calls).
--
-- What this migration DOES
-- ------------------------
--   - Creates `public.student_tutor_change_events` (id,
--     student_id, booking_id, from_tutor_id, to_tutor_id,
--     request_id, changed_at) + the CHECK `from_tutor_id <>
--     to_tutor_id`.
--   - Creates two indexes:
--       * per-student-changed-at descending (most-recent lookup);
--       * UNIQUE on request_id (idempotency: a retried RPC
--         produces at most one event per request).
--   - Enables RLS with a single policy: students can SELECT
--     their own events. No INSERT/UPDATE/DELETE for
--     authenticated; service-role writes only.
--   - Adds `fn_student_tutor_change_events_cooldown()` and the
--     BEFORE INSERT trigger `trg_student_tutor_change_events_cooldown`
--     on `public.tutor_change_requests` that raises SQLSTATE
--     `P0001` with message
--     `tutor_change_cooldown_active:<remaining_ms>` when the
--     student is in cooldown. The route layer catches `P0001`
--     and translates it to HTTP 409
--     `code: 'tutor_change_cooldown_active'` with
--     `details: { next_eligible_at, remaining_ms, last_changed_at }`.
--
-- What this migration DOES NOT do
-- --------------------------------
--   - Does NOT modify the existing `tutor_change_requests`
--     schema (table, indexes, RLS policies, status CHECK,
--     `set_updated_at` trigger) or any other tutor_change
--     column. The existing admin 24h response SLA (B8) is
--     independent and is preserved verbatim.
--   - Does NOT introduce a new enum, a new top-level
--     directory, a new SaaS, a new env var, or a new GRANT
--     beyond the table RLS policy above.
--   - Does NOT touch the remote Supabase project. This file
--     ships locally; the remote apply is an operator action
--     gated on user instruction.
--
-- Invariants preserved
-- --------------------
--   1. Atomic unit of teaching/booking/Zoom/refund remains
--      `sessions` + `session_bookings` + `session_grants` +
--      `payments`. The cooldown table is audit-only.
--   2. Existing admin 24h SLA (B8) lives on
--      `tutor_change_requests.sla_deadline`. Untouched.
--   3. The student remains the owner of the new request: the
--      trigger reads `student_id` from the booking referenced
--      by `new.booking_id` and raises with that student — no
--      cross-table write.
--   4. Idempotency: the UNIQUE index on `request_id` is the
--      only at-most-once primitive; the cooldown service uses
--      it via the SQLSTATE 23505 catch. The BEFORE INSERT
--      trigger is independent of the table and fires on
--      `tutor_change_requests`, not on the events table.
--   5. Race-safety: the trigger fires inside the transaction
--      that performs the INSERT, so a parallel INSERT and
--      trigger read sees the same snapshot — no TOCTOU window
--      at the table layer. The application layer adds an
--      advisory lock + an atomic RPC for belt-and-braces
--      (see `apps/web/services/student/tutor-change-cooldown.ts`).
--
-- Idempotency
-- -----------
-- Every CREATE / ALTER / DROP / CREATE TRIGGER / CREATE POLICY
-- is guarded with `if [not] exists` so this migration can be
-- re-applied safely.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The audit table
-- ---------------------------------------------------------------------
create table if not exists public.student_tutor_change_events (
    id              uuid primary key default gen_random_uuid(),
    student_id      uuid not null references public.profiles(id)         on delete cascade,
    booking_id      uuid not null references public.session_bookings(id) on delete cascade,
    from_tutor_id   uuid not null references public.tutors(id),
    to_tutor_id     uuid not null references public.tutors(id),
    request_id      uuid not null references public.tutor_change_requests(id) on delete cascade,
    changed_at      timestamptz not null default now(),

    -- 1.1  Sanity: a "change" must change something. Mirrors the
    --      `tutor_change_requests_selected_differs_from_current`
    --      CHECK on the parent table.
    constraint student_tutor_change_events_tutor_differs
        check (from_tutor_id <> to_tutor_id)
);

-- ---------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------

-- 2.1  Per-student lookup. Most-recent first. The cooldown
--      service issues a single-row `order by changed_at desc
--      limit 1` lookup against this index.
create index if not exists idx_student_tutor_change_events_student_changed_at
    on public.student_tutor_change_events (student_id, changed_at desc);

-- 2.2  Idempotency. One event per request. The cooldown
--      service catches SQLSTATE 23505 (unique_violation) and
--      translates it to `ok: false, code: 'already_recorded'`.
create unique index if not exists uq_student_tutor_change_events_request_id
    on public.student_tutor_change_events (request_id);

-- ---------------------------------------------------------------------
-- 3. Row-Level Security
-- ---------------------------------------------------------------------
alter table public.student_tutor_change_events enable row level security;

-- 3.1  Student SELECT: own events only. RLS uses
--      `(select auth.uid())` (the `auth.uid()` is wrapped in
--      a `select` to make it init-plan-friendly and to match
--      the project's standard policy idiom).
drop policy if exists stc_events_select_own
    on public.student_tutor_change_events;
create policy stc_events_select_own
    on public.student_tutor_change_events
    for select
    to authenticated
    using (student_id = (select auth.uid()));

-- 3.2  No INSERT/UPDATE/DELETE policy for authenticated.
--      Writes flow through the service-role admin client
--      inside `apps/web/services/student/tutor-change-cooldown.ts`
--      (which the student + admin route layers already
--      import). The admin client is restricted to webhook +
--      register + cooldown per the existing layer rules
--      (FolderStructure.md). The trigger in §4 also writes
--      via SECURITY DEFINER; it has no INSERT policy of its
--      own — it is invoked by the INSERT on
--      `tutor_change_requests` and only reads from
--      `student_tutor_change_events` (no write).

-- ---------------------------------------------------------------------
-- 4. BEFORE INSERT trigger — server-side cooldown gate
-- ---------------------------------------------------------------------
-- The trigger fires inside the INSERT transaction on
-- `tutor_change_requests`. It reads the most-recent event
-- for the student (resolved via the booking's `student_id`)
-- and raises P0001 if the student is still in cooldown.
--
-- Why this trigger exists.
--   The application layer (`assertNoCooldown` + advisory
--   lock + atomic RPC) is the primary gate. The trigger is
--   the un-bypassable backstop — any future code path that
--   inserts into `tutor_change_requests` (a SQL client, an
--   admin script, a webhook) is subject to the same gate
--   without having to remember to call the service.
--
-- Why it raises P0001 (raise_exception).
--   P0001 is the SQLSTATE for `RAISE EXCEPTION`. The route
--   layer inspects `error.code === 'P0001'` and translates
--   the message (which encodes `remaining_ms` after the
--   colon) into the 409 envelope with the required timing
--   details.
create or replace function public.fn_student_tutor_change_events_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id       uuid;
    v_last_changed_at  timestamptz;
    v_remaining_ms     bigint;
    v_cooldown_ms      constant bigint := 24 * 60 * 60 * 1000;
begin
    -- Resolve the student from the booking referenced by this
    -- request. `session_booking_id` is NOT NULL on the request
    -- table; if it is somehow missing we let the FK error fire.
    select sb.student_id into v_student_id
      from public.session_bookings sb
     where sb.id = new.session_booking_id;

    if v_student_id is null then
        return new;
    end if;

    select max(changed_at) into v_last_changed_at
      from public.student_tutor_change_events
     where student_id = v_student_id;

    if v_last_changed_at is not null then
        v_remaining_ms := v_cooldown_ms
                        - (extract(epoch from (now() - v_last_changed_at)) * 1000)::bigint;
        if v_remaining_ms > 0 then
            raise exception 'tutor_change_cooldown_active:%', v_remaining_ms
                using errcode = 'P0001';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_student_tutor_change_events_cooldown
    on public.tutor_change_requests;
create trigger trg_student_tutor_change_events_cooldown
    before insert on public.tutor_change_requests
    for each row execute function public.fn_student_tutor_change_events_cooldown();

comment on function public.fn_student_tutor_change_events_cooldown()
    is 'BEFORE INSERT trigger on tutor_change_requests: rejects inserts while the student is in the 24h post-reassignment cooldown window. SQLSTATE P0001 with message tutor_change_cooldown_active:<remaining_ms>.';
comment on trigger trg_student_tutor_change_events_cooldown on public.tutor_change_requests
    is 'Server-side enforcement of the per-student 24h cooldown. Independent of the application layer.';
