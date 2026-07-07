# Environment variables

> Every variable the application reads. The `.env.example` files in
> the repository are the source of truth for **names**; this document
> is the source of truth for **meaning and where to get the value**.

## Public (`NEXT_PUBLIC_*`)

| Variable | Description | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL of your Supabase project | Supabase dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anonymous key (safe to ship to the browser) | same |
| `NEXT_PUBLIC_SITE_URL` | Absolute URL the app is served from (no trailing slash) | you |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `fr` | you |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Europe/Paris` | you |
| `NEXT_PUBLIC_CALENDLY_URL` | Public Calendly profile link (used by the marketing CTA) | Calendly |
| `NEXT_PUBLIC_N8N_BOOKING_WEBHOOK` | Public webhook URL to start the booking workflow (if the initial call is initiated by the client) | n8n |

## Server-only — Supabase

| Variable | Description |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Bypasses RLS. **Top secret.** |

## Server-only — Stripe

| Variable | Description |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the Stripe webhook endpoint |
| `STRIPE_PRICE_PAYG` | Stripe Price ID for the pay-as-you-go product |
| `STRIPE_PRICE_SUBSCRIPTION` | Stripe Price ID for the package / subscription product |

## Server-only — Zoom (Server-to-Server OAuth)

| Variable | Description |
|---|---|
| `ZOOM_ACCOUNT_ID` | Account ID of the Zoom S2S app |
| `ZOOM_CLIENT_ID` | Client ID |
| `ZOOM_CLIENT_SECRET` | Client secret |
| `ZOOM_DEFAULT_HOST_USER_ID` | User ID of the Zoom user that will host the meeting (the tutor account) |

## Server-only — Calendly

| Variable | Description |
|---|---|
| `CALENDLY_PERSONAL_TOKEN` | Calendly personal access token (used to fetch event types) |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | Calendly webhook signing key (verify `Calendly-Webhook-Signature`) |

## Server-only — Resend

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Verified sender (e.g. `no-reply@example.com`) |

## Server-only — n8n

| Variable | Description |
|---|---|
| `N8N_BASE_URL` | Public URL of the n8n instance |
| `N8N_API_KEY` | n8n API key (used by the deploy script) |
| `N8N_WEBHOOK_SECRET` | Shared secret expected in `X-Webhook-Secret` |

## Server-only — Misc

| Variable | Description |
|---|---|
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` (default `info`) |
| `SENTRY_DSN` | Sentry DSN for error reporting |

## How to set them

### Local

```bash
cp apps/web/.env.example apps/web/.env.local
$EDITOR apps/web/.env.local
```

### Vercel

1. Project → Settings → Environment Variables
2. Add each variable, scoped to `Production`, `Preview`, or both.

### n8n

1. Settings → Credentials → Add credential
2. Reuse across workflows.

## Security rules

- **Never** prefix a secret with `NEXT_PUBLIC_`.
- **Never** commit a real `.env.local` (it is `.gitignore`d, double-check).
- Rotate `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, and the
  Zoom client secret **at least every 90 days** (or immediately after
  any suspected exposure).
