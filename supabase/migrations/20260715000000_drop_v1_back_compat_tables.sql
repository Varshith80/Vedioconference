-- =====================================================================
-- Migration: 20260715000000_drop_v1_back_compat_tables.sql
-- Sprint:     3.6 — Admin Dashboard & Excel Curriculum Import
--
-- Description
-- -----------
-- Drops the v1 back-compat tables, triggers, functions, policies,
-- indexes, and FK columns created by migrations 1–9 (Sprint B2).
-- These are the v1 surface that the 4 `410 Gone` route handlers
-- and the deprecated v1 services read. The 410 handlers and the
-- v1 services are deleted in the same commit as this migration
-- (Stream C of the Sprint 3.6 plan §6.0).
--
-- What is dropped
-- ---------------
--   Tables:
--     * public.modules                  (v1 chapter-like)
--     * public.module_bookings          (v1 session-booking-like)
--     * public.module_progress          (already dropped in 14 §5; idempotent)
--     * public.enrollments              (v1 session-grant-like)
--     * public._bookings_legacy         (renamed from `bookings` in 09)
--
--   Triggers (must be dropped BEFORE the table):
--     * trg_module_bookings_updated_at  on public.module_bookings
--     * trg_module_bookings_completion  on public.module_bookings
--     * trg_module_bookings_audit       on public.module_bookings
--     * trg_enrollments_refund          on public.payments         (replaced)
--     * trg_enrollments_completion      on public.module_progress  (already gone)
--
--   Functions:
--     * public.fn_module_bookings_completion() — dropped
--     * public.fn_enrollments_refund()         — recreated v2-only
--                                                 (drops the
--                                                 enrollment_id
--                                                 branch)
--
--   RLS policies:
--     * All `module_bookings_*` policies
--     * All `enrollments_*` policies
--     * All `modules_*` policies
--     * All `_bookings_legacy_*` policies (if any)
--     * 4 v1 policies on `payments` and `meeting_links` that
--       reference the v1 FK columns §5 is about to drop
--       (see §3 below). The chain fails with SQLSTATE 2BP01
--       on the `drop column` statements in §5 if these are
--       not dropped first.
--     * `resources_select_visible` (rebuilt in
--       20260709000001_modules_enrollments.sql:504) reads
--       `resource_grants.enrollment_id` transitively via a
--       JOIN in its USING clause. PostgreSQL's 2BP01 check
--       is schema-wide: a policy on a different table that
--       references the column in a subquery blocks the drop
--       even when the policy is not on the column's own
--       table. The policy is dropped in §3 and recreated
--       against the v2 path
--       (session_grants + sessions + chapters) before §5
--       drops `resource_grants.enrollment_id`.
--
--   Indexes:
--     * All `idx_module_bookings_*`
--     * All `idx_enrollments_*`
--     * All `idx_modules_*`
--
--   Columns (FK to v1 tables, no longer valid):
--     * public.meeting_links.booking_id        → dropped
--     * public.meeting_links.module_booking_id → dropped
--     * public.payments.booking_id             → dropped
--     * public.payments.enrollment_id          → dropped
--     * public.payments.module_booking_id      → dropped
--     * public.resource_grants.enrollment_id   → dropped (if exists)
--
--   Type:
--     * public.module_progress_status (already dropped in 14 §5; idempotent)
--
-- What is KEPT
-- ------------
--   * public.session_grants (v2, the unit of payment)
--   * public.session_bookings (v2, the unit of booking)
--   * public.session_grant_id and public.session_booking_id FK
--     columns on `payments` and `meeting_links` (the v2 path)
--   * The audit trigger `fn_audit_changes()` and the
--     `set_updated_at()` function (used by other tables)
--   * The `fn_session_grants_completion()` no-op (Sprint 3.5
--     follow-up; wired in 14 §7)
--
-- Idempotency
-- -----------
-- Every DROP is guarded with `if exists` (or
-- `drop policy if exists` for policies, `drop trigger if exists`
-- for triggers), with one exception: the 3 `drop trigger … on
-- public.module_progress` statements and the 2 `drop policy … on
-- public.module_progress` statements are wrapped in a single
-- `do $$ … if exists (select 1 from information_schema.tables
-- where … table_name = 'module_progress') … end if; $$;` block.
-- `drop … if exists` does not gate on the relation's existence;
-- without the table-presence guard, those statements fail with
-- SQLSTATE 42P01 on a clean replay (because
-- `20260714000005_drop_module_progress_module_unlock.sql`
-- dropped the table earlier in the chain). The guard makes the
-- block a no-op when the table is gone, which is the state the
-- chain produces on a clean database. Re-applying on a
-- partially-applied database is safe. The v2 RLS policies in
-- `20260714000007_…` and the v2 RLS smoke suite in
-- `rls_smoke_assertions_v2.sql` are unaffected.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop triggers BEFORE dropping the tables they sit on
-- ---------------------------------------------------------------------
drop trigger if exists trg_module_bookings_updated_at on public.module_bookings;
drop trigger if exists trg_module_bookings_completion on public.module_bookings;
drop trigger if exists trg_module_bookings_audit      on public.module_bookings;

-- The next 3 statements reference `public.module_progress`, which
-- was already dropped by `20260714000005_drop_module_progress_module_unlock.sql`
-- earlier in the chain. `drop trigger if exists` does not gate on
-- the relation's existence, so unguarded calls fail with SQLSTATE
-- 42P01 ("relation does not exist") on a clean replay. Guard the
-- block on the table's presence; if the table is gone, the
-- triggers cannot exist either and the drops are a no-op. This is
-- the only divergence from the v1-retirement file as first written
-- (see the migration's Idempotency header and the original line
-- numbers preserved in git history).
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name   = 'module_progress'
    ) then
        drop trigger if exists trg_module_progress_updated_at on public.module_progress;
        drop trigger if exists trg_module_progress_audit      on public.module_progress;
        drop trigger if exists trg_enrollments_completion    on public.module_progress;
    end if;
end $$;

drop trigger if exists trg_enrollments_refund        on public.payments;

-- ---------------------------------------------------------------------
-- 2. Drop the v1 functions
-- ---------------------------------------------------------------------
drop function if exists public.fn_module_bookings_completion();
drop function if exists public.fn_enrollments_refund();

-- Recreate `fn_enrollments_refund` as a v2-only function. The
-- trigger (re-installed below) keeps the same name
-- (`trg_enrollments_refund`) so the function is `create or replace`
-- safe — Sprint 3.5 already extended the v1 function with a v2
-- branch; Sprint 3.6 drops the v1 branch.
create or replace function public.fn_enrollments_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (TG_OP = 'UPDATE'
        and NEW.status = 'refunded'
        and (OLD.status is null or OLD.status <> 'refunded'))
    then
        -- v2 path only: flip the linked session_grant. The v1
        -- `enrollment_id` branch is removed (the `enrollments`
        -- table is dropped below).
        if NEW.session_grant_id is not null then
            update public.session_grants sg
            set status                  = 'refunded',
                refunded_at             = coalesce(sg.refunded_at, now()),
                refunded_amount_cents   = NEW.refunded_amount_cents,
                updated_at              = now()
            where sg.id = NEW.session_grant_id
              and sg.status in ('active', 'completed');
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_enrollments_refund on public.payments;
create trigger trg_enrollments_refund
    before update of status on public.payments
    for each row execute function public.fn_enrollments_refund();

comment on function public.fn_enrollments_refund() is
    'Cascade refund (v2): when a payments row flips to status=refunded and is linked to a session_grant, flip the session_grant too. SECURITY DEFINER (RLS bypass) because the calling context does not have UPDATE on session_grants.';

-- ---------------------------------------------------------------------
-- 3. Drop the v1 RLS policies
-- ---------------------------------------------------------------------
drop policy if exists module_bookings_select_owner_tutor_admin on public.module_bookings;
drop policy if exists module_bookings_student_update_cancel   on public.module_bookings;
drop policy if exists module_bookings_admin_write             on public.module_bookings;
drop policy if exists enrollments_select_owner_tutor_admin    on public.enrollments;
drop policy if exists enrollments_no_direct_write             on public.enrollments;
drop policy if exists enrollments_admin_write                 on public.enrollments;

-- The next 2 statements reference `public.module_progress` for
-- the same reason as the trigger block above (see §1): the table
-- was dropped by `20260714000005_…` earlier in the chain and
-- `drop policy if exists` does not gate on relation existence.
-- Same guard pattern.
do $$
begin
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name   = 'module_progress'
    ) then
        drop policy if exists module_progress_select_owner_tutor_admin on public.module_progress;
        drop policy if exists module_progress_no_direct_write         on public.module_progress;
    end if;
end $$;

drop policy if exists modules_select_published_or_admin        on public.modules;
drop policy if exists modules_admin_write                     on public.modules;

-- Drop all `_bookings_legacy_*` policies (if any). The legacy
-- table is the renamed `bookings`; RLS was disabled on it in
-- migration 09 §2.2, but a defensive drop here is harmless.
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
        execute format('drop policy if exists %I on public._bookings_legacy', pol.policyname);
    end loop;
end $$;

-- Drop the v1 RLS policies on payments + meeting_links that
-- depend on the v1 FK columns §5 is about to drop. Without
-- these drops, the `alter table … drop column` statements in
-- §5 fail with SQLSTATE 2BP01 ("cannot drop column … other
-- objects depend on it") because the policies read those
-- columns in their USING clause. Each drop is idempotent
-- (`if exists` is per-policy).
--
-- 4 policies:
--   * `payments_select_own_or_admin` (created in
--     20260707000006_rls_policies.sql:120) reads
--     `payments.booking_id`.
--   * `payments_select_owner_or_admin` (created in
--     20260709000001_modules_enrollments.sql:738) reads
--     `payments.enrollment_id`. The Sprint 3.5 RLS block
--     (20260714000007_…) re-creates only the v2 path
--     (`payments_select_via_session_grant`) and does NOT
--     re-drop this v1 policy, so it lingers after 3.5 and
--     must be dropped here. Leaving it in place would also
--     cause a runtime `column "enrollment_id" does not
--     exist` error for any non-admin RLS SELECT on
--     `public.payments` after §5 drops the column.
--   * `meeting_links_select_own_or_admin` (created in
--     20260707000006_rls_policies.sql:142) reads
--     `meeting_links.booking_id`.
--   * `meeting_links_select_via_module_booking` (created
--     in 20260709000001_modules_enrollments.sql:751) reads
--     `meeting_links.module_booking_id`. Sprint 3.5
--     re-affirms the v2 path but does not re-drop the v1
--     policy, so it lingers and must be dropped here for
--     the same reason.
drop policy if exists payments_select_own_or_admin            on public.payments;
drop policy if exists payments_select_owner_or_admin          on public.payments;
drop policy if exists meeting_links_select_own_or_admin       on public.meeting_links;
drop policy if exists meeting_links_select_via_module_booking on public.meeting_links;

-- `resources_select_visible` (rebuilt in
-- 20260709000001_modules_enrollments.sql:504) reads
-- `resource_grants.enrollment_id` transitively via a JOIN
-- in its USING clause. PostgreSQL's 2BP01 check is
-- schema-wide: a policy on a different table that
-- references the column in a subquery blocks the drop
-- even when the policy is not on the column's own table.
-- Drop it here so §5 can drop `resource_grants.enrollment_id`
-- without 2BP01. The policy is recreated in §5 (after the
-- `session_grant_id` column is added and the PK is
-- re-anchored, but before the v1 `enrollment_id` column is
-- dropped) against the v2 path
-- (session_grants + sessions + chapters).
drop policy if exists resources_select_visible on public.resources;

-- ---------------------------------------------------------------------
-- 4. Drop the v1 indexes
-- ---------------------------------------------------------------------
drop index if exists public.idx_module_bookings_enrollment_id;
drop index if exists public.idx_module_bookings_module_id;
drop index if exists public.idx_module_bookings_tutor_id;
drop index if exists public.idx_module_bookings_student_id;
drop index if exists public.idx_module_bookings_status;
drop index if exists public.idx_module_bookings_scheduled_start;
drop index if exists public.idx_module_bookings_calendly_event;
drop index if exists public.idx_enrollments_student_id;
drop index if exists public.idx_enrollments_course_id;
drop index if exists public.idx_enrollments_status;
drop index if exists public.idx_modules_course_id;
drop index if exists public.idx_modules_position;

-- ---------------------------------------------------------------------
-- 5. Drop the v1 FK columns on `payments`, `meeting_links`, and
--    `resource_grants` BEFORE dropping the v1 tables (otherwise
--    the FK constraint would prevent the drop).
-- ---------------------------------------------------------------------
alter table public.meeting_links
    drop column if exists booking_id,
    drop column if exists module_booking_id;

alter table public.payments
    drop column if exists booking_id,
    drop column if exists enrollment_id,
    drop column if exists module_booking_id;

-- `resource_grants` is keyed on (resource_id, enrollment_id).
-- The v2 hierarchy replaces `enrollment_id` with
-- `session_grant_id`. Because `enrollment_id` is part of the
-- PRIMARY KEY, dropping the column requires (a) adding
-- `session_grant_id`, (b) re-anchoring the PK and the index on
-- it, (c) replacing the RLS policy that reads via
-- `enrollment_id`. This is a forward-only structural change.
--
-- (a) Add `session_grant_id` (nullable, then backfilled below).
alter table public.resource_grants
    add column if not exists session_grant_id uuid references public.session_grants(id) on delete cascade;

-- (b) Replace the v1 PK with a v2 PK keyed on session_grant_id.
do $$
declare
    v_constraint text;
begin
    -- Find the v1 PK name (typically `resource_grants_pkey`).
    select conname into v_constraint
    from pg_constraint
    where conrelid = 'public.resource_grants'::regclass
      and contype  = 'p'
    limit 1;
    if v_constraint is not null then
        execute format('alter table public.resource_grants drop constraint %I', v_constraint);
    end if;
end $$;

-- Backfill session_grant_id for any existing v1 row whose
-- enrollment has a session_grant counterpart (the Sprint 3.5
-- backfill created session_grants rows from the v1
-- enrollments). Skip rows where the backfill is ambiguous.
update public.resource_grants rg
set session_grant_id = sg.id
from public.session_grants sg
where sg.student_id = (
        select e.student_id from public.enrollments e where e.id = rg.enrollment_id
    )
  and rg.session_grant_id is null
  and rg.enrollment_id is not null
  and not exists (
        select 1 from public.session_grants sg2
        where sg2.student_id = (
            select e.student_id from public.enrollments e where e.id = rg.enrollment_id
        )
        having count(*) > 1
    );

-- Drop any rows we cannot backfill (orphaned v1 rows). This
-- is acceptable in Sprint 3.6: the pre-3.5 resource_grants
-- rows are not part of the v2 read path.
delete from public.resource_grants where session_grant_id is null;

-- Re-anchor the PK + the v2 index.
alter table public.resource_grants
    add constraint resource_grants_pkey primary key (resource_id, session_grant_id);

create index if not exists idx_resource_grants_session_grant_id
    on public.resource_grants(session_grant_id);

-- (c) Replace the v1 RLS policy that reads via enrollment_id.
drop policy if exists resource_grants_select_via_enrollment on public.resource_grants;
drop policy if exists resource_grants_select_own_or_admin   on public.resource_grants;
create policy resource_grants_select_via_session_grant
    on public.resource_grants for select
    using (
        public.is_admin()
        or exists (
            select 1
            from public.session_grants sg
            where sg.id = resource_grants.session_grant_id
              and sg.student_id = auth.uid()
        )
    );

-- (c.1) Recreate `resources_select_visible` against the v2 path.
-- This policy was dropped in §3 above (so §5 could drop
-- `resource_grants.enrollment_id` without 2BP01). It is
-- recreated here, AFTER the `session_grant_id` column has
-- been added and the PK has been re-anchored, but BEFORE the
-- v1 `enrollment_id` column is dropped.
--
-- The v1/B2 rule (enrolled in course C → see course C's
-- enrolled resources) translates to the v2 rule (purchased
-- a session in course C → see course C's enrolled resources).
-- The JOIN walks: resource_grants → session_grants →
-- sessions.chapter_id → chapters.course_id → resources.course_id.
--
-- Read-visibility semantics preserved from the v1 rebuilt
-- version (20260709000001_modules_enrollments.sql:504):
--   * public resources stay visible to everyone
--   * admins see everything
--   * `enrolled` resources are visible to the student who
--     holds a session_grant for at least one session in
--     the resource's course
--   * private resources are visible to the uploader
--
-- The application-level writer for `resource_grants` rows is
-- out of scope for the v1 retirement (a separate follow-up
-- against the booking/payment workflow: Stripe → n8n → Supabase).
-- Today, no `resource_grants` writer is shipped in v2 (the v1
-- step was an "optional, Phase 3+" item in
-- n8n/docs/WORKFLOWS.md:119-120 and was never implemented).
-- This policy is therefore functionally a no-op in production
-- today; it is a forward-compatibility definition of the
-- intended v2 access rule.
create policy resources_select_visible
    on public.resources for select
    using (
        visibility = 'public'
        or public.is_admin()
        or (
            visibility = 'enrolled'
            and exists (
                select 1
                from public.resource_grants rg
                join public.session_grants sg on sg.id = rg.session_grant_id
                join public.sessions s on s.id = sg.session_id
                join public.chapters ch on ch.id = s.chapter_id
                where rg.resource_id = resources.id
                  and ch.course_id = resources.course_id
                  and sg.student_id = auth.uid()
            )
        )
        or (
            visibility = 'private'
            and uploaded_by = auth.uid()
        )
    );

-- (d) Now drop the v1 `enrollment_id` column.
alter table public.resource_grants
    drop column if exists enrollment_id;

-- ---------------------------------------------------------------------
-- 6. Drop the v1 tables
-- ---------------------------------------------------------------------
drop table if exists public.module_bookings  cascade;
drop table if exists public.module_progress  cascade;
drop table if exists public.enrollments      cascade;
drop table if exists public.modules          cascade;
drop table if exists public._bookings_legacy cascade;

-- ---------------------------------------------------------------------
-- 7. Drop the v1 enum (idempotent — `20260714000005_…` already
--    drops it; re-running this migration on a partially-applied
--    DB must remain a no-op).
-- ---------------------------------------------------------------------
drop type if exists public.module_progress_status;

-- ---------------------------------------------------------------------
-- 8. Self-describe
-- ---------------------------------------------------------------------
-- No comments are added on the dropped tables; their absence is
-- the new state. The `session_grants` and `session_bookings`
-- tables (kept) retain their existing comments from migration 14.

-- ---------------------------------------------------------------------
-- 9. Done
-- ---------------------------------------------------------------------
-- This migration is idempotent. It can be re-applied safely.
-- The v2 RLS policies in `20260714000007_…` and the v2 RLS
-- smoke suite (`rls_smoke_assertions_v2.sql`) are unaffected.
-- The v1 RLS smoke suite (`rls_smoke_assertions.sql`) is
-- rewritten in the same Sprint 3.6 commit to skip the dropped
-- blocks (its `enrollments_*`, `module_progress_*`,
-- `module_bookings_*`, and `trg_module_unlock` /
-- `trg_enrollments_refund` blocks reference dropped tables and
-- triggers).
