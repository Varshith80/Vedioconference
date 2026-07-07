# Disaster Recovery

> How the platform survives a region-wide outage, a database loss,
> or a credential leak. RPO / RTO targets and a step-by-step runbook
> for the three most likely scenarios.

## 1. Targets

| Metric | Target | Notes |
|---|---|---|
| **RPO** (Recovery Point Objective) | **5 minutes** | Supabase PITR, plus Stripe / n8n as fallback. |
| **RTO** (Recovery Time Objective) | **60 minutes** | For a single-region Supabase outage. |
| **RTO for credential leak** | **30 minutes** | Rotate the affected secret(s), redeploy. |
| **RTO for full n8n loss** | **4 hours** | Rebuild from `n8n/workflows/*.json` + credentials store. |

## 2. Inventory

| Asset | Where it lives | Backup strategy | Restore time |
|---|---|---|---|
| Postgres data | Supabase | PITR, daily logical dump to S3 | < 15 min |
| Storage objects | Supabase | Daily S3 cross-region copy | < 30 min |
| n8n workflows  | n8n | Nightly `n8n export:workflow` → S3 | < 30 min |
| n8n credentials | n8n encrypted DB | Encrypted snapshot to S3 | < 1 h |
| Vercel build artefacts | Vercel | Built into the platform | n/a |
| Stripe data | Stripe | Stripe owns the data | n/a |
| Zoom recordings | Zoom | Optional, not stored locally | n/a |
| GitHub repo   | GitHub | Mirror in two regions | n/a |
| Secrets | 1Password + Vercel + n8n | 1Password recovery | < 30 min |

## 3. Scenario 1 — Supabase region outage

1. Page on-call.
2. Open a Supabase support ticket; ask for the failover to the
   secondary region (Supabase Pro supports this on request).
3. Switch `NEXT_PUBLIC_SUPABASE_URL` and the service-role key to the
   secondary project (kept warm with a daily logical dump).
4. Redeploy the Next.js app on Vercel.
5. Run `supabase db push` on the secondary project (no-op if
   already up to date).
6. Verify `/api/health` returns 200.
7. Update DNS if necessary (Supabase custom domain).

**RTO:** 60 min. **RPO:** 0 (failover is synchronous in Supabase
Pro).

## 4. Scenario 2 — Supabase data loss (table dropped, malicious admin)

1. Identify the exact drop time (`audit_logs` + Sentry breadcrumbs).
2. Open a PITR restore in the Supabase dashboard
   (`Settings → Database → Point-in-time Recovery`).
3. Restore to a **new** project (`vedioconference-recovery`).
4. Run a row-by-row diff against the live project for the
   affected tables.
5. Use `pg_dump` to extract the missing rows and `psql` to apply
   them to the live project.
6. Verify with the audit log diff.
7. Drop the recovery project.

**RTO:** 60 min. **RPO:** ≤ 5 min (Supabase PITR).

## 5. Scenario 3 — Credential leak (service-role key, Stripe key, …)

1. Page on-call (P1).
2. In Supabase: **rotate the service-role key** (single click).
3. In Vercel: update the env var, redeploy.
4. In Stripe: roll the restricted key, update the webhook signing
   secret (the webhook will start rejecting for a few minutes — that
   is the point).
5. In 1Password: revoke the leaked secret.
6. Open a post-mortem; add a CI secret-scan job if not already
   enabled.
7. Add the leaked value to the `blocklist` and to GitHub's secret
   scanning rules.

**RTO:** 30 min. **RPO:** 0 (no data is at risk).

## 6. Scenario 4 — n8n complete loss

1. Provision a fresh n8n instance (Docker or `n8n.cloud`).
2. Restore the encrypted credential snapshot from S3.
3. Run `./scripts/deploy-n8n.sh production` to re-import every
   workflow.
4. Re-create the webhook entries in Calendly, Stripe, etc.
5. Run the smoke test in `docs/n8n/smoketest.md` (added in Phase 3).

**RTO:** 4 h. **RPO:** 0 (state is in Supabase).

## 7. Scenario 5 — Stripe outage

Stripe has its own DR; we degrade gracefully:

- Checkout sessions created during the outage stay in
  `pending_payment` for up to 24 h.
- Once Stripe is back, the existing sessions are re-usable.
- The admin panel shows a banner: "Paiements momentanément indisponibles."

## 8. Scenario 6 — Vercel outage

Vercel has its own multi-region failover. The customer-facing impact
is "site is down"; there is no data loss.

## 9. Backup schedule

| Time | Job | Owner |
|---|---|---|
| Every 5 min | Postgres WAL archive (Supabase PITR) | Supabase |
| Daily 02:00 UTC | `supabase db dump` → S3 (`s3://backup/postgres/`) | cron |
| Daily 03:00 UTC | Storage cross-region copy | Supabase |
| Daily 04:00 UTC | `n8n export:workflow` → S3 (`s3://backup/n8n/`) | cron |
| Weekly Sun 05:00 UTC | Full DR drill (read-only restore into a sandbox) | SRE |

## 10. DR drill

A read-only DR drill is run **every quarter**. The drill:

1. Restore the latest nightly Postgres dump into a sandbox project.
2. Spin up an n8n instance from the latest snapshot.
3. Run the smoke test from `docs/n8n/smoketest.md`.
4. Time the full restore.
5. File a finding in the SRE channel.

## 11. Communication

- Internal status: `#incidents` Slack channel.
- Customer-facing status page: `status.example.com` (Phase 5).
- Customer email: triggered automatically by the status page for
  outages > 30 min.

## 12. Post-mortem

- Within 24h: a written post-mortem (no-blame, timeline, root cause,
  contributing factors, action items with owners and dates).
- Stored at `docs/postmortems/YYYY-MM-DD-<slug>.md`.
- Action items are tracked as GitHub issues with the `postmortem`
  label.
