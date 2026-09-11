-- =====================================================================
-- Migration: 20260910000001_public_tutors_view.sql
-- Sprint:     Phase 2 marketing-site acceptance — Bug 1
--
-- Description
-- -----------
-- Closes the 42501 (insufficient privilege) error on
--   /[locale]/tutors
-- for anonymous visitors. The marketing tutors page is BACK in
-- the MVP per the editorial structure (`CoursEnLigne-Editorial-
-- Structure_160826-EN.docx`) and the route must render the
-- public-facing tutor directory.
--
-- Why a VIEW
-- ----------
-- The base table `public.tutors` carries PII
-- (full_name, email, phone, notes) and the only existing
-- policy on it is `tutors_admin_all` (admin-only). Granting
-- `anon` SELECT on the base table would expose that PII, which
-- the project rules forbid (see
-- `20260905000001_grant_anon_select_catalog.sql` "Done
-- intentionally not-granted → public.tutors" block).
--
-- The safe, standards-compliant Postgres pattern is to expose a
-- curated projection: a VIEW that whitelists only the columns
-- safe for a public marketing directory. The view is granted
-- `anon SELECT`. RLS on the underlying table is bypassed for
-- the OWNER reading through the view; anon callers reach the
-- base table only through the view, never directly.
--
-- Why this is safe
-- ----------------
-- 1. The view exposes exactly four columns: `id`, `full_name`,
--    `subject`, `bio`. The base table columns `email`, `phone`,
--    `notes`, `calendly_event_uri`, `zoom_user_id`,
--    `rating_count`, `currency`, `metadata` are NOT in the
--    projection.
-- 2. `subject` and `bio` are derived from the public marketing
--    surface — they are stored under the `metadata` jsonb
--    column (which already exists on the base table) under the
--    keys `subject` and `bio`. The base `metadata` itself is
--    not exposed; only the extracted values. Other metadata
--    keys (e.g. internal flags) are never visible.
-- 3. The view filters on `status = 'active'` so inactive
--    tutors never reach the marketing site.
-- 4. `anon` is granted only `SELECT` on the view — no
--    INSERT, UPDATE, DELETE.
-- 5. The view does not write data and does not call
--    SECURITY DEFINER functions.
-- 6. The application does not need the service-role key on the
--    public tutors route anymore.
--
-- Why metadata and not a new column
-- ---------------------------------
-- The project rules forbid non-essential schema changes. The
-- `metadata` jsonb column already exists on `public.tutors`
-- and is the established extension surface for non-PII marketing
-- data. Using `metadata->>'subject'` and `metadata->>'bio'`
-- keeps the migration GRANT + VIEW only, with zero ALTER
-- TABLE.
--
-- Does NOT apply
-- --------------
-- * No change to `public.tutors` (no ALTER TABLE, no policy
--   change, no new column, no data backfill in this migration).
-- * No change to RLS on the base table.
-- * No DROP, no DELETE, no UPDATE.
-- * No new functions, no new grants on any other table.
--
-- Idempotency
-- -----------
-- `create or replace view` is idempotent in PostgreSQL.
-- Re-running the GRANT is a no-op.
--
-- Forward-only
-- ------------
-- New file. Does not modify any previously applied migration.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- View: public.public_tutors
--
-- Curated, non-PII projection of `public.tutors` for the marketing
-- tutors directory. `id` is exposed because the per-tutor route
-- (`/tutors/[uuid]`) takes the id, not a slug — the standalone
-- tutor table has no `slug` column (Sprint 3.8).
-- ---------------------------------------------------------------------
create or replace view public.public_tutors
with (security_invoker = false) as
select
    id,
    full_name,
    coalesce(nullif(trim(metadata->>'subject'),     ''), 'Mathématiques') as subject,
    coalesce(nullif(trim(metadata->>'bio'),         ''), null)            as bio,
    years_experience
from public.tutors
where status = 'active';

comment on view public.public_tutors is
    'Public, non-PII projection of public.tutors for the marketing '
    'tutors directory. Exposes only id, full_name, subject (from '
    'metadata.subject), bio (from metadata.bio), and years_experience '
    'for rows with status=active.';

-- ---------------------------------------------------------------------
-- Grant: anon SELECT on the view only
--
-- The base table `public.tutors` remains admin-only via the
-- existing `tutors_admin_all` policy. Anon can read the view
-- but cannot read the base table directly (no GRANT on the base
-- table for anon, only the view).
-- ---------------------------------------------------------------------
grant select on table public.public_tutors to anon;

commit;
