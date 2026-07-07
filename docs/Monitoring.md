# Monitoring

> What we measure, where we measure it, what we alert on, and the
> dashboards an SRE keeps open.

## 1. Goals

1. Detect outages before customers do.
2. Quantify the cost of a feature in dollar / CPU terms.
3. Provide a single timeline of an incident (request id across
   services).
4. Keep the alert-noise ratio below 5%.

## 2. Health checks

### 2.1 `GET /api/health` (added in this review)

```json
{
  "status": "ok",
  "checks": {
    "database":   "ok",
    "stripe":     "ok",
    "resend":     "ok",
    "n8n":        "ok",
    "supabaseStorage": "ok"
  },
  "uptimeSec": 12345,
  "version": "1.0.0"
}
```

- `liveness`  → returns 200 if the process is alive
- `readiness` → returns 503 if any dependency check fails

A 503 from readiness will take the deployment out of the Vercel load
balancer.

### 2.2 Dependency probes

| Dependency | Probe | Threshold |
|---|---|---|
| Postgres | `SELECT 1` | 200ms |
| Supabase Storage | `HEAD` on the `avatars` bucket | 500ms |
| Stripe | `GET /v1/balance` with the restricted key | 1s |
| Resend | `GET /v1/domains` | 1s |
| n8n | `GET /healthz` on `N8N_BASE_URL` | 1s |
| Calendly | `GET /users/me` | 1s |

## 3. Metrics

We emit metrics from three sources:

1. **Vercel** — request count, latency p50/p95/p99, error rate per
   route.
2. **Sentry** — error count, release adoption, performance trace
   per route.
3. **Custom** — domain-specific events written to
   `public.metrics_daily` (a per-day rollup, Phase 5).

| Metric | Source | Where it shows |
|---|---|---|
| `requests_total{route,method,status}` | Vercel | Grafana |
| `request_duration_ms{route}`        | Vercel | Grafana |
| `error_rate{route}`                | Sentry  | Grafana |
| `bookings_created_total`           | Custom  | Admin |
| `bookings_cancelled_total`         | Custom  | Admin |
| `revenue_cents_total`              | Custom  | Admin |
| `n8n_executions_total{workflow,status}` | n8n | Grafana |
| `n8n_dead_letters_total`           | n8n    | Admin |

## 4. Alerts

| Alert | Condition | Severity | Route |
|---|---|---|---|
| `api_5xx_burst`          | `error_rate > 1%` for 5 min | P3 | Slack `#oncall` |
| `api_5xx_storm`          | `error_rate > 10%` for 1 min | P2 | PagerDuty |
| `api_latency_p95_high`   | `p95 > 1.5s` for 10 min | P3 | Slack |
| `db_pool_exhausted`      | `pg_stat_activity.count > 90% pool` for 5 min | P2 | PagerDuty |
| `stripe_webhook_lag`     | last successful webhook > 5 min ago | P2 | Slack + PagerDuty |
| `n8n_dead_letters`       | any new row in `n8n_dead_letters` | P1 | PagerDuty |
| `email_bounce_rate_high` | bounce > 5% in 24h | P3 | Slack |
| `uptime_check_failed`    | `/api/health` 503 for 3 consecutive probes | P1 | PagerDuty |
| `auth_brute_force`       | > 20 failed signins for one IP in 5 min | P3 | Slack |
| `backup_failed`          | nightly Supabase backup did not complete | P2 | PagerDuty |

## 5. Error monitoring

- **Sentry** is the single source of truth for unhandled errors.
- The Next.js app installs `@sentry/nextjs` and initialises
  `Sentry.init({ dsn, tracesSampleRate: 0.1 })` in
  `apps/web/sentry.client.config.ts` and `sentry.server.config.ts`
  (Phase 5).
- The `requestId` is attached to every Sentry event.
- Sensitive data is filtered through `beforeSend`.

## 6. Performance monitoring

- **Web Vitals** are sent to Sentry as part of the
  `@sentry/nextjs` browser integration.
- **DB query performance** is exposed via
  `pg_stat_statements` (enabled by Supabase). We alert on a query
  whose p95 grows by more than 50% week over week.
- **n8n execution duration** is logged to `n8n_executions` and
  surfaced in a Grafana panel.

## 7. Uptime monitoring

- External probes via [Better Uptime] every 60s from 3 regions:
  - `https://app.example.com/api/health`
  - `https://app.example.com/` (200, response time < 1s)
- A PagerDuty escalation policy: 1st responder (on-call SRE),
  2nd (Tech Lead), 3rd (CTO).

## 8. Recommended dashboards (Grafana)

- **Overview** — request rate, error rate, latency p95, DB CPU,
  n8n executions per workflow.
- **Bookings** — bookings per hour, conversion rate, refunds.
- **Payments** — successful / failed / refunded by hour.
- **Workflows** — n8n execution timeline, dead-letter count, average
  duration per workflow.
- **DB** — connection pool usage, slow queries, top-N by total time.

## 9. On-call rotation

- PagerDuty schedule: weekly rotation, 1 primary + 1 secondary.
- Escalation policy:
  1. Primary (5 min)
  2. Secondary (5 min)
  3. Tech Lead (10 min)
  4. CTO (15 min)

## 10. Incident response

1. Acknowledge within SLA (5 min for P1, 15 min for P2).
2. Open a status page entry (Phase 5).
3. Capture a Sentry event id and a request id.
4. Page out via the runbook in `docs/DisasterRecovery.md`.
5. Post a final summary in `#incidents` within 24h.
