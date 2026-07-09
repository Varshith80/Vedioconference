# Sprint B2 — RLS smoke tests

This directory holds the Row Level Security smoke test for the
module-based booking model added in Sprint B2.

## Files

| File | Purpose |
|---|---|
| `rls_smoke_setup.sql` | Idempotent fixture. Inserts 4 test users (admin / tutor / 2 students), 1 published course + module, 2 enrollments, 1 booking, 1 payment, 1 meeting link, 1 resource + grant. All rows are namespaced with stable UUIDs that the assertions reference. |
| `rls_smoke_assertions.sql` | The actual smoke test. For each B2 RLS policy, impersonates a user (admin / tutor / student A / student B) and asserts the expected row visibility. Prints `PASS` lines, raises an exception on the first failure. |
| `rls_smoke_teardown.sql` | Optional cleanup. Deletes every row the fixture inserted, in FK-respecting order. |

## How to run

The tests are SQL scripts, not Vitest. Run them with `psql`
against the live Supabase database using the service-role
connection. A CI wrapper lives in `scripts/rls-smoke.sh`.

```bash
# 1. Set DATABASE_URL to the Supabase direct connection
#    (NOT the pooler — we need DDL + service-role access).
export DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres"

# 2. Apply the fixture + assertions.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_setup.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_assertions.sql

# 3. Tear down (leaves the database clean).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_smoke_teardown.sql
```

`-v ON_ERROR_STOP=1` causes `psql` to exit non-zero on the
first raised exception. The assertions file uses
`raise exception 'FAIL …'` on every mismatch, so a CI run
fails the pipeline on the first failed policy.

## What is tested

For each RLS policy added or changed in
`supabase/migrations/20260709000001_modules_enrollments.sql`:

| Policy | Table | Asserted |
|---|---|---|
| `modules_select_published_or_admin` | `modules` | Student sees published; student does NOT see unpublished; admin sees both |
| `modules_admin_write` | `modules` | (Implicit — see §1 of `rls_smoke_assertions.sql`.) |
| `enrollments_select_owner_tutor_admin` | `enrollments` | Student sees own; tutor sees both for their course; admin sees all |
| `enrollments_no_direct_write` | `enrollments` | Student `INSERT` is rejected with `insufficient_privilege` |
| `module_progress_select_owner_tutor_admin` | `module_progress` | Owner / tutor / admin visibility |
| `module_bookings_select_owner_tutor_admin` | `module_bookings` | Owner / tutor / admin visibility |
| `module_bookings_student_update_cancel` | `module_bookings` | Student can self-cancel; cannot reassign `student_id` |
| `payments_select_owner_or_admin` | `payments` | Enrollment-owner / admin visibility |
| `meeting_links_select_via_module_booking` | `meeting_links` | Module-booking-owner / admin visibility |
| `resource_grants_select_via_enrollment` | `resource_grants` | Enrollment-owner / admin visibility |
| `resources_select_visible` (rebuilt) | `resources` | Enrolled-resource visible to the granted student; not to other students |

## Idempotency

The setup script uses `on conflict do nothing` everywhere, so
re-running it does not duplicate rows. The assertions are
**not** idempotent in the strict sense (a re-run after a
successful run will still pass because every count is an
absolute number, but the self-cancel in §6 leaves the row in
`status = 'cancelled'`; a second run will still pass because
the cancel re-asserts the policy, not the status).

If you want a clean re-run, run `rls_smoke_teardown.sql` first
to restore the canonical fixture state.

## Why a separate test harness

RLS only fires on queries made as a non-superuser. The Vitest
unit tests in `apps/web/tests/unit/` run as the test process
and bypass RLS; they would not exercise these policies. A live
SQL harness is the smallest tool that proves the policy chain
(`auth.uid()` → `request.jwt.claim.sub` → `profiles.role` →
`is_admin()`) end-to-end.

The harness is **read-only** with respect to real data: the
fixture is namespaced and the teardown removes every row it
inserts. Running it against production is safe.
