# Database Migrations Index

> **Every forward-only migration in the `supabase/migrations/` directory,
> listed in the order they must be applied.** A new migration is never
> edited in place; it is added as a new file with a higher
> `YYYYMMDDhhmmss_` prefix. **No migration has been applied yet on the
> remote environment** — the project is awaiting the first `db push`.

## 1. Migration list

| # | Filename | Adds / changes | RLS impact | Status |
|---|----------|----------------|------------|--------|
| 1 | `20260707000001_extensions_and_helpers.sql` | Required PG extensions (`pgcrypto`, `citext`, `pg_stat_statements`); the `is_admin()` / `is_super_admin()` / `current_role()` security-definer helpers; a `set_updated_at()` trigger helper. | Sets the helper functions that RLS policies call. | ⏳ pending |
| 2 | `20260707000002_profiles_and_roles.sql` | `public.profiles` (1:1 with `auth.users`), `user_role` enum (`student` / `admin` / `super_admin` — **`tutor` removed in Sprint 3.8** because tutors are no longer users), `handle_new_user` trigger that mirrors every `auth.users` insert into `profiles`. | RLS not yet enabled (later migrations). | ⏳ pending |
| 3 | `20260707000003_tutors_courses.sql` | **Sprint 3.8 — standalone tutor model.** `public.tutors` is a flat reference table: `id, full_name, email (unique), phone, status (active/inactive), notes, created_at, updated_at`. No `profile_id`, no FK to `auth.users` or `profiles`. Drops the v1 `course_tutors` M:N join. `public.courses` (slug, subject, level, price_cents, currency, is_published, calendly_event_uri, cover_image_path). | FK + indexes only. | ⏳ pending |
| 4 | `20260707000004_bookings_payments.sql` | v1 booking flow: `enrollments` (paid course access), `bookings` (v1), `payments` (Stripe ledger), `meeting_links` (Zoom). Will be replaced in Sprint 3.5. | FK + indexes. | ⏳ pending |
| 5 | `20260707000005_resources_notifications_audit.sql` | `resources` (course material), `resource_grants`, `notifications` (in-app + email mirror), `audit_logs` (append-only mutation log), `webhook_events` (idempotency). | FK + indexes. | ⏳ pending |
| 6 | `20260707000006_rls_policies.sql` | First round of RLS policies on all v1 tables: profile-scoped reads, admin UPDATE/DELETE via `is_admin()`. | **Enables RLS** on every public table. | ⏳ pending |
| 7 | `20260707000007_storage_buckets.sql` | Three Supabase Storage buckets: `avatars`, `course-covers`, `resources`. Storage policies mirror the DB RLS. | Storage layer. | ⏳ pending |
| 8 | `20260707000008_subscriptions_billing.sql` | `subscriptions` (recurring billing ledger), `stripe_events` (raw event log), `webhook_events` v2 additions. | No new RLS. | ⏳ pending |
| 9 | `20260709000000_booking_status_scheduled.sql` | Extends the booking-status enum with `'scheduled'`. Brings v1 bookings into the scheduled workflow. | No new RLS. | ⏳ pending |
| 10 | `20260709000001_modules_enrollments.sql` | Adds the v1 `modules` (course atoms) and the per-enrollment `module_progress` table. **Both will be dropped in migration #23** in favor of the v2 curriculum. | FK + indexes. | ⏳ pending |
| 11 | `20260709000010_courses_prerequisite_for_seed_migration.sql` | Adds the `courses.prerequisite_course_id` self-FK that the demo seed needs. | FK + index. | ⏳ pending |
| 12 | `20260710000000_enrollments_refund_trigger.sql` | Adds the `enrollments_refund_status_sync` trigger so the `refunded` status flows to a `refunded_at` timestamp. | No new RLS. | ⏳ pending |
| 13 | `20260710000001_module_unlock.sql` | Adds the `module_unlock` helper + the trigger that unlocks the next module when the current one is `completed`. **Will be dropped in migration #23.** | No new RLS. | ⏳ pending |
| 14 | `20260710000002_seed_demo_courses_with_modules.sql` | Seeds three demo courses (high-school maths, physics-chemistry, prep-school maths) with modules. Dev-only; gated by `app.settings.seed_demo = true`. | No RLS. | ⏳ pending |
| 15 | `20260714000000_programs_grades.sql` | **Sprint 3.5 — v2 curriculum begins.** Creates `programs` (the new top-level "level" entity), `grades` (program → grade link), and rewires `courses` to point at a `program_id` + `grade_id`. Backfills the existing courses. | FK + indexes. | ⏳ pending |
| 16 | `20260714000001_chapters_sessions.sql` | Creates `chapters` (course children) and `sessions` (chapter children, the new atomic booking unit). Drops the old `modules` table. | FK + indexes. | ⏳ pending |
| 17 | `20260714000002_session_grants.sql` | Creates `session_grants` (paid access to a single session — replaces `enrollments` for the v2 model). | FK + indexes. | ⏳ pending |
| 18 | `20260714000003_session_bookings_meeting_links_payments.sql` | Creates `session_bookings` (live-session lifecycle), rewires `meeting_links` and `payments` to point at `session_bookings` / `session_grants`, drops `module_progress`, drops `module_bookings` (if it was created). | FK + indexes. | ⏳ pending |
| 19 | `20260714000004_backfill_curriculum_hierarchy.sql` | Backfills programs / grades / chapters / sessions from the existing v1 demo data so the v2 tree is non-empty on day one. | No RLS. | ⏳ pending |
| 20 | `20260714000005_drop_module_progress_module_unlock.sql` | Drops the v1 `module_progress` table and the `module_unlock` trigger. Both are superseded by `session_grants`. | Removes unused RLS. | ⏳ pending |
| 21 | `20260714000006_seed_demo_chapters_sessions.sql` | Seeds demo chapters + sessions so the v2 tree is non-empty. | No RLS. | ⏳ pending |
| 22 | `20260714000007_rls_policies_curriculum_v2.sql` | Adds the v2 RLS policies on `programs`, `grades`, `chapters`, `sessions`, `session_grants`, `session_bookings`. | **New RLS for the v2 tables.** | ⏳ pending |
| 23 | `20260715000000_drop_v1_back_compat_tables.sql` | Final v1 retirement: drops `_bookings_legacy`, drops `enrollments`, drops `module_bookings`, drops any other v1 back-compat artifacts. | Removes now-dead RLS. | ⏳ pending |
| 24 | `20260719000001_sessions_tutor_id.sql` | **Sprint 3.8** — adds `sessions.tutor_id uuid NULL` with `ON DELETE SET NULL` + a partial index. This is the column the Admin "Assigned Tutor" picker writes to. RLS already covers UPDATE on `sessions`. | No new policy needed. | ⏳ pending |

## 2. How to apply (one-shot, dev only)

```bash
# 1. Start the local Supabase stack (if not already running).
supabase start

# 2. Reset the local DB to a clean state, then apply every
#    forward-only migration in filename order.
supabase db reset

# 3. Regenerate the TypeScript Database type from the live schema.
pnpm db:types
```

The migrations are written so that `supabase db reset` applies them
in filename order, idempotently (`IF NOT EXISTS` is used wherever
`add column` / `create index` allows it).

## 3. What is **not** in the migrations (and why)

- **No `tutor_assignment` audit log.** The `audit_logs` table is
  append-only and would record a future audit-trail feature. It is
  not yet wired to the CRUD paths.
- **No `session_audit` triggers.** Adding row-update triggers on
  `sessions` is a future sprint.
- **No `seed_demo_tutors.sql`.** The first tutor rows will be created
  through the Admin Dashboard now that the "Create tutor" flow is
  shipped.

## 4. Adding a new migration

1. Generate a filename: `YYYYMMDDhhmmss_<short_name>.sql` (use
   today's date, two-minute-stamp is fine).
2. **Never** edit an already-applied migration.
3. The file must be idempotent (`IF NOT EXISTS` / `IF EXISTS` guards).
4. The file must include a top-of-file comment explaining the why.
5. Update this index (add the new row in the table above).
6. Commit + push. CI does not apply migrations; the user applies
   them with `supabase db push` or `supabase db reset` locally.

*Last updated: 2026-07-19. Owner: project lead.*
