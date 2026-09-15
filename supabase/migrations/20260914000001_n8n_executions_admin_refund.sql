-- =====================================================================
-- TASK 2.1 — Feature B refund financial-consistency repair.
--
-- Allow the admin server client to INSERT and UPDATE rows in
-- `n8n_executions` so the admin refund route can record the
-- outbound refund-enqueue attempt as a durable outbox.
--
-- Why this exists
-- ---------------
-- The current `executePackRefund()` (services/admin/pack-grants.ts)
-- silently swallows n8n 5xx / throw / URL-null and returns
-- HTTP 200 with the session_grants row pre-flipped to
-- 'refunded'. That means the database claims the refund
-- succeeded when Stripe has not been contacted.
--
-- The corrected flow:
--   1. Admin route reads the pack grant.
--   2. Computes the refund preview (€35 × unused, capped at amount paid).
--   3. Inserts an `n8n_executions` row with `status='started'`,
--      `run_id = refund_request_id` (UNIQUE — at-most-once-on-enqueue).
--   4. POSTs to n8n.
--   5. Stamps `n8n_executions.status='completed' | 'failed'` based on
--      the n8n response.
--   6. Returns HTTP 200 (`completed`) / 502 (`failed`) / 503 (`webhookUrl` null).
--
-- The database MUST NOT pre-flip `session_grants.status='refunded'`.
-- The Stripe `charge.refunded` webhook + `fn_enrollments_refund`
-- cascade trigger remains the SOLE authoritative writer of the
-- grant's refunded status and amount. Stripe confirmation is
-- observed by the application as `payments.status='refunded'`.
--
-- RLS design (locked architecture preserved)
-- -----------------------------------------
-- The new policies are gated by `public.is_admin()` — the existing
-- admin helper (SECURITY DEFINER, returns true only when the
-- caller's profile.role is 'admin' or 'super_admin'). This is
-- the same authorization gate the inbound n8n route uses when
-- it writes to n8n_executions via the service-role client, and
-- the same gate `requireAdminRoute` enforces server-side before
-- the refund service runs.
--
-- Concretely:
--   - students (role='student')     → fail `is_admin()` → INSERT/UPDATE blocked.
--   - tutors   (role='tutor')       → fail `is_admin()` → INSERT/UPDATE blocked.
--   - anonymous (no auth.uid())     → fail `is_admin()` → INSERT/UPDATE blocked.
--   - admin / super_admin (role=)   → pass `is_admin()`  → INSERT/UPDATE allowed.
--   - service_role                   → bypasses RLS by Postgres design;
--                                     the inbound n8n route already writes
--                                     n8n_executions via this boundary.
--
-- The migration does NOT widen the surface to non-admin
-- authenticated users. The migration does NOT introduce a
-- service-role bypass on the admin refund path. The existing
-- project authorization architecture is preserved.
--
-- Forward-only. Idempotent (`drop policy if exists` + create).
-- Local Supabase only. No remote apply.
-- =====================================================================

drop policy if exists n8n_executions_admin_insert on public.n8n_executions;
create policy n8n_executions_admin_insert
    on public.n8n_executions for insert
    to authenticated
    with check (public.is_admin());

drop policy if exists n8n_executions_admin_update on public.n8n_executions;
create policy n8n_executions_admin_update
    on public.n8n_executions for update
    to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- No DELETE policy: n8n_executions is append/audit-only. Admin
-- cannot delete refund-execution rows.
