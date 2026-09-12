-- Migration: 20260912000002_add_meeting_links_recording_url.sql
--
-- Sprint:     11 (R-3)
--
-- Adds the `recording_url` column to `public.meeting_links`. The
-- column is populated by the Zoom `recording.completed` →
-- n8n `zoom-recording-completed` → `POST /api/webhooks/zoom/`
-- write-back pipeline (R-3). The column is nullable: a Zoom
-- meeting that has not yet recorded (host has cloud recording
-- disabled, or the recording is still processing) is a valid
-- state and the absence of a URL must read as "not available
-- yet", not as a write failure.
--
-- Why this is the smallest correct schema change.
--
--   1. ONE column, nullable, no default. No
--      `recording_completed_at`, no `recording_files`, no
--      `recording_download_url`, no metadata sidecar columns.
--      The only requirement is "where does the share_url go";
--      the answer is the column itself.
--   2. NO new index. Lookups are by `meeting_id`, which
--      already has an index from
--      `20260707000004_bookings_payments.sql` (`idx_meeting_links_booking_id`
--      on the original `booking_id`; the existing
--      `meeting_id` lookup uses that table's natural key).
--      If a later sprint needs an index on
--      `recording_url` (e.g. for an admin "find sessions
--      with recordings" query), it is a separate migration.
--   3. NO new RLS policy. The existing
--      `meeting_links_select_via_session_booking` policy
--      (created in
--      `20260714000007_rls_policies_curriculum_v2.sql`,
--      section 2.7) is column-agnostic and already covers
--      the new column for student-via-booking reads and
--      admin reads. The companion
--      `meeting_links_write_admin_only` (FOR ALL) covers
--      the route's service-role write at the policy level
--      (route uses the service-role client per
--      `app/api/webhooks/**`).
--   4. NO new GRANT. The `authenticated` role already
--      holds `SELECT` on `public.meeting_links` (per
--      `20260911000003_grant_authenticated_select_meeting_links.sql`).
--      INSERT/UPDATE/DELETE for the new column flow
--      through the service-role admin client used by
--      `app/api/webhooks/**`; the column inherits the
--      table-level ACL. No new GRANT is required.
--   5. NO trigger. The route is the only writer; a
--      trigger would be a duplicate write surface.
--
-- Forward-only and idempotent.
--
-- The `if not exists` guard makes the column-add a no-op
-- on a database that already has it. Per CLAUDE.md §3.2
-- (migrations are forward-only; never edit an applied
-- migration; new SQL changes ship as new files), this is
-- a brand-new file — it does not amend any applied
-- migration.
--
-- Naming rationale.
--
--   - Timestamp `20260912000002` (one after
--     `20260912000001_session_bookings_select_policy.sql`):
--     same date, second file of the day. The lexicographic
--     sort matches the chronological sort.
--   - Slug `add_meeting_links_recording_url`: matches the
--     project's "add_<table>_<column>" convention (cf.
--     `20260709000001_modules_enrollments.sql` which adds
--     `module_booking_id` to `meeting_links`).
--
-- The /api/webhooks/zoom/ route (Slice 11-C) and the
-- n8n/workflows/zoom-recording-completed.json workflow
-- (Slice 11-D) reference this column. They cannot ship
-- before this migration lands. The route is a no-op
-- against a database that does not yet have the column
-- (the `select recording_url` path returns no row, the
-- `update recording_url` write targets a missing column
-- and errors) — which is the correct behaviour: the
-- route's write-back is meaningful only after this
-- migration is applied.

-- =====================================================================
-- 1. Add the column.
-- =====================================================================
alter table public.meeting_links
    add column if not exists recording_url text;

-- =====================================================================
-- 2. Document the column.
-- =====================================================================
comment on column public.meeting_links.recording_url is
    'Zoom cloud recording share_url. Populated by the
     recording.completed → n8n zoom-recording-completed →
     POST /api/webhooks/zoom/ write-back pipeline
     (Sprint 11 R-3). NULL until the host enables cloud
     recording AND the recording processing completes.
     The read-path surface (student /dashboard/sessions/[id]
     and the admin session-booking detail page) renders
     this URL when non-null and "Recording not available
     yet" when null. The column has no default; the
     absence of a URL is a valid steady state and must
     not be coerced to an empty string.';
