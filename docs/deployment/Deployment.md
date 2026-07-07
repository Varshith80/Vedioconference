# Deployment

> Production topology and release process.

## 1. Environments

| Environment | Vercel project | Supabase project | n8n | Stripe mode |
|-------------|----------------|------------------|-----|-------------|
| Preview     | per PR         | shared staging   | staging | test mode |
| Staging     | `staging`      | shared staging   | staging | test mode |
| Production  | `production`   | `production`     | prod    | live mode  |

## 2. Hosting

### 2.1 Vercel

- One project per environment.
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Output: `.next`
- Region: `cdg1` (Paris) for EU latency.
- Environment variables: see [`Environment.md`](./Environment.md).

### 2.2 Supabase

- Database: Postgres 15, EU region (`eu-west-3`).
- Branching is **not** used in Phase 1. From Phase 4 we adopt
  Supabase branching for every PR.
- Backups: managed (daily PITR, 7-day retention on production).
- Connection pooling: Supavisor transaction mode (port 6543) for
  the Next.js serverless function; direct connection for n8n.

### 2.3 n8n

- Self-hosted on a small VPS (Hetzner CX22) with Docker Compose.
- `n8n.cloud` is acceptable as a backup.
- Backed up nightly to S3 via `n8n export:workflow`.

## 3. CI / CD

`.github/workflows/ci.yml`:

```yaml
on:
  pull_request:
  push: { branches: [main] }

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
      - run: pnpm build
      - run: supabase db lint   # optional
```

`.github/workflows/codeql.yml` runs weekly and on every PR.

Vercel is configured as a GitHub App with **auto-deploy**:

- `main` → production
- any other branch → preview

## 4. Database migrations

```bash
# 1. Create a new migration
supabase migration new <feature_name>

# 2. Write the SQL

# 3. Apply to staging
supabase db push --db-url $STAGING_DB_URL

# 4. Apply to production (after PR + CI green)
supabase db push --db-url $PROD_DB_URL
```

All migrations are **forward-only**. If a destructive change is
required, write a multi-step migration (add column → backfill → drop
column).

## 5. n8n deployments

```bash
./scripts/deploy-n8n.sh staging   # or production
```

This script iterates over `n8n/workflows/*.json`, calls
`n8n import:workflow`, and reports any diff against the live state.

## 6. Secrets

- Vercel: per-environment env vars are managed in the Vercel UI.
- Supabase: service-role key is generated once, stored in
  `1Password` and pasted into Vercel + n8n.
- n8n: every credential is stored in n8n's encrypted DB.

## 7. Observability

- **Errors:** Sentry (browser + server).
- **Logs:** Vercel logs (Next.js) + Supabase logs (Postgres) +
  n8n execution logs.
- **Uptime:** Better Uptime probes on `/api/health` (Phase 6).

## 8. Rollback

- **App:** Vercel "instant rollback" to the previous deployment.
- **Database:** `supabase db restore --timestamp=<PIT>`.
- **n8n:** `n8n import:workflow --force` with the previous JSON.
