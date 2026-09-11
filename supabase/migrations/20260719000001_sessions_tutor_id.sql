-- 20260719000001_sessions_tutor_id.sql
-- Sprint 3.8 — Admin Manual CRUD plan §3. Adds a dedicated
-- assigned-tutor FK on the v2 sessions table.
--
-- Rationale
--   The v2 sessions table (migration 20260714000001) has no
--   tutor column. The session_bookings.tutor_id column records
--   who actually taught a given booking (already there from
--   20260714000003). The Admin needs to pre-assign a tutor to
--   a Session so the Admin Bookings page can immediately show
--   which tutor is responsible for any future booking on that
--   session, and so the createSessionBooking() flow can default
--   a booking's tutor_id from the parent session.
--
-- Schema
--   The new column is NULLable so every Excel-imported session
--   (none of which have a tutor assigned) remains valid; the
--   admin can backfill via the new /admin/sessions/[id] form.
--
-- RLS
--   The existing v2 RLS policies on `sessions` (migration
--   20260714000007) already grant admins full SELECT/INSERT/
--   UPDATE/DELETE. The new column is covered by the admin
--   UPDATE policy without a policy rewrite.
--
-- FK
--   `on delete set null`: deleting a tutor (e.g. archiving
--   them) must not cascade-delete all their assigned sessions.
--   Sessions become unassigned and the admin can reassign.

alter table public.sessions
  add column if not exists tutor_id uuid
    references public.tutors(id) on delete set null;

-- Partial index: most sessions are unassigned, so a full index
-- would be wasteful. The WHERE clause makes the index 100%
-- useful for the admin "tutor directory" join.
create index if not exists idx_sessions_tutor_id
  on public.sessions (tutor_id)
  where tutor_id is not null;

comment on column public.sessions.tutor_id is
  'Admin-assigned tutor for the session. Nullable: a session can be unassigned at creation time and backfilled later. Bookings inherit this tutor via createSessionBooking() (default), but each session_booking row stores its own tutor_id for historical immutability.';
