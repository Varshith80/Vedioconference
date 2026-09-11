-- =====================================================================
-- Migration: 20260720000001_restore_tutors_admin_all_policy.sql
-- Purpose:   Repair migration — restore the v2 admin-only RLS policy
--            on `public.tutors` that was created by
--            20260707000006_rls_policies.sql §tutors but is missing
--            on the remote database.
--
-- Background
-- ----------
-- `public.tutors` was reshaped from a v1 (auth-linked) table to the
-- v2 standalone reference-record table by 20260719000002. On the
-- remote, after that reshape, the table has:
--
--   * relrowsecurity = true  (RLS is enabled)
--   * pg_policy row count = 0  (no policy attached)
--
-- That is an inconsistent state: with RLS enabled and no policy,
-- every row is invisible AND every write is rejected with
-- SQLSTATE 42501 ("new row violates row-level security policy").
-- That is the exact 403 the admin is hitting on POST /api/admin/tutors
-- (tutor-create form).
--
-- Why the policy is missing: the v2 RLS for `public.tutors` was
-- installed exactly once, in 20260707000006_rls_policies.sql lines
-- 58-61. The reshape migration (20260719000002) deliberately does
-- NOT recreate it — it only drops v1-named policies by name
-- (`tutors_select_public_published`, `tutors_write_admin_only`) as
-- a defensive guard against 2BP01 during the column drops. No
-- other migration in the chain (`20260714000007` curriculum v2
-- RLS, `20260715000000` v1 back-compat drops) touches
-- `public.tutors` policies either. A grep of every migration for
-- `on public.tutors` confirms only two files reference the table:
--
--   20260707000006_rls_policies.sql       creates `tutors_admin_all`
--   20260719000002_reshape_tutors_v1_to_standalone.sql
--                                          drops v1-named policies
--                                          (defensive, no recreate)
--
-- So the policy is either (a) was never actually created on the
-- remote even though the migration is recorded in
-- supabase_migrations.schema_migrations, or (b) was dropped
-- manually outside the migration history. The operator confirmed
-- via a direct SQL probe that the policy row is absent; the
-- migration history is not consulted here.
--
-- Scope of THIS migration
-- -----------------------
-- 1. Drop `tutors_admin_all` if it exists (idempotent: no-op when
--    the policy is already correct, e.g. on a database that was
--    re-mirrored from a clean source).
-- 2. Recreate `tutors_admin_all` verbatim from
--    20260707000006_rls_policies.sql:58-61.
-- 3. Defensive: ensure RLS is enabled on `public.tutors`
--    (`enable row level security` is itself idempotent — it
--    no-ops when RLS is already on).
--
-- Guarantees
-- ----------
-- * Forward-only: this is a NEW migration; no existing migration
--   is modified. The chain order is preserved
--   (20260719000002 → 20260720000001).
-- * Idempotent: every operation is guarded (`drop policy if
--   exists`, `enable row level security` is a no-op when RLS is
--   already on). Safe to re-run.
-- * Minimum blast radius: only `public.tutors` is touched. No
--   other table, no other policy, no schema change. The v2
--   application code (services/admin/tutors.ts:createTutor and
--   app/api/admin/tutors/route.ts:POST) already expects RLS to
--   allow admins to insert; once the policy is in place, the
--   tutor-create flow returns to 201.
-- * No data is touched. No row is rewritten, no column is
--   altered. This migration installs exactly one row in
--   `pg_policy` (the recreated `tutors_admin_all`).
--
-- Ordering note
-- -------------
-- Numbered 20260720000001 to follow 20260719000002 (the most
-- recent migration in the chain). Today's date is 2026-07-20.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §1. Drop the v2 policy if it already exists (idempotent).
-- ---------------------------------------------------------------------
-- `drop policy if exists` is a no-op when the policy is absent
-- (the broken-remote case) and removes any partial/stale version
-- before recreating. Mirrors the
-- `drop policy if exists "tutors_select_public_published"`
-- pattern in 20260707000006 §tutors.
drop policy if exists "tutors_admin_all" on public.tutors;

-- ---------------------------------------------------------------------
-- §2. Recreate the v2 policy verbatim from 20260707000006:58-61.
-- ---------------------------------------------------------------------
-- Single policy covers SELECT, INSERT, UPDATE, DELETE (`for all`).
-- USING clause gates reads and writes; WITH CHECK clause gates
-- inserts and updates. Both call `public.is_admin()`, which is a
-- SECURITY DEFINER function defined in
-- 20260707000001_extensions_and_helpers.sql and is unchanged
-- in this migration chain. The admin's JWT has been confirmed
-- (via impersonation test on the remote) to satisfy
-- `public.is_admin() = true`, so this policy will admit the
-- tutor-create POST.
create policy "tutors_admin_all"
    on public.tutors for all
    using (public.is_admin())
    with check (public.is_admin());

-- ---------------------------------------------------------------------
-- §3. Defensive: ensure RLS is enabled on public.tutors.
-- ---------------------------------------------------------------------
-- The remote already has relrowsecurity = true, so this is a
-- no-op there. On a clean re-mirror where RLS was somehow
-- disabled, this restores the lock. `enable row level security`
-- is itself idempotent: a second call on a table that already
-- has RLS on returns without error.
alter table public.tutors enable row level security;

-- ---------------------------------------------------------------------
-- §4. Post-flight summary (non-destructive).
-- ---------------------------------------------------------------------
-- Emits a notice so the operator running this in psql sees
-- confirmation that the policy is now in place. This is
-- informational only; the migration does not block on it.
do $$
declare
    v_policy_count integer;
    v_rls_enabled  boolean;
begin
    select count(*)
      into v_policy_count
      from pg_policy
     where polrelid = 'public.tutors'::regclass
       and polname  = 'tutors_admin_all';

    select relrowsecurity
      into v_rls_enabled
      from pg_class
     where oid = 'public.tutors'::regclass;

    raise notice 'restore_tutors_admin_all_policy: done. tutors_admin_all present: %, RLS enabled: %',
        (v_policy_count = 1), v_rls_enabled;
end $$;
