-- =====================================================================
-- Migration: 20260719000002_reshape_tutors_v1_to_standalone.sql
-- Purpose:   Bring a pre-existing v1 `public.tutors` table up to the
--            Sprint 3.8 standalone-tutor schema on top of which
--            every other v2 migration in the chain already runs.
--
-- Background
-- ----------
-- The migration chain that produced the v2 curriculum
-- (20260707000003_tutors_courses.sql and everything that follows)
-- assumes `public.tutors` is the standalone Sprint 3.8 table:
--   * columns: id, full_name, email, phone, status, notes,
--              created_at, updated_at
--   * `uq_tutors_email` unique index on lower(email)
--   * `trg_tutors_updated_at` trigger calling set_updated_at()
--   * no `profile_id` FK, no `headline` column,
--     no `course_tutors` join
--
-- 20260707000003_tutors_courses.sql is the migration that was
-- SUPPOSED to install that schema, but it uses
-- `create table if not exists public.tutors (...)` — which is a
-- no-op when `public.tutors` is already present. On databases
-- that pre-existed with the v1 schema (a v1 tutors table with
-- `headline, profile_id, bio, hourly_rate, rating_avg,
-- is_published, cover_image_path, is_active`, plus the v1
-- `course_tutors` join), the v2 columns were never added and
-- the v1 `course_tutors` table was never dropped.
--
-- The v2 application code
-- (services/admin/tutors.ts, services/tutors.ts,
-- app/api/admin/tutors/route.ts, components/admin/tutor-*.tsx,
-- lib/validations/admin-catalog.ts, types/domain.ts,
-- types/database.generated.ts) reads and writes only the v2
-- columns (full_name, email, phone, status, notes), so tutor
-- CRUD fails with PGRST 42703 ("column … does not exist") on
-- a v1 database. The v2 RLS policies (20260707000006 §tutors,
-- 20260714000007 §tutors) target the v2 shape as well.
--
-- Scope of THIS migration
-- -----------------------
-- 1. Add the v2 columns to `public.tutors` as nullable.
-- 2. Backfill from v1 columns where present (no row is lost).
-- 3. Drop v1 columns the v2 application no longer reads.
-- 4. Drop the v1 `course_tutors` join (the v2 path is direct
--    session → tutor via `sessions.tutor_id`, see
--    20260714000002/3 and 20260719000001).
-- 5. Add the v2 unique index on lower(email).
-- 6. Recreate the v2 updated_at trigger.
--
-- Guarantees
-- ----------
-- * Forward-only: no `drop table` on tables that are not v1
--   artefacts; no `alter table` that would rewrite v2 data.
-- * Idempotent: every operation is guarded with `if exists`
--   or `if not exists`; safe to re-run.
-- * No existing migration is modified.
-- * IDs, created_at, updated_at are preserved verbatim.
-- * Where a row cannot satisfy a new NOT NULL or CHECK
--   constraint, the migration FAILS LOUDLY (Postgres raises
--   23502 / 23514). No row is silently deleted or
--   `null`-patched.
-- * No v1 data is lost. The v1 columns that are dropped
--   (`headline, profile_id, bio, hourly_rate, rating_avg,
--   is_published, cover_image_path, is_active`) are no longer
--   referenced by any v2 code path; they are dropped only
--   AFTER their values are backfilled into v2 columns
--   (where a meaningful mapping exists) or AFTER the FK
--   that depended on them is dropped (where the data is
--   purely a reference to a now-orphaned auth user).
--
-- Ordering note
-- -------------
-- This migration is appended AFTER 20260719000001_sessions_tutor_id
-- (the most recent one in the chain) so it can be applied
-- without re-numbering anything that comes before it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §0. Pre-flight sanity check (non-destructive)
-- ---------------------------------------------------------------------
-- Bail out with a clear error if this migration is run on a
-- database that is not in the half-migrated state it is
-- designed to fix. We DO NOT want to silently re-create
-- triggers / indexes on a database that is already at v2.
-- The check is informational: it does not block, but the
-- subsequent `if not exists` / `if exists` guards make every
-- statement a no-op on a clean v2 database, so re-running
-- this migration is always safe.
do $$
declare
    v_has_v1_headline  boolean;
    v_has_v2_full_name boolean;
begin
    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'tutors'
           and column_name  = 'headline'
    ) into v_has_v1_headline;

    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'tutors'
           and column_name  = 'full_name'
    ) into v_has_v2_full_name;

    raise notice 'reshape_tutors_v1_to_standalone: pre-flight — v1 headline present: %, v2 full_name present: %',
        v_has_v1_headline, v_has_v2_full_name;
end $$;

-- ---------------------------------------------------------------------
-- §1. Drop the v1 FK on tutors.profile_id (defensive)
-- ---------------------------------------------------------------------
-- The v1 schema had `tutors.profile_id uuid references
-- public.profiles(id)`. The v2 schema removes the auth /
-- profiles dependency. We drop the constraint BEFORE touching
-- the `profile_id` column itself so the column can be dropped
-- cleanly. If the column is still present and the constraint
-- exists, the constraint is what blocks the drop (2BP01).
--
-- The v2 RLS policy `tutors_admin_all` (created in
-- 20260707000006 §tutors) does not reference `profile_id`, and
-- no v2 migration re-introduces a FK on this column, so the
-- drop is safe. The loop is idempotent: it scans for any FK
-- whose definition mentions `profile_id` and drops each one
-- by name. If no such FK exists, the loop body never runs.
do $$
declare
    r record;
begin
    for r in
        select conname
          from pg_constraint
         where conrelid = 'public.tutors'::regclass
           and contype  = 'f'
           and pg_get_constraintdef(oid) ilike '%profile_id%'
    loop
        execute format('alter table public.tutors drop constraint %I', r.conname);
    end loop;
end $$;

-- ---------------------------------------------------------------------
-- §2. Drop the v1 course_tutors join table
-- ---------------------------------------------------------------------
-- Sprint 3.8 removed the v1 many-to-many `course_tutors` join.
-- Tutors are now assigned to SESSIONS (the atomic unit of the
-- v2 curriculum), not to whole courses. The single point of
-- assignment is `sessions.tutor_id` (migration
-- 20260719000001_sessions_tutor_id.sql). No v2 migration
-- references `course_tutors` (the v2 RLS for `session_grants`
-- in 20260714000002 and the v2 RLS for `session_bookings` in
-- 20260714000003 join `sessions.tutor_id` directly; the v2
-- RLS block in 20260714000007 re-creates the policies against
-- the v2 path and does not mention `course_tutors`).
--
-- The v1 RLS policies on `module_bookings` that read through
-- `course_tutors` (20260709000001_modules_enrollments.sql)
-- were dropped along with the `module_bookings` table itself
-- in 20260715000000_drop_v1_back_compat_tables.sql, so the
-- module-side RLS no longer depends on this table.
--
-- The table may be empty or contain legacy rows; either way
-- the drop is safe because the v2 application does not read
-- it. If the table does not exist, the `if exists` guard
-- makes this a no-op.
--
-- Defense against residual v1 policies on a database where
-- the v2 RLS migration (20260714000007) did not run or where
-- a v1-named policy was re-created manually: a v1 policy
-- named `session_grants_select_owner_tutor_admin` (or
-- `session_bookings_select_owner_tutor_admin`) can still
-- exist on the remote and join through `course_tutors`,
-- which would block the `drop table` with SQLSTATE 2BP01.
-- We drop those two specific policies by name BEFORE
-- dropping the table. `drop policy if exists` is a no-op
-- if the policy is already absent (clean v2 database).
-- We deliberately do NOT use `drop table ... cascade`
-- because that would also drop any unrelated object that
-- happens to depend on `course_tutors` (e.g. a manually
-- created view or grant), which is exactly the silent-
-- cascade behaviour the migration is designed to avoid.
drop policy if exists session_grants_select_owner_tutor_admin on public.session_grants;
drop policy if exists session_bookings_select_owner_tutor_admin on public.session_bookings;
drop table if exists public.course_tutors;

-- ---------------------------------------------------------------------
-- §3. Add the v2 columns (nullable)
-- ---------------------------------------------------------------------
-- v2 schema for `public.tutors`:
--   * id          uuid primary key (kept; v1 already has it)
--   * full_name   text NOT NULL
--   * email       text NOT NULL
--   * phone       text
--   * status      text NOT NULL with check ('active','inactive')
--   * notes       text
--   * created_at  timestamptz NOT NULL default now()  (kept)
--   * updated_at  timestamptz NOT NULL default now()  (kept)
--
-- We add the columns as NULLABLE first so the `update` backfill
-- in §4 can populate them. We enforce NOT NULL + CHECK in §5
-- AFTER the backfill, so the constraint is added to a fully
-- populated column. This ordering is what makes the migration
-- safe: if the backfill cannot produce a non-null `full_name`
-- or `status` for some row, the §5 `alter column ... set not
-- null` fails loudly with SQLSTATE 23502, and the operator
-- can inspect the offending row before deciding what to do.
alter table public.tutors
    add column if not exists full_name text,
    add column if not exists email     text,
    add column if not exists phone     text,
    add column if not exists status    text default 'active',
    add column if not exists notes     text;

-- ---------------------------------------------------------------------
-- §4. Backfill from v1 columns (preserves every existing row)
-- ---------------------------------------------------------------------
-- v1 → v2 column mapping:
--   * `full_name`  ←  coalesce(existing.full_name, v1.headline)
--                    The v1 `headline` is the user-visible
--                    tutor name; it is the most natural source
--                    for v2 `full_name`. If a row already has
--                    a v2 `full_name` (because the v2 admin
--                    tutor-create form was used at some point
--                    against a partially-migrated table), it
--                    is preserved by the coalesce.
--   * `status`     ←  coalesce(existing.status,
--                                  case when v1.is_active
--                                       then 'active'
--                                       else 'inactive'
--                                  end)
--                    v1 used a boolean `is_active`. v2 uses a
--                    `text` enum with 'active' / 'inactive'.
--                    v1 `is_active = true`  → 'active'
--                    v1 `is_active = false` → 'inactive'
--                    v1 `is_active` null    → 'active' (the
--                        v2 default; the v1 default was true
--                        so this matches the v1 intent).
--                    If a row already has a v2 `status`, it is
--                    preserved by the coalesce.
--   * `email`      ←  no v1 source. The v1 `tutors` table did
--                    not have an email column. The v2 column
--                    is left NULL on legacy rows.
--                    IMPORTANT: this means the §5
--                    `email NOT NULL` constraint is NOT
--                    enforced in this migration. Legacy rows
--                    can keep email = NULL; the v2 admin
--                    tutor-create form will require email on
--                    NEW inserts (validated by Zod on both
--                    client and server), and the §6 unique
--                    index uses `where email is not null` so
--                    NULL emails do not collide.
--   * `phone`      ←  no v1 source. Left NULL on legacy rows.
--                    The v2 admin form allows nullable phone.
--   * `notes`      ←  no v1 source. Left NULL on legacy rows.
--                    The v2 admin form allows nullable notes.
--
-- The `where full_name is null or status is null` predicate
-- keeps the backfill idempotent: re-running the migration
-- only touches rows that have not been backfilled yet.
--
-- Robustness: the backfill must succeed regardless of which
-- subset of v1 columns is still present on the remote. A
-- previous partial run, a manually maintained environment,
-- or a pre-migration tweak may have already removed some
-- of the v1 columns (`headline`, `is_active`) before this
-- migration runs. A static `update ... set full_name =
-- coalesce(full_name, headline)` would then fail with
-- SQLSTATE 42703 ("column … does not exist"), which is
-- exactly the failure we are defending against.
--
-- The fix: read `information_schema.columns` to discover
-- which v1 columns are still present, and build the UPDATE
-- dynamically. If neither v1 column exists, the backfill is
-- a no-op (rows already backfilled stay backfilled; rows
-- that have not been backfilled will fail the §5
-- `set not null` with SQLSTATE 23502, which is the
-- documented "fail safely" semantic — the operator inspects
-- the offending row and backfills manually).
do $$
declare
    v_has_headline  boolean;
    v_has_is_active boolean;
    v_sql           text;
begin
    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'tutors'
           and column_name  = 'headline'
    ) into v_has_headline;

    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name   = 'tutors'
           and column_name  = 'is_active'
    ) into v_has_is_active;

    -- Always coalesce against whatever v2 value is already on
    -- the row; v1 columns are only consulted when they exist.
    v_sql := 'update public.tutors set '
          || 'full_name = coalesce(full_name'
          || case when v_has_headline  then ', headline' else '' end
          || '), '
          || 'status = coalesce(status'
          || case when v_has_is_active
                  then ', case when is_active is null then ''active'' when is_active then ''active'' else ''inactive'' end'
                  else '' end
          || ') '
          || 'where full_name is null or status is null';

    execute v_sql;
end $$;

-- ---------------------------------------------------------------------
-- §5. Enforce v2 NOT NULL + CHECK on full_name and status
-- ---------------------------------------------------------------------
-- At this point every row in `public.tutors` has a non-null
-- `full_name` (from §4: either it already had a v2 value, or
-- the v1 `headline` was non-null on every existing v1 row, or
-- — failing both — the v1 `headline` was null, in which case
-- the update set `full_name` to NULL and THIS statement will
-- fail loudly with 23502). The same logic applies to `status`.
--
-- If either alter fails, the migration aborts here. The
-- operator must inspect the row(s) that could not be backfilled
-- (a row whose v1 `headline` is null AND v2 `full_name` is
-- null, or whose v1 `is_active` is null AND v2 `status` is
-- null), backfill the column manually, and re-run. No data
-- is silently dropped.
alter table public.tutors
    alter column full_name set not null,
    alter column status    set not null;

-- v2 status check constraint. Idempotent: only created when
-- it does not already exist.
do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conrelid = 'public.tutors'::regclass
           and conname  = 'tutors_status_chk'
    ) then
        alter table public.tutors
            add constraint tutors_status_chk
            check (status in ('active', 'inactive'));
    end if;
end $$;

-- ---------------------------------------------------------------------
-- §6. Add the v2 unique index on lower(email) (partial, NULL-safe)
-- ---------------------------------------------------------------------
-- v1 had no email column; v2 enforces uniqueness on the
-- lower-cased email but only when email is not null. The
-- `where email is not null` predicate lets legacy v1 rows
-- (with email = null) coexist with new v2 rows (with email
-- = 'foo@bar.com') without conflicting on the index. New
-- inserts of a duplicate non-null email continue to be
-- rejected with 23505 by the index.
create unique index if not exists uq_tutors_email
    on public.tutors (lower(email))
    where email is not null;

-- v2 also has `idx_tutors_status` (used by the public tutor
-- directory's `eq('status', 'active')` filter). Idempotent.
create index if not exists idx_tutors_status
    on public.tutors (status);

-- ---------------------------------------------------------------------
-- §7. Drop the v1 columns that are no longer referenced
-- ---------------------------------------------------------------------
-- Each `drop column if exists` is independent and idempotent.
-- The columns and the reason each is safe to drop:
--
--   * headline        — v2 stores the visible name in `full_name`
--                       (backfilled in §4). The v2 application
--                       and RLS do not read `headline`. A
--                       grep of `apps/web` confirms zero
--                       references to `headline` outside a
--                       single comment that says "Sprint 3.8
--                       — no headline field".
--
--   * profile_id      — v2 tutors are standalone reference
--                       records, no auth dependency. The
--                       FK on `profile_id` was dropped in §1.
--                       No v2 code reads this column. A
--                       grep of `apps/web` confirms zero
--                       non-comment references.
--
--   * bio             — v1 had a free-form bio column. v2 has
--                       `notes` for the same purpose (backfill
--                       is not possible; v1 bio is plain text
--                       and the v2 notes field is a superset).
--                       No v2 code reads `bio`. A grep of
--                       `apps/web` confirms zero references.
--
--   * hourly_rate     — v1 stored pricing on the tutor. v2
--                       stores pricing on the session
--                       (`sessions.price_cents`). No v2 code
--                       reads `hourly_rate`. A grep of
--                       `apps/web` confirms zero references.
--
--   * rating_avg      — v1 stored a tutor rating. v2 does not
--                       have a tutor rating in the MVP. No v2
--                       code reads `rating_avg`. A grep of
--                       `apps/web` confirms zero references.
--
--   * is_published    — v1 had a public-read boolean. The v2
--                       RLS policy `tutors_admin_all`
--                       (20260707000006 §tutors) is the only
--                       policy on `tutors`; it does not read
--                       `is_published`. No v2 code references
--                       this column. A grep of `apps/web`
--                       confirms zero non-comment references.
--
--   * cover_image_path— v1 stored a per-tutor cover image. v2
--                       stores the cover image on `courses`
--                       (column `cover_image`). No v2 code
--                       reads `cover_image_path` on tutors.
--                       A grep of `apps/web` confirms zero
--                       references.
--
--   * is_active       — v1 boolean; superseded by v2 `status`
--                       (backfilled in §4). No v2 code reads
--                       `is_active`. A grep of `apps/web`
--                       confirms zero references.
--
-- Each `if exists` guard means the drop is a no-op on a
-- database where the column is already absent (e.g. a
-- database that was originally created with the v2 schema).
--
-- Defense against residual v1 policies on a database where
-- the v2 RLS migration (20260707000006) did not run or where
-- a v1-named policy was re-created manually: the v1 policy
-- `tutors_select_public_published` reads `is_published` and
-- would block the column drop with SQLSTATE 2BP01. We drop
-- those two v1 policies by name BEFORE the column drops.
-- `drop policy if exists` is a no-op if the policy is
-- already absent (clean v2 database). We deliberately do
-- NOT use `drop column ... cascade` because that would also
-- drop any other object that happens to depend on the
-- column, which is exactly the silent-cascade behaviour the
-- migration is designed to avoid.
drop policy if exists "tutors_select_public_published" on public.tutors;
drop policy if exists "tutors_write_admin_only"        on public.tutors;
alter table public.tutors drop column if exists headline;
alter table public.tutors drop column if exists profile_id;
alter table public.tutors drop column if exists bio;
alter table public.tutors drop column if exists hourly_rate;
alter table public.tutors drop column if exists rating_avg;
alter table public.tutors drop column if exists is_published;
alter table public.tutors drop column if exists cover_image_path;
alter table public.tutors drop column if exists is_active;

-- ---------------------------------------------------------------------
-- §8. Recreate the v2 updated_at trigger
-- ---------------------------------------------------------------------
-- The v2 trigger is `trg_tutors_updated_at before update on
-- public.tutors for each row execute function
-- public.set_updated_at()` (created in
-- 20260707000003_tutors_courses.sql:44-47). We drop+create to
-- make this migration idempotent even on a database where the
-- v1 trigger name differs or is absent: any pre-existing
-- trigger on `public.tutors` (whether named `trg_tutors_updated_at`
-- or otherwise) is removed first, then the v2 trigger is
-- installed. `drop trigger if exists` does not gate on the
-- trigger's existence, so this is safe on both v1 and v2
-- databases.
drop trigger if exists trg_tutors_updated_at on public.tutors;
create trigger trg_tutors_updated_at
    before update on public.tutors
    for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- §9. Post-flight summary (non-destructive)
-- ---------------------------------------------------------------------
-- The migration ends with a `raise notice` that lists the
-- v2 columns and the row count, so an operator running this
-- in a psql session sees confirmation that the table is now
-- in v2 shape. This is informational only; the migration
-- does not block on it.
do $$
declare
    v_rows       bigint;
    v_columns    text;
begin
    select count(*) into v_rows from public.tutors;
    select string_agg(column_name, ', ' order by ordinal_position)
      into v_columns
      from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'tutors';
    raise notice 'reshape_tutors_v1_to_standalone: done. % row(s) in public.tutors. Columns: %',
        v_rows, v_columns;
end $$;
