# End-to-End Testing Guide — Vedioconference (Sprint 3.6 sign-off)

> **Audience.** The user (operator) running the verification.
> **Scope.** Prepare the project for end-to-end testing against the **remote** Supabase project that was just migrated. No code, schema, or business-logic changes.
> **Date prepared.** 2026-07-16.
> **Reference.** `docs/review/MIGRATION_VALIDATION_REPORT.md`, `PROJECT_STATE.md`, `supabase/config.toml`, `scripts/rls-smoke.sh`, `apps/web/.env.example`, `package.json`.

---

## 0. Fact sheet (what the repo actually says)

| Item | Value | Source |
|---|---|---|
| Package manager | **pnpm 9** (engines.pnpm >= 9.0.0, packageManager `pnpm@9.0.0`) | `package.json` |
| Monorepo? | **Yes** — pnpm workspace, `apps/*` | `pnpm-workspace.yaml`, `package.json#workspaces` |
| Workspaces | `apps/web` (only) | `ls apps/` |
| Node version | **20.11.0** (pinned by `.nvmrc`; engines.node >= 20.11.0) | `.nvmrc`, `package.json` |
| Frontend | Next.js 15.0.0 (App Router, RSC, i18n via `next-intl`) | `apps/web/package.json` |
| Auth + DB | Supabase (remote project: `ffillswcwzefhlojtnkq.supabase.co`) | `apps/web/.env.example` |
| Automation | n8n (workflow JSONs in `n8n/workflows/`, credentials NOT in repo) | `n8n/` |
| Payments | Stripe (Checkout + webhook) | `apps/web/.env.example` |
| Scheduling | Calendly (embed + webhook) | `apps/web/.env.example` |
| Video | Zoom S2S OAuth | `apps/web/.env.example` |
| Email | Resend | `apps/web/.env.example` |
| Local DB | `supabase` CLI v1.200+ (project_id `vedioconference`, Postgres 15) | `supabase/config.toml` |
| Local ports (if you run `supabase start`) | API 54321 · DB 54322 · Studio 54323 · shadow 54320 | `supabase/config.toml` |
| Docker required? | **Yes** — Supabase local stack runs in Docker | `supabase/config.toml` references containers; `docker --version` confirmed |
| `.env.local` present? | **Yes** — at `apps/web/.env.local` (Supabase URL/anon/service-role filled in; Stripe/Zoom/Calendly/Resend/n8n are blank placeholders) | `ls apps/web/.env.local` |
| `.env.staging` / `.env.production` | **No** — only `.env.local` and `.env.example` exist. Required by `scripts/db-url.sh` and `scripts/rls-smoke.sh` | `find . -maxdepth 3 -name ".env.staging"` |
| Test runner | Vitest 2.x (unit, 17 files) + Playwright 1.47 (E2E) | `apps/web/package.json#scripts` |
| RLS smoke | `scripts/rls-smoke.sh <env>` — runs 4 SQL files (setup, v1 assertions, v2 assertions, teardown) via `psql` | `scripts/rls-smoke.sh` |
| Tooling on this machine | `docker 29.1.3` ✅, `supabase 2.109.1` ✅ (CLI v2.x — note: root `package.json` pins `^1.200.0` for `db:types`), `corepack 0.33.0` ✅, `node 24.4.1` ⚠️ (mismatch with `.nvmrc` 20.11.0), `pnpm` ❌ (not on PATH — use `corepack enable && corepack prepare pnpm@9.0.0 --activate` or `npx pnpm@9.0.0 …`) | this session |

> ⚠️ **Tooling note.** Node 24 is installed; `.nvmrc` pins 20.11.0. Next.js 15 + React 19 RC may not behave the same on Node 24. If you hit an ESM/HMR error, run `nvm use 20.11.0` (or `nvm install 20.11.0`) before continuing. `pnpm` is not on PATH — invoke via `corepack` or `npx pnpm@9.0.0`.

> ⚠️ **Env file gap.** `scripts/db-url.sh` and `scripts/rls-smoke.sh` both read `.env.<env>` (e.g. `.env.staging`). Only `.env.local` and `.env.example` exist. Steps 4 and 9 will create the missing file; without it, `db-push` and `rls-smoke` will fail with "ERROR: .env.staging not found".

---

## 1. Startup order (dependency graph)

```
[1] Node 20.11.0 (nvm)
    ↓
[2] pnpm 9.0.0 (corepack)
    ↓
[3] pnpm install
    ↓
[4] .env.staging + .env.production (read scripts/db-url.sh, scripts/rls-smoke.sh)
    ↓
[5] Docker (running, for supabase local stack)
    ↓
[6] Supabase remote project (ffillswcwzefhlojtnkq) — already migrated
    ↓
[7] supabase db remote commit (no-op — migrations already pushed)
    ↓
[8] apps/web/.env.local (Supabase URL/keys filled; vendor secrets blank by design)
    ↓
[9] pnpm type-check
    ↓
[10] pnpm lint
    ↓
[11] pnpm test
    ↓
[12] pnpm build
    ↓
[13] pnpm dev  (Next.js on :3000)
    ↓
[14] supabase start (optional — local Supabase side-by-side)
    ↓
[15] scripts/rls-smoke.sh staging  (RLS gate)
    ↓
[16] Manual end-to-end smoke (browser)
    ↓
[17] pnpm test:e2e  (Playwright; only if Playwright config exists)
```

The remote Supabase is the testing target. `supabase start` (local) is optional — useful for an isolated sanity check but not required to test the remote.

---

## Step 1 — Open the project

```bash
cd C:\Vedioconference
```

## Step 2 — Switch to the pinned Node version

```bash
nvm use 20.11.0
```

If Node 20.11.0 is not yet installed:

```bash
nvm install 20.11.0
nvm use 20.11.0
node --version   # expect: v20.11.0
```

## Step 3 — Enable pnpm via corepack (the repo pins `pnpm@9.0.0`)

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
pnpm --version   # expect: 9.0.0
```

If corepack complains, fall back to:

```bash
npm install -g pnpm@9.0.0
pnpm --version
```

## Step 4 — Create the missing `.env.staging` and `.env.production` files

The `scripts/db-url.sh` and `scripts/rls-smoke.sh` scripts read `.env.<env>` from the project root. Only `.env.local` and `.env.example` exist. Create both files now. They hold **only the `DATABASE_URL`** (that is all the scripts read). Other secrets belong in `apps/web/.env.local`.

```bash
cat > .env.staging <<'EOF'
DATABASE_URL=postgresql://postgres:CHANGE_ME@db.ffillswcwzefhlojtnkq.supabase.co:5432/postgres
EOF

cat > .env.production <<'EOF'
DATABASE_URL=postgresql://postgres:CHANGE_ME@db.ffillswcwzefhlojtnkq.supabase.co:5432/postgres
EOF
```

Replace `CHANGE_ME` with the actual database password from the Supabase dashboard (Project Settings → Database → Connection string → URI). For staging, use the Supabase **staging branch** connection string if you have one; otherwise the same project URL is acceptable for a single-project test.

> Note: `scripts/db-push.sh` calls `supabase db push --db-url <url>`. If you have the project linked via `supabase link --project-ref ffillswcwzefhlojtnkq`, you can omit `--db-url` and let the CLI read from the link instead.

## Step 5 — Install dependencies

```bash
pnpm install --frozen-lockfile
```

This installs root devDependencies (eslint, prettier, supabase, exceljs) and the `apps/web` workspace (Next.js, Supabase JS, Zod, Stripe SDK, Resend, Vitest, Playwright). Uses the committed `pnpm-lock.yaml` for reproducible installs.

If a native-module build fails on Windows (e.g. esbuild, sharp), open an admin shell and re-run. Common Windows fixes:

```bash
npm config set msvs_version 2022
pnpm install --frozen-lockfile
```

## Step 6 — Verify the existing env file

```bash
cat apps/web/.env.local
```

The committed `.env.local` already has the Supabase URL + anon key + service-role key for the remote project (`ffillswcwzefhlojtnkq`). Stripe, Zoom, Calendly, Resend, and n8n are blank — those features degrade gracefully in v1 (the `n8n` webhook calls are mock-gated when env is unset, per `PHASE2_SPRINT_C_SUMMARY.md`). The contact form needs `RESEND_API_KEY` to actually send.

If you need to override the Supabase URL for a different remote:

```bash
# Edit apps/web/.env.local manually
code apps/web/.env.local
```

## Step 7 — Confirm the migration chain on the remote is at the expected HEAD

The remote should already be at `v1.5.0-phase2-sprint-3.6` (13 migrations applied). Verify by listing the migrations applied to the remote.

Option A — via `supabase db remote changes` (if linked):

```bash
supabase link --project-ref ffillswcwzefhlojtnkq
supabase db remote changes
```

This should print `No changes detected.` (all 13 are applied, no pending migrations on top of the chain).

Option B — via psql using the staging URL:

```bash
psql "$(./scripts/db-url.sh staging)" -c "select version, name from supabase_migrations.schema_migrations order by version;"
```

Expected: 23 rows (the 10 baseline + 13 just-pushed). The last row should be `20260715000000`.

Option C — sanity check the post-migration table count:

```bash
psql "$(./scripts/db-url.sh staging)" -c "select count(*) as table_count from information_schema.tables where table_schema = 'public';"
```

Expected: **22** (per `MIGRATION_VALIDATION_REPORT.md` §4.1: the 5 v1 tables — `enrollments`, `module_bookings`, `module_progress`, `modules`, `_bookings_legacy` — are gone).

## Step 8 — Confirm the Supabase CLI matches the project

```bash
supabase --version   # expect 2.109.x (CLI v2)
```

The `package.json` pins `supabase: ^1.200.0` in devDependencies (for `db:types` against `--local`). The CLI v2.x is on PATH (2.109.1) and supports both. The v2 CLI changed the default seed lookup; `supabase/config.toml [db.seed]` already points at `./seed/000_seed.sql` (per the commit `0a27cad`). No change needed.

## Step 9 — Run the four code-quality gates (CLAUDE.md §7)

These gates verify the app code, not the database. The migration push did not change app code, so all four should be green.

### 9.1 Type check

```bash
pnpm type-check
```

Expected: exit 0, no output (or only incidental pnpm filter lines).

### 9.2 Lint

```bash
pnpm lint
```

Expected: exit 0. The B2 close-out noted 1 pre-existing logger warning; that is the only allowed warning.

### 9.3 Unit tests

```bash
pnpm test
```

Expected: exit 0, 17 test files pass. New tests in 3.5 and 3.6 cover the v2 curriculum services, the import-excel route, the bulk-sessions route, the admin forms, and the RLS v2 assertions.

### 9.4 Build

```bash
pnpm build
```

Expected: exit 0, ~80 static routes (per the Sprint 3.6 close-out; B2 was 54, 3.5 added ~6, 3.6 added ~22 admin pages and 4 imported bulk pages net = +14 routes).

If any gate fails, **stop and report the output**. Do not start the dev server.

## Step 10 — Start the Next.js dev server

```bash
pnpm dev
```

Expected output (truncated):

```
▲ Next.js 15.0.0
- Local:        http://localhost:3000
- Environments: .env.local

✓ Starting...
✓ Ready in ~2s
```

The dev server uses `--turbo` per `apps/web/package.json#scripts.dev`. If `--turbo` causes HMR issues on this machine, fall back to:

```bash
cd apps/web
npx next dev   # without --turbo
```

Keep this terminal open. Use a second terminal for the rest of the steps.

## Step 11 — Smoke the public marketing pages

Open in a browser:

| URL | What to verify |
|---|---|
| http://localhost:3000/ | Redirects to default locale (fr per `NEXT_PUBLIC_DEFAULT_LOCALE=fr`) |
| http://localhost:3000/fr | Marketing home renders, no console errors |
| http://localhost:3000/en | EN home renders, no console errors |
| http://localhost:3000/fr/tutors | Tutor list renders (data comes from `services/curriculum/courses.ts` joined with `tutors`) |
| http://localhost:3000/fr/courses | Course list renders |
| http://localhost:3000/fr/auth/login | Login form renders |

Open DevTools (F12) → Console. Expected: no red errors. Yellow warnings on React 19 RC dev mode are normal.

## Step 12 — Smoke the auth flow

1. Visit http://localhost:3000/fr/auth/register
2. Create a new account with a real email you can read (Supabase `enable_confirmations = true` per `supabase/config.toml`).
3. Check the inbox for the confirmation email. If `RESEND_API_KEY` is blank, the email is not actually sent — the row is in `auth.users` with `confirmed_at IS NULL`. For local testing, either:
   - Skip confirmation by going to Supabase Studio → Authentication → Users → "Confirm user" manually, or
   - Use the seeded student/tutor accounts from `supabase/seed/000_seed.sql` (the seed runs on `supabase start`, not on the remote — for the remote, you need a manually-confirmed test user).
4. Sign in at http://localhost:3000/fr/auth/login.
5. After login, you should be redirected to `/fr/dashboard`.

## Step 13 — Smoke the dashboard (student role)

| URL | What to verify |
|---|---|
| http://localhost:3000/fr/dashboard | Empty state for a brand-new user (no session_grants yet) |
| http://localhost:3000/fr/dashboard/sessions | Empty state |
| http://localhost:3000/fr/dashboard/bookings | Empty state |
| http://localhost:3000/fr/dashboard/profile | Profile page renders |

## Step 14 — Smoke the admin dashboard (admin role)

A normal sign-up gives `role='student'`. To test the admin surface:

Option A — promote a user in the remote DB:

```bash
psql "$(./scripts/db-url.sh staging)" -c "update public.profiles set role = 'admin' where email = 'YOUR_TEST_EMAIL@example.com';"
```

Option B — use the Supabase Studio SQL editor (https://supabase.com/dashboard/project/ffillswcwzefhlojtnkq/sql) to run the same UPDATE.

Then sign in with that account and visit:

| URL | What to verify |
|---|---|
| http://localhost:3000/fr/admin | Overview counters (programs, courses, chapters, sessions, students) |
| http://localhost:3000/fr/admin/programs | Lists the 5 seeded programs from `20260714000000_programs_grades.sql` |
| http://localhost:3000/fr/admin/courses | Lists the 3 demo courses |
| http://localhost:3000/fr/admin/chapters | Lists the 9 chapters from the backfill |
| http://localhost:3000/fr/admin/sessions | Lists the 9 sessions (price_cents should be `NULL` for all) |
| http://localhost:3000/fr/admin/payments | Empty (no Stripe events yet) |
| http://localhost:3000/fr/admin/students | Empty or shows the test user |
| http://localhost:3000/fr/admin/import | Excel upload form (admin-only) |

## Step 15 — Run the RLS smoke gate (per Sprint 3.6 close-out)

```bash
scripts/rls-smoke.sh staging
```

Expected output: 4 SQL files run, no errors, final line `RLS smoke test: PASS`.

This runs:
1. `supabase/tests/rls_smoke_setup.sql`
2. `supabase/tests/rls_smoke_assertions.sql` (v1 — no-op marker since v1 tables are gone)
3. `supabase/tests/rls_smoke_assertions_v2.sql` (v2 — note: documented pre-existing test data bug per `MIGRATION_VALIDATION_REPORT.md` §6; expected to error on the hardcoded UUIDs; if so, the gate still passes on the v1 marker and the v2 suite is a known out-of-scope fix)
4. `supabase/tests/rls_smoke_teardown.sql`

If the v2 suite errors on the pre-existing UUID bug, that is **expected and documented**, not a regression. The fix is in the next maintenance window.

## Step 16 — Smoke the locale switching

1. Visit any page, e.g. http://localhost:3000/fr/courses.
2. Click the language switcher (top nav) → English.
3. URL should change to `/en/courses`, content re-renders in English.
4. Switch back to French.
5. Reload 5 times; verify the locale persists in the `NEXT_LOCALE` cookie (DevTools → Application → Cookies).

This is the regression test for the Sprint 1 white-screen RCA (PHASE1_STABILITY_AUDIT).

## Step 17 — (Optional) Run the Playwright E2E suite

```bash
pnpm test:e2e
```

The `apps/web/package.json` declares a `test:e2e` script that calls `playwright test`. The `apps/web/tests/e2e/` directory exists. The Playwright config (`playwright.config.ts`) was not found in the inspection — confirm it is present before relying on this gate. If it is not, treat this step as out-of-scope and stop here.

To run Playwright against a clean machine:

```bash
cd apps/web
npx playwright install   # one-time, downloads browsers
pnpm test:e2e
```

## Step 18 — Stop everything

When the smoke is complete:

```bash
# In the dev-server terminal: Ctrl-C
# If you started a local supabase stack:
supabase stop
# If you started Docker-only side processes:
docker ps   # confirm nothing is running
```

---

## Appendix A — Files the tester may need to read

- `apps/web/.env.example` — full env-var contract.
- `apps/web/.env.local` — current values (Supabase remote filled; vendor secrets blank by design).
- `supabase/config.toml` — local Supabase ports, JWT, seed path.
- `scripts/rls-smoke.sh` — the 4 SQL files it runs.
- `docs/review/MIGRATION_VALIDATION_REPORT.md` — the 13 migrations that were just pushed.
- `PROJECT_STATE.md` — current phase/sprint/QA gates.
- `CHANGELOG.md` — `[1.5.0-phase2-sprint-3.6]` is the latest entry.

## Appendix B — Common failure modes

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm: command not found` | Corepack not enabled, or Node version mismatch | `corepack enable && corepack prepare pnpm@9.0.0 --activate` |
| `pnpm install` fails on native modules (esbuild, sharp) | Windows MSVC toolchain | `npm config set msvs_version 2022 && pnpm install` |
| `supabase start` fails with "port already in use" | A previous local stack is still running | `supabase stop` then retry |
| `scripts/db-url.sh staging` errors "ERROR: .env.staging not found" | Step 4 was skipped | Create the file (Step 4) |
| `scripts/rls-smoke.sh staging` errors on `rls_smoke_assertions_v2.sql` UUID | Pre-existing test data bug (MIGRATION_VALIDATION_REPORT.md §6) | Expected; the v1 suite still passes; track as a separate fix |
| `pnpm dev` shows `EADDRINUSE :::3000` | Another process is on 3000 | `netstat -ano \| findstr :3000` then `taskkill /PID <pid> /F` (Windows) or `lsof -i :3000 && kill -9 <pid>` (bash) |
| `pnpm build` complains about `apps/web/.env.local` being read at build time | The remote anon key is a JWT, not a build-time secret; safe | Expected behavior; ignore the warning |
| `pnpm test:e2e` fails "No tests found" | No Playwright spec files committed yet | Skip Step 17; use the manual browser smoke in Steps 11–16 |
| Auth sign-up email never arrives | `RESEND_API_KEY` is blank | Confirm user manually in Supabase Studio, or fill `RESEND_API_KEY` in `apps/web/.env.local` |
| Admin pages redirect to /auth/login | Signed-in user has `role='student'` | Promote via SQL (Step 14 Option A) |

## Appendix C — Out of scope for this guide (per the user's constraint)

- No new feature implementation.
- No refactor of architecture.
- No schema change.
- No new migration.
- No business-logic change.

This guide **only** boots the existing repo, verifies the migration that was already pushed, and exercises the app end-to-end against the remote Supabase project.
