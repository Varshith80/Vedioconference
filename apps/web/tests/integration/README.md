# Sprint B2 — Integration & smoke tests

This directory holds the live-system smoke tests for Sprint B2.
They are **not** Vitest unit tests — they require a real
Supabase project and are run on demand by the project lead.

## Files

| File | What it tests | How to run |
|---|---|---|
| `auth-smoke.ts` | End-to-end auth flow: admin-create user → anon sign-in → RLS-check own profile → RLS-deny other profile → sign-out → admin cleanup. | `pnpm tsx tests/integration/auth-smoke.ts` (from `apps/web/`) |

## `auth-smoke.ts` — what it asserts

1. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   and `SUPABASE_SERVICE_ROLE_KEY` are present in `.env.local`.
2. `admin.auth.createUser` returns a user id and no error.
3. A matching `public.profiles` row is insertable by the
   service-role key.
4. `signInWithPassword` (the **anon** key path — same code path
   as the browser) succeeds and returns a session whose
   `user.id` matches the admin-created id.
5. The session has a non-empty `access_token`.
6. The anon session can read its own profile (RLS allows).
7. The anon session cannot read another (non-existent)
   profile (RLS denies — no row visible).
8. `signOut` clears the session.
9. `admin.deleteUser` removes the test user cleanly.

## Prereqs

- Node 20+, pnpm 9+
- `apps/web/.env.local` filled in with the real Supabase URL,
  anon key, and service-role key (NEVER commit this file).
- `pnpm` dependencies installed in `apps/web/`.
- The `tsx` binary (`pnpm add -D tsx` if not already present).

## Running

```bash
# From apps/web/
cp .env.example .env.local       # if .env.local does not exist
# … fill in the real Supabase URL + anon + service-role keys …
pnpm tsx tests/integration/auth-smoke.ts
```

The script prints one `PASS <label>` line per assertion. On
any failure it raises and exits non-zero. The script cleans
up after itself (the test user is removed even on assertion
failure via the `main().catch` handler — although the
`deleteUser` call only runs in the happy path; for
interrupted runs, see the recipe below).

## Cleanup recipe for interrupted runs

If the script crashes between steps 2 and 7, the test user
remains in `auth.users`. To remove them by hand:

```sql
-- Find the user id by e-mail (replace the suffix):
select id from auth.users where email like 'smoke+<stamp>@example.com';

-- Then, as service-role:
delete from public.profiles where id = '<id>';
delete from auth.users    where id = '<id>';
```

Or via the Supabase dashboard: Authentication → Users → …
→ Delete user.

## Why not a Vitest test?

- The `.env.local` file is gitignored — Vitest would not have
  access to it without a `setupFiles` dotenv loader, and we
  do not want to commit one (the keys are real).
- The script is intentionally short and standalone so a
  developer can read it end-to-end before running it.
- The lifecycle (create → use → delete) is destructive enough
  that we want a human in the loop, not a CI loop.
