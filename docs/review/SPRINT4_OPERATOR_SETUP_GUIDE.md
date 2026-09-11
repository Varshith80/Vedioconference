# Sprint 4 — Operator Setup Guide

> **Status:** Read-only documentation. No code modified, no
> files created except this guide, no commits made, no Sprint
> 4 implementation started, no external service connection
> attempted. This guide is the **operational playbook** for
> the project owner to provision every third-party service
> before Sprint 4 implementation begins.
>
> **Audience:** the project owner (the operator). Every
> section assumes that you are working in your own browser
> and your own account. No actions described here require
> the AI assistant or modify the codebase.
>
> **Source of truth:** this guide is derived from
> `docs/review/PHASE2_SPRINT_4_READINESS_REPORT.md` (the
> audit) and from the code contract in `apps/web/lib/env.ts`
> + `docs/deployment/Environment.md`. Where this guide and
> the codebase disagree, **the code wins** — open a PR that
> updates both this guide and the doc, do not "fix" the code
> from this guide.
>
> **Scope:** Supabase is already configured (project
> `ffillswcwzefhlojtnkq`, EU region). This guide covers the
> **6 services that still need to be provisioned**:
> n8n Cloud, Calendly, Stripe, Zoom, Resend, Vercel.
>
> **Out of scope:** Sentry, Upstash, the Phase 5 work, and
> the workflow filename cleanup (`module-*.json` →
> `session-*.json`) — see §10 of the readiness report for the
> open questions that gate those.

---

## How to use this guide

1. **Read it once end-to-end** before you start. The
   services are inter-dependent (e.g. Zoom webhook URLs
   depend on Vercel; Resend sender domain depends on DNS
   which depends on Vercel). The execution order in the
   **Final Checklist** at the bottom is the one that
   minimises blocked time.
2. **Work in a password manager** (1Password, Bitwarden,
   etc.). You will be creating ~20 secrets in one session.
   Save each one as you generate it, with a label that
   matches the env var name in the **Env var column** of
   each section.
3. **Work in a dedicated browser profile** with a
   passphrase, 2FA, and a YubiKey (or equivalent) on every
   account. Stripe, Zoom, Resend, and Vercel all support
   hardware-key 2FA — use it.
4. **Run on staging first.** Every webhook callback in
   this guide accepts a `staging.` host. Provision
   `staging.<your-domain>` before `app.<your-domain>` and
   do all the end-to-end tests on staging.
5. **Every secret you generate is scoped to ONE
   environment.** Stripe has a `test mode` and a `live
   mode` with different keys; Resend has separate API keys
   per sending domain; n8n has per-environment credentials.
   Use the staging secrets in Vercel's `Preview` env, and
   the production secrets in Vercel's `Production` env.

---

## 1. n8n Cloud

### 1.1 Purpose in this project

n8n is the **only** system that calls Stripe, Zoom, and
Resend on the booking path. The Next.js app holds none of
those secrets for the booking flow (per the locked
architecture, `docs/architecture/Architecture.md` §2.3).
The 9 workflow JSONs in `n8n/workflows/` are
imported-and-activated on the n8n Cloud workspace; each
workflow then calls the third-party APIs via n8n's
credential system.

### 1.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **n8n Cloud — Starter** | ~$20 / month | 2 500 workflow executions / month, 1 workspace, 5 active workflows. Covers the 8 active workflows in Sprint 4 (the 9th — `session-completed` — is Sprint 5+ scope). If traffic exceeds 2 500 / month, upgrade to **Pro** ($50 / month, 10 000 executions) or **Enterprise** (custom). |
| **Self-hosted** (alternative) | $0 (infra) | Docker on a Hetzner / Fly.io VM (~$5–10 / month). The `scripts/deploy-n8n.sh` script works with both Cloud and self-hosted. **Choose this only if you have ops capacity.** The Cloud plan is the recommended default. |

**Do not** start on the free trial — it does not include
production-quality concurrency. Provision the **Starter**
plan from day one and cancel the trial.

### 1.3 Account creation steps

1. Go to `https://n8n.cloud` → **Sign up**.
2. Choose **Sign up with email** (not Google — Google
   OAuth does not enforce 2FA from the n8n side; email +
   2FA + a strong password is more secure).
3. Pick a workspace name (`integrale-prod`).
4. Choose the **Starter** plan.
5. Enable 2FA immediately: workspace owner → **Settings**
   → **Personal** → **2FA** → TOTP (or YubiKey if your
   tier supports it).

### 1.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Overview** | URL of the workspace (this is `N8N_BASE_URL`). |
| **Settings → API** | Generate the API key. |
| **Settings → Users** | Add the second operator (the one who is on-call). |
| **Settings → Workflow settings** | Default error workflow, timezone, execution timeout. |
| **Workflows** | Where the 9 JSONs land after import. |
| **Credentials** | Where you create the 5 service credentials (Supabase, Stripe, Zoom, Calendly, Resend). |
| **Executions** | Live view of the 9 workflows running. |

### 1.5 API keys to generate

| Name | Where | Env var |
|---|---|---|
| n8n API key | Settings → API → **Create API key** → name `sprint4-deploy` → scope `workflow:read,workflow:write,execution:read` | `N8N_API_KEY` |
| n8n webhook secret | A random 32-byte hex string you generate. **Same secret on the n8n side (set in every workflow that POSTs back to Next.js) and on the Next.js side.** Generate it now and reuse it everywhere. | `N8N_WEBHOOK_SECRET` |

**Generate the webhook secret with:**
```bash
openssl rand -hex 32
```

### 1.6 OAuth applications to create

n8n does not require you to register the workspace as an
OAuth app. The 5 service credentials in §1.7 below are
n8n's own credentials, not OAuth clients.

### 1.7 Webhooks to configure

n8n **hosts** the webhooks — it does not consume them. The
webhook URL is auto-generated by n8n when you import a
workflow that has a Webhook node. After import you will
have **8 webhook URLs** (one per workflow that exposes a
Webhook node), of which the ones the Next.js app needs are:

| Workflow | What Next.js calls it for | Where in code |
|---|---|---|
| `enrollment-created` | Next.js POSTs here to ask n8n to create the Stripe Checkout Session | `apps/web/app/api/session-grants/[id]/stripe-session/route.ts` |
| `session-booking-to-zoom` | Calendly webhook is forwarded here by the Next.js `/api/webhooks/calendly` route | `apps/web/app/api/webhooks/calendly/route.ts:67-84` |
| `session-cancellation` | Next.js `POST /api/session-bookings/[id]/cancel` → forwards here | `apps/web/app/api/session-bookings/[id]/cancel/route.ts` (verify path) |

The URL for the first one is the only one that needs to
land in env vars:

| Env var | Value |
|---|---|
| `N8N_ENROLLMENT_WEBHOOK_URL` | The webhook URL of the `enrollment-created` workflow, **without** the trailing `/calendly` suffix that the Calendly webhook re-adds in `apps/web/app/api/webhooks/calendly/route.ts:72`. |

The other two webhook URLs are hard-coded in the Next.js
webhook forwarders; the deployment of the workflows sets
the URLs, the Next.js code reads them via the
`N8N_ENROLLMENT_WEBHOOK_URL` env var or via constants in
the forwarder.

### 1.8 Callback URLs

n8n does not call back to a registered URL — it uses the
env-var-configured `N8N_ENROLLMENT_WEBHOOK_URL`. There are
no OAuth callback URLs to register on the n8n side.

### 1.9 Redirect URIs

n8n does not redirect to your app. No redirect URIs to
register.

### 1.10 Environment variables that will use these credentials

| Env var | Source |
|---|---|
| `N8N_BASE_URL` | Workspace URL from §1.4 (e.g. `https://integrale.app.n8n.cloud`). |
| `N8N_API_KEY` | From §1.5. |
| `N8N_WEBHOOK_SECRET` | From §1.5 (the same 32-byte hex). |
| `N8N_ENROLLMENT_WEBHOOK_URL` | From §1.7. |

### 1.11 Which project files depend on these credentials

| File | What it uses |
|---|---|
| `apps/web/lib/env.ts` | The 4 env vars above (all `optional()`; missing vars surface a 503 from the calling route, not a crash). |
| `apps/web/app/api/session-grants/[id]/stripe-session/route.ts` | `N8N_ENROLLMENT_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`. |
| `apps/web/app/api/webhooks/calendly/route.ts` | `N8N_ENROLLMENT_WEBHOOK_URL` + `N8N_WEBHOOK_SECRET`. |
| `apps/web/app/api/session-bookings/[id]/cancel/route.ts` | Same pattern (verify path; this guide is read-only). |
| `apps/web/app/api/webhooks/n8n/route.ts` | `N8N_WEBHOOK_SECRET` (validates the header on inbound calls). |
| `scripts/deploy-n8n.sh` | `N8N_BASE_URL` + `N8N_API_KEY` (imports the 9 JSONs). |
| `n8n/workflows/*.json` (all 9) | Reference `$env.SUPABASE_SERVICE_ROLE_KEY` and the n8n credentials in §1.12. |

### 1.12 How to verify the integration is ready

1. **API key round-trip:** in a shell, run
   ```bash
   curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_BASE_URL/api/v1/workflows" | jq '.data | length'
   ```
   You should see `0` (no workflows imported yet) or the
   current count after import. A `401` means the key is
   wrong.
2. **Webhook secret round-trip:** in any n8n workflow,
   add a temporary Webhook node, copy the URL, POST
   `{"x-webhook-secret":"<the same secret>"}` to it. n8n
   should record the execution. Then POST without the
   header — n8n should reject.
3. **Workspace reachable from the Next.js side:** the
   `N8N_ENROLLMENT_WEBHOOK_URL` must resolve from a
   browser on the public internet. If you are behind a
   corporate VPN, test from a personal device.

### 1.13 Common mistakes to avoid

- **Do not put the workspace URL in `N8N_BASE_URL` with a
  trailing slash.** The code concatenates
  `${N8N_BASE_URL}/api/...`; a trailing slash produces
  `//api/...` and a 404.
- **Do not share the API key.** It has `workflow:write`
  scope and could wipe the workspace. The
  `scripts/deploy-n8n.sh` script needs it; the **Next.js
  app does not**.
- **Do not regenerate the webhook secret without
  rotating it everywhere.** The same secret is checked in
  every workflow that POSTs to `/api/webhooks/n8n` AND
  set in the `N8N_WEBHOOK_SECRET` env var on the Next.js
  side. If they diverge, every n8n → Next.js call is
  rejected as `401 Unauthorized`.
- **Do not enable the `meeting.ended` workflow
  (`module-completed.json`).** The Zoom webhook receiver
  in Next.js does not exist yet (Sprint 5+). Activating
  the workflow today will produce a flood of dead-letter
  inserts.

### 1.14 Dependencies on other services

- **Depends on:** nothing (you can create the n8n
  workspace first, before any other service).
- **Required for:** §2 (Calendly forwarders), §3 (Stripe
  via `enrollment-created`), §4 (Zoom via
  `session-booking-to-zoom`), §5 (Resend via the email
  workflows). Provision n8n **first**.

---

## 2. Calendly

### 2.1 Purpose in this project

Calendly is the **scheduling UI** the student uses to pick
a time. The student picks a course → opens the course
detail page → the embedded Calendly widget (or the public
Calendly URL) lets the student pick a time slot. The
booking then fires a webhook to Next.js, which forwards
to n8n, which creates the Zoom meeting and sends the
confirmation email.

### 2.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **Calendly — Standard** | $16 / month per user | 1 active event type per tutor (the session slot), unlimited bookings, webhooks, API access. The Standard plan is the minimum that exposes the REST API + the webhook subscription. **Do not** start on the free tier — it does not allow webhooks. |
| **Calendly — Teams** | $20 / month per user | Adds round-robin + pool scheduling. Not needed for v1 (each tutor owns their own event type). Defer to Sprint 5+ if tutor pool scheduling becomes a requirement. |

One Calendly seat is enough for v1 (one workspace
account). The tutor uses the **same** workspace and
**their own** event types; the tutor does not need a
separate Calendly account.

### 2.3 Account creation steps

1. Go to `https://calendly.com` → **Sign up**.
2. Use the **business email** (the `no-reply@…` is not
   valid; the address the tutors will see). Domain
   verification happens in §2.4.
3. Enable 2FA: **Account** → **Security** → **2FA**.
4. **Connect the calendar** (Google Calendar / Outlook)
   that the tutor will use. Calendly reads free/busy
   from this calendar to surface real availability.
5. **Verify the email** Calendly sends to the business
   address.

### 2.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Account → Profile** | Username → this is the public Calendly URL (`https://calendly.com/<username>`). Set this to a short, brand-friendly value. |
| **Account → Email** | Business email + verified status. |
| **Account → Connected Calendars** | The tutor's calendar (Google / Outlook). |
| **Integrations → API** | Personal Access Token (PAT). |
| **Integrations → Webhooks** | The 3 subscriptions listed in §2.7. |
| **Event Types** | Create the event type per session. |

### 2.5 API keys to generate

| Name | Where | Env var |
|---|---|---|
| Personal Access Token | Integrations → API → **Create personal access token** → scope `default` (read event types + invitees; the code in `apps/web/services/calendar/calendly.ts:30-57` only does GET) | `CALENDLY_PERSONAL_TOKEN` |

**Do not** create an OAuth app — the codebase uses a
Personal Access Token, not OAuth. Creating an OAuth app
adds an unused secret.

### 2.6 OAuth applications to create

None. The codebase does not use Calendly OAuth. If a
future sprint needs OAuth (e.g. to allow multiple tutor
Calendly accounts), the v2 Calendly OAuth app is a
Sprint 5+ scope item.

### 2.7 Webhooks to configure

Calendly webhooks are **per-subscription**, scoped to a
URL. Add 3 subscriptions in **Integrations → Webhooks → Add
webhook subscription**:

| Event | URL | Why |
|---|---|---|
| `invitee.created` | `https://<staging-host>/api/webhooks/calendly` | A new booking is made → forward to n8n → create Zoom meeting. |
| `invitee.updated` | Same URL | Reschedule → void old Zoom, create new. |
| `invitee.canceled` | Same URL | Cancel → delete Zoom, send cancellation email. |

For each subscription:

- **URL:** the Vercel / preview / production URL of the
  Next.js app. **Use the staging URL first.**
- **Signing key:** after creating the subscription,
  Calendly displays the signing key **once** — copy it
  immediately into the password manager. The same
  signing key works for all 3 subscriptions on the same
  account.
- **Events:** as above (one per subscription).
- **Scope:** "Organization" if the account is a team
  account (you have multiple Calendly users); "User" for
  the single-account setup.

### 2.8 Callback URLs

Calendly does not call back to a redirect URI. The
**webhook URL** above is the only callback. There is no
OAuth callback.

### 2.9 Redirect URIs

None.

### 2.10 Environment variables that will use these credentials

| Env var | Source |
|---|---|
| `CALENDLY_PERSONAL_TOKEN` | From §2.5. |
| `CALENDLY_WEBHOOK_SIGNING_KEY` | From §2.7. |
| `NEXT_PUBLIC_CALENDLY_URL` | The public Calendly profile URL — `https://calendly.com/<username>` — used by the marketing CTA in `apps/web/components/marketing/calendly-embed.tsx`. |

### 2.11 Which project files depend on these credentials

| File | What it uses |
|---|---|
| `apps/web/services/calendar/calendly.ts` | `CALENDLY_PERSONAL_TOKEN` (Bearer). |
| `apps/web/app/api/webhooks/calendly/route.ts` | `CALENDLY_WEBHOOK_SIGNING_KEY` (HMAC-SHA256 over `t.body`). |
| `apps/web/components/marketing/calendly-embed.tsx` | `NEXT_PUBLIC_CALENDLY_URL` (the embed iframe `src`). |
| `apps/web/messages/{en,fr}.json` | `Marketing.calendlyCta` and similar keys — no credentials, just copy. |

### 2.12 How to verify the integration is ready

1. **PAT round-trip:** in a shell,
   ```bash
   curl -s -H "Authorization: Bearer $CALENDLY_PERSONAL_TOKEN" \
     https://api.calendly.com/users/me | jq '.resource.uri'
   ```
   You should see the Calendly user URI.
2. **Webhook signing key round-trip:** in a shell, with
   a test payload of your choice,
   ```bash
   T=$(date +%s)
   SIG=$(printf "%s.%s" "$T" "$BODY" | openssl dgst -sha256 -hmac "$CALENDLY_WEBHOOK_SIGNING_KEY" -hex | awk '{print $2}')
   curl -X POST -H "Calendly-Webhook-Signature: t=$T,v1=$SIG" \
     -H "Content-Type: application/json" --data "$BODY" \
     https://<staging-host>/api/webhooks/calendly
   ```
   You should see `{"received": true}` and a row in
   `webhook_events`.
3. **Event type live:** open the event type URL
   (e.g. `https://calendly.com/<username>/30min`) in an
   incognito tab. You should see the booking page.
4. **End-to-end test (do this last):** book a real slot
   with a real email. The Calendly webhook should fire →
   Next.js should record a `webhook_events` row → n8n
   should create the Zoom meeting → confirmation email
   should arrive.

### 2.13 Common mistakes to avoid

- **Do not put the event-type URL in
  `NEXT_PUBLIC_CALENDLY_URL`.** That var is the **public
  profile** URL (`/calendly.com/<username>`), not the
  per-event URL. The event-type URL lives on the
  `sessions.calendly_event_uri` column in the DB.
- **Do not mix the signing key for staging and
  production.** If you do, the production webhook will
  fail signature verification when it fires against
  the staging key. Each environment needs its own
  subscription.
- **Do not subscribe at the organization level if your
  account is single-user.** Calendly will reject the
  subscription with `403`. Subscribe at the user level.
- **Do not forget to verify the email** in §2.3. The PAT
  can be created before verification, but webhooks
  will not deliver to an unverified account.

### 2.14 Dependencies on other services

- **Depends on:** nothing.
- **Required for:** the student booking flow (Sprint 4
  end-to-end). Can be provisioned in parallel with
  Stripe / Zoom / Resend.

---

## 3. Stripe

### 3.1 Purpose in this project

Stripe is the **payment processor** for the v2 unit of
payment (`session_grants`). The flow is:

1. Student picks a course → admin (or student) creates a
   `session_grants` row in `pending_payment` status.
2. Next.js `POST /api/session-grants/[id]/stripe-session`
   → calls n8n `enrollment-created` workflow → n8n
   creates the Stripe Checkout Session → returns the URL.
3. Student completes Checkout.
4. Stripe fires `checkout.session.completed` webhook →
   Next.js flips the `session_grants.status` to
   `active` and the `payments.status` to `succeeded`.

### 3.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **Stripe — Standard** | 1.5% + €0.25 per EU card transaction | **No monthly fee.** This is the default. The platform is pre-revenue; there is no business case for the discounted **Custom** plan yet. |
| **Stripe — Custom** | Negotiated rate | Once revenue exceeds ~€100 k / month. Defer. |

**Activate the account** before generating API keys. KYC
takes 1–3 business days. Do it on day one.

### 3.3 Account creation steps

1. Go to `https://dashboard.stripe.com/register`.
2. Use the **business email**. The account email is what
   Stripe sends 2FA and security alerts to.
3. **Activate the account:** Settings → **Account
   settings** → **Business settings** → fill in the
   legal entity, the bank account for payouts, the
   tax info, the business address. Stripe cannot issue
   live-mode keys until activation is complete.
4. Enable 2FA: **Settings → Team and security → 2FA** →
   TOTP or **hardware key** (recommended).
5. **Switch to live mode** (top-right toggle) when ready
   to take real payments. Test mode is the default until
   then.

### 3.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Home** | Account status (Test / Live mode indicator). |
| **Settings → Business settings** | KYC + payouts + tax. |
| **Settings → Team and security** | 2FA, API keys, restricted keys. |
| **Settings → Branding** | Logo + brand colour (Checkout page). |
| **Developers → API keys** | The 3 keys in §3.5. |
| **Developers → Webhooks** | The endpoint in §3.7. |
| **Products** | Where you create the per-course Prices (Sprint 5+; for v1, the route uses `STRIPE_PRICE_TABLE_JSON`). |
| **Payments** | The list of received payments. |
| **Connect** | Defer (Sprint 5+; we do not use Stripe Connect for v1). |

### 3.5 API keys to generate

**Do not** use the **default secret key** (`sk_live_…`)
in the Next.js app. Use a **Restricted key** instead.
Restricted keys can be scoped to the exact resources the
app needs and to specific IPs.

| Name | Where | Scopes | Env var |
|---|---|---|---|
| Restricted secret key | Developers → API keys → **Create restricted key** → name `vedioconference-server` | Resource: `Checkout Sessions` (write + read), `Refunds` (write + read), `Customers` (read). **No** `payment_intents` write (the webhook is the only writer). | `STRIPE_SECRET_KEY` |
| Webhook signing secret | Developers → Webhooks → §3.7 (revealed once when you add the endpoint) | (n/a — it is a signing secret, not a key with scopes) | `STRIPE_WEBHOOK_SECRET` |

**Important:** generate **two** Restricted keys — one for
**test mode** (env: `staging` / `preview`) and one for
**live mode** (env: `production`). The two are separate
and Stripe does not let you mix them.

### 3.6 OAuth applications to create

None. The Stripe SDK uses a secret key, not OAuth.

### 3.7 Webhooks to configure

In **Developers → Webhooks → Add endpoint**:

| Field | Value |
|---|---|
| **Endpoint URL** | `https://<staging-host>/api/webhooks/stripe` |
| **Description** | `Vedioconference — Next.js booking webhook` |
| **API version** | **`2024-06-20`** (must match `lib/stripe/client.ts:15`). Do **not** accept the "upgrade to latest" prompt — the code targets this version. |
| **Events to send** | `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded` |

After saving, Stripe **reveals the signing secret once**
(`whsec_…`). Copy it into the password manager
immediately. The same secret is the value of
`STRIPE_WEBHOOK_SECRET` in Vercel.

Repeat for the **live-mode** endpoint (the URL becomes
`https://<prod-host>/api/webhooks/stripe`). The two
endpoints have different signing secrets.

### 3.8 Callback URLs

The webhook URL above is the only callback. Stripe does
not call back to a redirect URI for the Checkout flow
(the redirect is to your `success_url` / `cancel_url`,
which are configured in the `n8n` workflow that creates
the Checkout Session — those URLs point back to
`https://<host>/<locale>/booking/success?session_id={CHECKOUT_SESSION_ID}`).

### 3.9 Redirect URIs

No OAuth redirect URIs. The Checkout success / cancel
URLs are **not** OAuth redirects — they are
`success_url` / `cancel_url` query parameters on the
Checkout Session, configured in the n8n workflow. They
are not configured on the Stripe dashboard.

### 3.10 Environment variables that will use these credentials

| Env var | Source |
|---|---|
| `STRIPE_SECRET_KEY` | From §3.5. |
| `STRIPE_WEBHOOK_SECRET` | From §3.7. |
| `STRIPE_PRICE_TABLE_JSON` | A JSON string of the form `{ "<session_grant_uuid>": "price_xxx", ... }`. Optional for v1 (empty → 503). Sprint 5+ scope to populate. |
| `STRIPE_PRICE_PAYG` | Legacy v1, no longer read by current code. **Leave empty.** |
| `STRIPE_PRICE_SUBSCRIPTION` | Legacy v1, no longer read. **Leave empty.** |

### 3.11 Which project files depend on these credentials

| File | What it uses |
|---|---|
| `apps/web/lib/stripe/client.ts` | `STRIPE_SECRET_KEY` (lazy init). |
| `apps/web/lib/env.ts` | All 5 STRIPE_* vars. |
| `apps/web/app/api/webhooks/stripe/route.ts` | `STRIPE_WEBHOOK_SECRET` (signature verify). |
| `apps/web/app/api/session-grants/[id]/stripe-session/route.ts` | `N8N_ENROLLMENT_WEBHOOK_URL` (delegates to n8n; does not call Stripe directly). |
| `apps/web/app/api/session-grants/[id]/refund/route.ts` | `N8N_ENROLLMENT_WEBHOOK_URL` (delegates to n8n). |
| `n8n/workflows/enrollment-created.json` | The Stripe credential. |
| `n8n/workflows/module-cancellation.json` | The Stripe credential (for refund-trigger). |

### 3.12 How to verify the integration is ready

1. **API key round-trip:** in a shell,
   ```bash
   curl -s -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance | jq '.mode'
   ```
   You should see `"test"` (or `"live"` in production).
2. **Webhook signature round-trip:** in a shell, with a
   test payload,
   ```bash
   T=$(date +%s)
   SIG=$(printf "%s.%s" "$T" "$BODY" | openssl dgst -sha256 -hmac "$STRIPE_WEBHOOK_SECRET" -hex | awk '{print $2}')
   curl -X POST -H "Stripe-Signature: t=$T,v1=$SIG" \
     -H "Content-Type: application/json" --data "$BODY" \
     https://<staging-host>/api/webhooks/stripe
   ```
   You should see `{"received": true}`.
3. **End-to-end test (last step):** use the Stripe CLI to
   forward local events:
   ```bash
   stripe listen --forward-to https://<staging-host>/api/webhooks/stripe
   stripe trigger checkout.session.completed
   ```
   The webhook should fire; the `webhook_events` table
   should have a new row.

### 3.13 Common mistakes to avoid

- **Do not use the default secret key (`sk_live_…`).**
  Always use a **Restricted** key. The default key has
  full account access; a leak compromises the entire
  Stripe account.
- **Do not accept Stripe's "upgrade API version" prompt.**
  The code is pinned to **`2024-06-20`**. Newer API
  versions add breaking changes to webhook payloads.
- **Do not share the test-mode and live-mode keys.**
  Stripe will accept the test-mode key against the
  live-mode API and vice-versa, with confusing
  `401` / `404` errors. Use a separate Vercel env
  scope per mode.
- **Do not forget the `STRIPE_PRICE_TABLE_JSON` map
  for v1 production.** Empty → 503 on every Checkout.
  Populate it for at least the demo `session_grant` rows
  in `supabase/seed/000_seed.sql`.
- **Do not skip the KYC step.** Without it, the live-mode
  endpoint rejects all real cards with `card_decline_rate_exceeded`.

### 3.14 Dependencies on other services

- **Depends on:** n8n (the `enrollment-created` workflow
  must be active before the Checkout flow can complete).
- **Required for:** the v2 unit-of-payment
  (`session_grants`); the booking flow will not
  progress past the "click Buy" button without it.

---

## 4. Zoom

### 4.1 Purpose in this project

Zoom is the **video-conferencing provider** for the
per-session meetings. The flow is:

1. Student books a slot on Calendly → `invitee.created`
   webhook → Next.js forwarder → n8n `session-booking-to-zoom`
   workflow.
2. n8n calls Zoom `POST /users/{ZOOM_DEFAULT_HOST_USER_ID}/meetings`
   with the booking's start time / duration → receives a
   `meeting_id`, `join_url`, and `start_url`.
3. n8n POSTs `meeting_created` to Next.js `/api/webhooks/n8n`
   → Next.js upserts a `meeting_links` row keyed by
   `session_booking_id`.
4. Confirmation emails (with `join_url`) go to the
   student + tutor.

### 4.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **Zoom — Pro** | $13.33 / month per host | 1 host user, 100 participants, 30-hour meetings. Covers the v1 use case (1 tutor, 1 student, 60-min sessions). |
| **Zoom — Business** | $21.33 / month per host | Adds cloud recording, branding. Defer to Sprint 5+ (post-session resources are a Phase 4 backlog item). |
| **Zoom — Enterprise** | $30+ / month per host | 300+ participants, dedicated support. Not needed. |

**Pro is the minimum tier that allows Server-to-Server
OAuth apps.** Free Zoom accounts do not.

### 4.3 Account creation steps

1. Go to `https://zoom.us/signup` → **Sign Up** (Pro
   plan).
2. Use the **business email**. The Zoom account email is
   what the tutor uses to host meetings.
3. Activate the account: verify the email, set a
   password, enable 2FA (**Settings → Security → 2FA**).
4. **Designate a host user.** This is the user that the
   `ZOOM_DEFAULT_HOST_USER_ID` points to. For v1 (one
   tutor), this is the tutor's own Zoom account. **The
   host user must have a Pro (or higher) license**;
   free users cannot host scheduled meetings.
5. If the host user is **not** the same as the account
   owner: the host user must be a member of the same
   Zoom account (sign up separately, then invite via
   **Admin → Users → Add User**).

### 4.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Admin → Account Management → Account Profile** | The `Account ID` (a UUID, **not** the user ID). |
| **Admin → User Management → Users → <host user>** | The `User ID` (a UUID or email-encoded ID) — this is `ZOOM_DEFAULT_HOST_USER_ID`. |
| **Marketplace → Develop → Build App** | Where the S2S-OAuth app in §4.6 is created. |
| **Settings → Meeting → Schedule Meeting** | Default meeting settings (mute on entry, waiting room). |
| **Settings → Security → 2FA** | TOTP / hardware key. |
| **Settings → Recording** | Defer to Sprint 5+ (cloud recording). |

### 4.5 API keys to generate

Zoom S2S-OAuth does **not** use API keys in the
traditional sense. It uses 3 OAuth credentials (see
§4.6). There is no separate API key to generate.

### 4.6 OAuth applications to create

**One** Server-to-Server OAuth app, in **Marketplace →
Develop → Build App → Server-to-Server OAuth**:

| Field | Value |
|---|---|
| **App name** | `Vedioconference` |
| **Company / Developer contact** | The business email. |
| **Short description** | `Internal: creates per-session Zoom meetings for Vedioconference bookings.` |
| **Feature: Meeting** | Subscribed. **Scopes:** `meeting:write:admin` (create + update + delete meetings), `user:read:admin` (lookup the host user). |
| **Feature: User** | Subscribed (required for `user:read:admin`). |
| **Feature: Webinar** | Not subscribed. |
| **Feature: Recording** | Not subscribed (Sprint 5+). |

After saving, Zoom shows 3 credentials **once**:

| Credential | Where it goes |
|---|---|
| **Account ID** | `ZOOM_ACCOUNT_ID` (a UUID, not the user ID). |
| **Client ID** | `ZOOM_CLIENT_ID`. |
| **Client Secret** | `ZOOM_CLIENT_SECRET`. |

### 4.7 Webhooks to configure

**Defer.** The `meeting.ended` webhook + the matching
Next.js `/api/webhooks/zoom` route is a Sprint 5+ scope
item. The `module-completed.json` n8n workflow depends on
this webhook, but that workflow is not activated in
Sprint 4 (per §1.13). If you choose to land the webhook
early, add a **Feature → Event subscription** to the S2S
app:

| Event | URL (to be set up in a future sprint) |
|---|---|
| `meeting.ended` | `https://<prod-host>/api/webhooks/zoom` (route does not exist yet) |

For Sprint 4: **skip the webhook subscription**.

### 4.8 Callback URLs

The S2S-OAuth app has a "Redirect URL" field, but the
client-credentials grant does not use it (there is no
end-user OAuth flow). Leave the field blank or set it to
a placeholder like `https://zoom.us`.

### 4.9 Redirect URIs

None.

### 4.10 Environment variables that will use these credentials

| Env var | Source |
|---|---|
| `ZOOM_ACCOUNT_ID` | From §4.6. |
| `ZOOM_CLIENT_ID` | From §4.6. |
| `ZOOM_CLIENT_SECRET` | From §4.6. |
| `ZOOM_DEFAULT_HOST_USER_ID` | The User ID from §4.4 (the host user). |

### 4.11 Which project files depend on these credentials

| File | What it uses |
|---|---|
| `apps/web/lib/zoom/client.ts` | The 3 OAuth creds (S2S token). |
| `apps/web/services/zoom/meetings.ts` | The token (via `zoomFetch`). |
| `n8n/workflows/session-booking-to-zoom.json` | The n8n Zoom credential (same S2S app). |
| `n8n/workflows/session-cancellation.json` | Same credential. |
| `n8n/workflows/session-reschedule.json` | Same credential. |

**Note:** the Next.js app does **not** call Zoom on the
booking path. The `lib/zoom/client.ts` file exists for
unit-testability and for the future "direct call" path
(never approved; kept as a typed surface). The actual
call on the booking path is made by n8n.

### 4.12 How to verify the integration is ready

1. **Token round-trip:** in a shell (with the 4 env vars
   set),
   ```bash
   curl -s -X POST https://zoom.us/oauth/token \
     -d "grant_type=account_credentials&account_id=$ZOOM_ACCOUNT_ID" \
     -u "$ZOOM_CLIENT_ID:$ZOOM_CLIENT_SECRET" | jq '.access_token'
   ```
   You should see a JWT-shaped string.
2. **User lookup round-trip:**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://api.zoom.us/v2/users/$ZOOM_DEFAULT_HOST_USER_ID" | jq '.id'
   ```
   You should see the same User ID.
3. **Test meeting creation:** in a shell, with the
   token from step 1,
   ```bash
   curl -s -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"topic":"Sprint4 test","type":2,"start_time":"2027-01-01T10:00:00Z","duration":30}' \
     "https://api.zoom.us/v2/users/$ZOOM_DEFAULT_HOST_USER_ID/meetings" | jq '.id'
   ```
   You should see a meeting ID. **Delete it manually
   from the Zoom UI after the test** — the test
   creates a real meeting that counts against the
   host's quota.
4. **End-to-end test:** book a real Calendly slot. The
   n8n `session-booking-to-zoom` workflow should create
   a meeting; the `meeting_links` row should appear in
   Supabase; the `join_url` should be in the
   confirmation email.

### 4.13 Common mistakes to avoid

- **Do not put the user email in
  `ZOOM_DEFAULT_HOST_USER_ID`.** The code passes the
  value to `/users/{id}/meetings` — the API expects the
  User ID (UUID or encoded email). For the host user,
  copy the ID from the **Users** page, not from their
  profile URL.
- **Do not use a free Zoom account.** Free accounts
  cannot create scheduled meetings via the API; the
  request returns `400` with `subcode: 4700`.
- **Do not put the client secret in the Next.js
  bundle.** It is a server-only env var; the
  `serverEnv()` helper in `apps/web/lib/env.ts`
  enforces this. Test the bundle output with
  `pnpm build && grep -r ZOOM_CLIENT_SECRET .next/`
  (should return no results).
- **Do not skip the `meeting:write:admin` scope.** The
  default S2S scope is read-only; you must add the
  write scope explicitly to create meetings.
- **Do not generate the S2S credentials, save them,
  then change the S2S app's scopes.** Zoom invalidates
  the credentials on scope change. Re-generate.

### 4.14 Dependencies on other services

- **Depends on:** Calendly (the host user must exist
  before the S2S app is created, because the
  `meeting:write:admin` scope is checked against the
  user). Can be provisioned in parallel with Stripe +
  Resend.
- **Required for:** the booking flow's video
  conferencing; the flow will not progress past the
  Calendly booking confirmation without a meeting
  being created.

---

## 5. Resend

### 5.1 Purpose in this project

Resend is the **transactional email provider** for the
platform. The 6 React Email templates in
`apps/web/lib/email/templates/` are dispatched via Resend:

1. `enrollment-confirmed.tsx` — the student's enrollment
   is active.
2. `session-booking-confirmed.tsx` — a specific session
   is booked.
3. `reminder-24h.tsx` — T-24h reminder.
4. `reminder-1h.tsx` — T-1h reminder.
5. `session-cancelled.tsx` — cancellation notice.
6. `admin-dead-letter.tsx` — admin failure digest.

Two send paths:

- **Direct:** `apps/web/app/api/contact/route.ts` sends
  the contact form email directly to Resend.
- **Via n8n:** every other email is triggered by an n8n
  workflow that POSTs to `apps/web/app/api/webhooks/n8n?type=email`
  → Next.js renders the React Email template → Resend.

The send is **mock-gated**: empty `RESEND_API_KEY` →
returns `{ id: 'mock' }`, no destructive call. The app
runs without a Resend key (the `RESEND_FROM_EMAIL` is
defaulted to `no-reply@example.com`).

### 5.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **Resend — Free** | $0 / month, 100 emails / day, 3 000 / month | Covers v1 (low traffic). Defer upgrading until you exceed 3 000 / month. |
| **Resend — Pro** | $20 / month, 50 000 emails / month | When you exceed 3 000. |

The **sending domain** (verified in §5.4) is independent
of the plan. Verify the domain on the Free plan.

### 5.3 Account creation steps

1. Go to `https://resend.com/signup`.
2. Use the **business email**. 2FA via TOTP or hardware
   key in **Settings → Security → 2FA**.
3. Verify the account email.
4. **Create the team** (one team per environment:
   `integrale-staging`, `integrale-prod`).
5. **Add team members** in **Settings → Team**.

### 5.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Domains** | Where you verify the sending domain in §5.5. |
| **API Keys** | Where you generate the API key in §5.6. |
| **Emails** | The transactional log (every sent email, with delivery status). |
| **Webhooks** | Where you receive Resend's delivery events (bounces, complaints) in §5.7. |
| **Settings → Audit Log** | Compliance trail. |
| **Settings → Team** | 2FA + member management. |

### 5.5 Sending domain to verify

**Do not** send from `@gmail.com`, `@yahoo.com`, or any
ISP domain. SPF / DKIM / DMARC will fail and the email
will land in spam.

| Field | Value |
|---|---|
| **Domain to add** | A subdomain dedicated to email, e.g. `mail.integrale.app` (not the bare `integrale.app` — subdomain isolation protects the apex). |
| **Records to add at the DNS provider** | Resend displays 3 records: 1 SPF (TXT), 1 DKIM (CNAME), 1 return-path (MX). The exact values are in the **Domains → Add Domain** flow. |
| **`RESEND_FROM_EMAIL`** (the value to use as `from:`) | `no-reply@mail.integrale.app` (or your subdomain). |

DNS propagation takes up to 48 hours. **Start the domain
verification on day one** (before the email send is
needed).

### 5.6 API keys to generate

In **API Keys → Create API Key**:

| Name | Scope | Env var |
|---|---|---|
| `vedioconference-staging` | `Sending access`, restricted to the staging sending domain | `RESEND_API_KEY` (in Vercel `Preview`) |
| `vedioconference-prod` | `Sending access`, restricted to the production sending domain | `RESEND_API_KEY` (in Vercel `Production`) |

**Do not** create a "Full access" key. Restrict each key
to the domains it can send from — a leaked staging key
cannot send from `integrale.app`.

### 5.7 Webhooks to configure

**Recommended** but not required for v1. In **Webhooks →
Add Webhook**:

| Field | Value |
|---|---|
| **URL** | `https://<staging-host>/api/webhooks/resend` (route does not exist yet — Sprint 5+ scope to land). |
| **Events** | `email.delivered`, `email.bounced`, `email.complained`, `email.opened` (the last is for analytics, opt-in). |

For Sprint 4: **skip the webhook subscription**. The
bounce / complaint data is in the Resend dashboard's
**Emails** page.

### 5.8 Callback URLs

The webhook URL above is the only callback. Resend does
not call back to a redirect URI.

### 5.9 Redirect URIs

None.

### 5.10 Environment variables that will use these credentials

| Env var | Source |
|---|---|
| `RESEND_API_KEY` | From §5.6. |
| `RESEND_FROM_EMAIL` | From §5.5. |

### 5.11 Which project files depend on these credentials

| File | What it uses |
|---|---|
| `apps/web/lib/email/client.ts` | `RESEND_API_KEY`. |
| `apps/web/lib/email/send.ts` | `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. |
| `apps/web/lib/email/templates/*` | The 6 React Email templates. |
| `apps/web/app/api/contact/route.ts` | Sends directly via Resend. |
| `apps/web/app/api/webhooks/n8n/route.ts` | The `?type=email` branch sends via Resend. |
| `n8n/workflows/*.json` (all email workflows) | The n8n Resend credential. |

### 5.12 How to verify the integration is ready

1. **API key round-trip:**
   ```bash
   curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
     https://api.resend.com/domains | jq '.data | length'
   ```
   You should see `≥1` (the staging domain).
2. **Domain verification status:** in **Domains** page,
   the status should be **Verified** (not "Pending").
3. **Send a test email:** in **Emails → Send Test**,
   send to your own address. The test should arrive
   within 60 seconds. **Check the spam folder** — if
   it lands there, the SPF / DKIM / DMARC records are
   wrong.
4. **End-to-end test:** complete a real booking on
   staging. The confirmation email should arrive within
   60 seconds.

### 5.13 Common mistakes to avoid

- **Do not skip the DNS records.** Resend's "Verified"
   badge does **not** mean the email will land in the
   inbox. The SPF / DKIM / DMARC records at the DNS
   provider are what determines inbox placement.
- **Do not use the bare apex domain** (`integrale.app`)
   as the sending domain. Use a subdomain
   (`mail.integrale.app`). If the email-sending
   subdomain is compromised, the apex (and your
   website) is not affected.
- **Do not put a real user's email in the `from:`
   field.** Use `no-reply@…`. The `from:` address
   receives bounces and complaints; an admin inbox is
   the correct destination.
- **Do not share the API key.** It can send from any
   domain the team owns — including a teammate's
   personal domain. Restrict to the staging or
   production sending domain.
- **Do not forget that the `RESEND_FROM_EMAIL` must
   match the verified domain.** If the domain is
   `mail.integrale.app`, the `from:` must be
   `*@mail.integrale.app`.

### 5.14 Dependencies on other services

- **Depends on:** DNS (Cloudflare / Route 53 / etc. — you
  must own the apex domain to add the subdomain). This
  is **independent** of the other 5 services.
- **Required for:** every email send on the booking
  path. The platform is technically usable without
  Resend (the mock gate returns `{id: 'mock'}`), but
  the student never receives the confirmation.

---

## 6. Vercel

### 6.1 Purpose in this project

Vercel is the **Next.js hosting platform**. Three
projects (one per environment) per
`docs/deployment/Deployment.md` §1:

1. `production` — the public app (`app.integrale.app`).
2. `staging` — the pre-production app
   (`staging.integrale.app`).
3. `preview` — per-PR previews
   (`<pr-number>--integrale.vercel.app`).

Vercel auto-detects the App Router and runs the 4
quality-gate checks on every push (lint / type-check /
test / build).

### 6.2 Recommended plan

| Plan | Price | Why this fits |
|---|---|---|
| **Vercel — Pro** | $20 / month per member | Custom domains, password protection, team collaboration, 1 TB bandwidth. Covers v1. |
| **Vercel — Hobby** | $0 | Personal / non-commercial only. **Do not** use for production. |
| **Vercel — Enterprise** | Custom | SOC 2, SSO, custom SLA. Defer to when the platform has paying customers. |

**Pro** is the minimum production-quality tier. The
Hobby plan is restricted by Vercel's terms to non-commercial
use.

### 6.3 Account creation steps

1. Go to `https://vercel.com/signup`.
2. **Sign up with GitHub** (this is the recommended path
   — Vercel needs the GitHub OAuth scope to deploy
   branches). The GitHub repo is `Varshith631/...` (the
   same GitHub account that owns the Vercel account
   simplifies the OAuth grant).
3. **Create a Vercel team** in **Settings → General →
   Team Name** (`integrale`).
4. Invite the second operator in **Settings → Members**.
5. Enable 2FA: **Settings → Security → 2FA**.

### 6.4 Dashboard pages you need to visit

| Page | Why |
|---|---|
| **Dashboard → New Project** | Where you create the 3 projects in §6.5. |
| **Project → Settings → General** | Project name, build settings. |
| **Project → Settings → Environment Variables** | Where you set the 22+ env vars. |
| **Project → Settings → Domains** | Where you add the custom domain. |
| **Project → Deployments** | The deploy log. |
| **Project → Logs** | Runtime logs (the serverless function output). |
| **Team → Settings → Billing** | Pro plan, payment method. |
| **Team → Settings → Members** | Team members + roles. |

### 6.5 Projects to create

Three projects, all pointing to the **same GitHub
repo**:

| Project name | Git branch | Domain | Purpose |
|---|---|---|---|
| `vedioconference-production` | `main` | `app.integrale.app` | The public app. |
| `vedioconference-staging` | `staging` | `staging.integrale.app` | Pre-production. |
| (preview) | every PR branch | `<pr-number>--vedioconference.vercel.app` | Auto-created per PR. |

**Important:** the Git branch `main` is gated by the
standing constraint "do not commit anything". The
**Vercel project can be created now**, but the first
deploy will not happen until the user explicitly approves
a commit to `main` (per `docs/architecture/Architecture.md`
and `CLAUDE.md` §3.1).

### 6.6 API keys to generate

Vercel does not need an API key for the Next.js app.
The Vercel CLI uses a token (`vercel login` issues one
to your local machine), but the deployed Next.js app
does not call Vercel's API.

### 6.7 OAuth applications to create

None for the Vercel side. The Vercel account is
authorised via the **GitHub OAuth grant** at signup
(§6.3).

### 6.8 Webhooks to configure

Vercel webhooks are **outgoing** (Vercel → your service
on deploy events). The Next.js app does not consume
Vercel webhooks. Skip.

If you want a Slack notification on every deploy, add a
Slack incoming webhook in **Project → Settings →
Notifications → Slack**. This is optional and unrelated
to the Sprint 4 integration.

### 6.9 Callback URLs

None. Vercel does not call back to a redirect URI for
the Next.js app.

### 6.10 Redirect URIs

None.

### 6.11 Environment variables that will use these credentials

The 22+ env vars from §1.10, §2.10, §3.10, §4.10,
§5.10 — all of them, scoped per environment in
**Project → Settings → Environment Variables**. The
recommended scoping:

| Env var scope | Set in |
|---|---|
| **Production** | `vedioconference-production` only. |
| **Preview** | `vedioconference-staging` + every PR preview. |
| **Development** | The local `.env.local` (you). |

For the **Supabase** vars (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`),
the **staging and production Vercel projects can share the
same Supabase project** for Sprint 4 (use a separate
Supabase branch in a future sprint). The other vars
must be scoped per environment (the Stripe test key in
Preview, the live key in Production).

### 6.12 Which project files depend on these credentials

Every server-side env var in the codebase is consumed
by Vercel at runtime. The specific files are listed in
§1.11 / §2.11 / §3.11 / §4.11 / §5.11 above.

Vercel-specific files:

| File | What it uses |
|---|---|
| `apps/web/next.config.mjs` | (None — Vercel-specific, but no env vars.) |
| `apps/web/middleware.ts` | Reads cookies (Supabase JWT) — no env vars. |
| `.github/workflows/ci.yml` | Runs on GitHub, not Vercel. |
| `vercel.json` | Not present (Next.js 15 auto-detects). |

### 6.13 How to verify the integration is ready

1. **Project created:** in the Vercel dashboard, the
   project appears with a **building** status.
2. **Environment variables set:** every env var in
   §1.10 / §2.10 / §3.10 / §4.10 / §5.10 is set with
   the correct scope. The 4 Supabase vars are also set.
3. **First deploy:** push a commit to the `staging`
   branch (after explicit user approval) → Vercel
   auto-deploys → the build log shows the 4 quality
   gates passing → the deployment URL returns
   `200 OK` on `https://<staging-host>/<locale>`.
4. **Domain attached:** add the `staging.integrale.app`
   custom domain in **Project → Settings → Domains →
   Add** → update the DNS provider with the CNAME
   Vercel shows → wait for SSL provisioning.
5. **End-to-end test:** sign in as a student on
   `staging.integrale.app` → complete a real booking
   → every email arrives → the Zoom link is valid.

### 6.14 Common mistakes to avoid

- **Do not put `NEXT_PUBLIC_*` on the Production
  environment but not the Preview environment.** Vercel
  scopes per environment; a missing var on Preview
  causes confusing `undefined` errors only on PR
  previews.
- **Do not commit a real `.env.local` to GitHub.** The
  file is `.gitignore`d; double-check. A real commit
  triggers the gitleaks pre-commit hook and the
  `secret-scan` CI workflow.
- **Do not skip the Vercel team's billing setup.** A
  Pro plan team without a payment method will pause
  deploys after the 7-day grace period.
- **Do not push to `main` before the user approves.**
  Per `CLAUDE.md` §3.1, the locked architecture forbids
  unapproved commits; pushing to `main` without
  approval is a process violation.

### 6.15 Dependencies on other services

- **Depends on:** GitHub (Vercel reads from the GitHub
  repo); the env vars from §§ 1–5.
- **Required for:** the entire app to be reachable on
  the public internet. Without a Vercel project, the
  Sprint 4 work has no live surface to deploy to.

---

## 7. Master Checklist (Execution Order)

> The phases below are ordered to **minimise blocked
> time**. Provision n8n first (it has no dependencies);
> provision Stripe, Zoom, Calendly, Resend in parallel
> (none of them depend on each other); provision Vercel
> last (it depends on the env vars from the other 5).
> The webhook URLs (Calendly → Next.js, Stripe → Next.js)
> **can only be set after Vercel has the staging
> URL** — so Vercel is technically the
> dependency for webhook configuration, not for account
> creation. This is why the checklist is split: §A
> creates the accounts + secrets; §B configures the
> webhooks once the Vercel URL is known.

### Phase A — Create accounts + secrets (parallel, ~2 days)

#### A.1 — n8n Cloud (no dependencies)

- [ ] Sign up at `https://n8n.cloud` with the business email.
- [ ] Choose the **Starter** plan.
- [ ] Enable 2FA on the workspace owner.
- [ ] Note the **workspace URL** → `N8N_BASE_URL`.
- [ ] Generate the **API key** (Settings → API) → `N8N_API_KEY`.
- [ ] Generate the **webhook secret** with `openssl rand -hex 32` → `N8N_WEBHOOK_SECRET` (reuse across every workflow + the Next.js env var).

#### A.2 — Calendly (no dependencies)

- [ ] Sign up at `https://calendly.com` with the business email.
- [ ] Subscribe to **Standard** plan ($16 / month).
- [ ] Connect the tutor's calendar (Google / Outlook).
- [ ] Set the **profile username** to a short, brand-friendly value.
- [ ] Enable 2FA.
- [ ] Generate the **Personal Access Token** (Integrations → API) → `CALENDLY_PERSONAL_TOKEN`.
- [ ] Note the **public profile URL** (`https://calendly.com/<username>`) → `NEXT_PUBLIC_CALENDLY_URL`.

#### A.3 — Stripe (no dependencies on the dashboard; depends on activation)

- [ ] Sign up at `https://dashboard.stripe.com/register` with the business email.
- [ ] Activate the account (KYC: business entity, bank account, tax info, address). **Allow 1–3 business days.**
- [ ] Enable 2FA (Settings → Team and security).
- [ ] **Switch to live mode** when ready for production.
- [ ] Generate the **Restricted secret key** (Developers → API keys) with scopes `checkout.sessions:write+read`, `refunds:write+read`, `customers:read` → `STRIPE_SECRET_KEY` (separate keys for test mode and live mode).

#### A.4 — Zoom (no dependencies on the dashboard; depends on Pro plan)

- [ ] Sign up at `https://zoom.us/signup` with the business email.
- [ ] Subscribe to **Pro** plan ($13.33 / month).
- [ ] Verify the email.
- [ ] Enable 2FA.
- [ ] **Designate a host user** (the tutor). The host user must have a Pro license.
- [ ] Note the **Account ID** (Admin → Account Profile) → `ZOOM_ACCOUNT_ID`.
- [ ] Note the **host User ID** (Admin → User Management → Users → <host user>) → `ZOOM_DEFAULT_HOST_USER_ID`.
- [ ] Create the **Server-to-Server OAuth app** (Marketplace → Develop → Build App → Server-to-Server OAuth) with scopes `meeting:write:admin` + `user:read:admin` → `ZOOM_CLIENT_ID` + `ZOOM_CLIENT_SECRET` (shown once on save).

#### A.5 — Resend (no dependencies on the dashboard; depends on DNS)

- [ ] Sign up at `https://resend.com/signup` with the business email.
- [ ] Verify the account email.
- [ ] Enable 2FA.
- [ ] Create the **team** (`integrale`).
- [ ] **Add the sending domain** (Domains → Add Domain) — use a subdomain like `mail.integrale.app`.
- [ ] **Add the 3 DNS records** (SPF, DKIM, return-path) at the DNS provider. **Allow up to 48 hours for propagation.**
- [ ] Once verified, note the `from:` address (e.g. `no-reply@mail.integrale.app`) → `RESEND_FROM_EMAIL`.
- [ ] Generate the **API key** (API Keys → Create API Key) restricted to the sending domain → `RESEND_API_KEY` (separate keys for staging and production).

#### A.6 — Vercel (depends on the 5 above for env vars)

- [ ] Sign up at `https://vercel.com/signup` **with GitHub**.
- [ ] Create a **Vercel team** (`integrale`).
- [ ] Subscribe to **Pro** plan ($20 / month per member).
- [ ] Invite the second operator.
- [ ] Enable 2FA.
- [ ] **Create the 3 projects** (Dashboard → New Project), all pointing to the GitHub repo:
  - [ ] `vedioconference-production` (branch `main`).
  - [ ] `vedioconference-staging` (branch `staging`).
  - [ ] `vedioconference-preview` (auto-created per PR).
- [ ] **Do not deploy yet** — the `main` branch has the standing "no commits" constraint.

### Phase B — Webhook configuration (after Vercel has the staging URL)

#### B.1 — Set the staging Vercel env vars

- [ ] In `vedioconference-staging` → Settings → Environment Variables, set the env vars in this scope (Preview):
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` (the existing Supabase URL).
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the existing anon key).
  - [ ] `NEXT_PUBLIC_SITE_URL=https://staging.integrale.app`.
  - [ ] `NEXT_PUBLIC_DEFAULT_LOCALE=fr`.
  - [ ] `NEXT_PUBLIC_DEFAULT_TIMEZONE=Europe/Paris`.
  - [ ] `NEXT_PUBLIC_CALENDLY_URL=https://calendly.com/<username>`.
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (the existing service-role key — **must be rotated before any production deploy**).
  - [ ] `STRIPE_SECRET_KEY` (the **test-mode** Restricted key from A.3).
  - [ ] `STRIPE_WEBHOOK_SECRET` (the test-mode webhook secret from B.4).
  - [ ] `ZOOM_ACCOUNT_ID` (from A.4).
  - [ ] `ZOOM_CLIENT_ID` (from A.4).
  - [ ] `ZOOM_CLIENT_SECRET` (from A.4).
  - [ ] `ZOOM_DEFAULT_HOST_USER_ID` (from A.4).
  - [ ] `CALENDLY_PERSONAL_TOKEN` (from A.2).
  - [ ] `CALENDLY_WEBHOOK_SIGNING_KEY` (from B.3).
  - [ ] `RESEND_API_KEY` (the **staging** API key from A.5).
  - [ ] `RESEND_FROM_EMAIL=no-reply@mail.integrale.app`.
  - [ ] `N8N_BASE_URL` (from A.1).
  - [ ] `N8N_API_KEY` (from A.1).
  - [ ] `N8N_WEBHOOK_SECRET` (from A.1).
  - [ ] `N8N_ENROLLMENT_WEBHOOK_URL` (from B.5 below).
  - [ ] `LOG_LEVEL=debug` (use `info` for production).
  - [ ] `SENTRY_DSN` (leave empty — Phase 5).

#### B.2 — Deploy to staging

- [ ] Push a commit to the `staging` branch (after explicit user approval per the standing constraint).
- [ ] Wait for the 4 CI quality gates (lint / type-check / test / build) to pass on the PR.
- [ ] Merge to `staging`.
- [ ] Vercel auto-deploys. Note the **staging URL** (`https://staging.integrale.app`).
- [ ] Smoke-test: `curl -I https://staging.integrale.app/en` should return `200 OK`.

#### B.3 — Configure the Calendly webhook

- [ ] In Calendly → Integrations → Webhooks → Add subscription:
  - [ ] Event: `invitee.created` → URL: `https://staging.integrale.app/api/webhooks/calendly`.
  - [ ] Event: `invitee.updated` → URL: same.
  - [ ] Event: `invitee.canceled` → URL: same.
- [ ] Copy the **signing key** (shown once) → `CALENDLY_WEBHOOK_SIGNING_KEY`.

#### B.4 — Configure the Stripe webhook

- [ ] In Stripe → Developers → Webhooks → Add endpoint:
  - [ ] URL: `https://staging.integrale.app/api/webhooks/stripe`.
  - [ ] API version: **`2024-06-20`** (do not accept the upgrade prompt).
  - [ ] Events: `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`.
- [ ] Copy the **signing secret** (shown once) → `STRIPE_WEBHOOK_SECRET`.

#### B.5 — Configure the n8n webhooks

- [ ] In n8n → Workflows → `enrollment-created` (after import) → open the Webhook node → note the **production URL**.
- [ ] Set `N8N_ENROLLMENT_WEBHOOK_URL` to that URL in the Vercel staging env vars.
- [ ] Set the `X-Webhook-Secret` header on the Webhook node to the value of `N8N_WEBHOOK_SECRET` (the same hex string as in §A.1).
- [ ] Repeat for the 7 other workflows that expose Webhook nodes (the 9th — `meeting.ended` — is not activated in Sprint 4).

#### B.6 — Configure the Zoom S2S app

- [ ] In Zoom → Marketplace → Develop → Build App → the app from A.4 → Features → Meeting → Scopes → verify `meeting:write:admin` + `user:read:admin` are checked.
- [ ] **Skip the Event subscription** (`meeting.ended`) for Sprint 4 (Sprint 5+).

#### B.7 — Configure the Resend domain

- [ ] In Resend → Domains → the `mail.integrale.app` domain → status should be **Verified**.
- [ ] **Skip the webhook subscription** for Sprint 4 (Sprint 5+).

### Phase C — Pre-Sprint-4 readiness verification

#### C.1 — Stripe round-trip

- [ ] From a shell, `curl -s -u "$STRIPE_SECRET_KEY:" https://api.stripe.com/v1/balance | jq '.mode'` → should print `test`.
- [ ] From a shell, send a signed test webhook → should get `{"received": true}`.

#### C.2 — Calendly round-trip

- [ ] From a shell, `curl -s -H "Authorization: Bearer $CALENDLY_PERSONAL_TOKEN" https://api.calendly.com/users/me | jq '.resource.uri'` → should print a Calendly URI.
- [ ] From a shell, send a signed test webhook → should get `{"received": true}`.

#### C.3 — Zoom round-trip

- [ ] From a shell, request a token → should print a JWT-shaped string.
- [ ] From a shell, request `GET /users/{ZOOM_DEFAULT_HOST_USER_ID}` → should print the same User ID.
- [ ] From a shell, create a test meeting → should print a meeting ID. **Delete the meeting from the Zoom UI immediately.**

#### C.4 — Resend round-trip

- [ ] From a shell, list domains → should include `mail.integrale.app` with `status: "verified"`.
- [ ] From the Resend dashboard, send a test email → should arrive within 60 seconds (check spam).

#### C.5 — n8n round-trip

- [ ] From a shell, list workflows via the API → should return `{"data": [], "nextCursor": null}` (or the 9 imported workflows).
- [ ] From a temporary Webhook node, send a test POST with the `X-Webhook-Secret` header → should record an execution.

#### C.6 — Vercel round-trip

- [ ] `curl -I https://staging.integrale.app/en` → should return `200 OK`.
- [ ] `curl -I https://staging.integrale.app/fr` → should return `200 OK`.

### Phase D — End-to-end smoke test (the gate for Sprint 4 implementation)

#### D.1 — Student signs up

- [ ] Open `https://staging.integrale.app/fr/auth/register` in a browser.
- [ ] Sign up with a real email (the tutor's email).
- [ ] Confirm the email (Resend → confirmation template).
- [ ] Sign in.

#### D.2 — Student books a session

- [ ] Open the course detail page.
- [ ] Click the Calendly embed.
- [ ] Pick a time slot in the next 7 days.
- [ ] Confirm the booking on Calendly.
- [ ] The Calendly webhook should fire → Next.js should record a `webhook_events` row → n8n should create a Zoom meeting → a `meeting_links` row should appear in Supabase → the confirmation email should arrive.

#### D.3 — Tutor receives the meeting

- [ ] Check the tutor's Zoom account → the meeting should be on the calendar.
- [ ] Check the tutor's email → the host start URL should be in the notification email.

#### D.4 — Admin sees the booking

- [ ] Sign in as admin.
- [ ] Open `/admin/bookings` → the new booking should appear with the meeting status badge "Zoom link created".
- [ ] Open `/admin/bookings/[id]` → the host start URL should be in the Meeting card.

#### D.5 — Cancellation

- [ ] As the student, cancel the booking.
- [ ] The cancellation webhook should fire → n8n should delete the Zoom meeting → the cancellation email should arrive.
- [ ] Re-check `/admin/bookings/[id]` → the meeting status badge should say "Awaiting Zoom link".

### Phase E — Promotion to production (after D passes)

#### E.1 — Repeat B.1, B.3, B.4, B.5 for production

- [ ] In `vedioconference-production` → Settings → Environment Variables, set the env vars in the **Production** scope (using the **live-mode** Stripe key, the **production** Resend key, etc.).
- [ ] Configure the Stripe **live-mode** webhook.
- [ ] Configure the Calendly **production** webhook (or share the staging webhook if the same URL pattern works).
- [ ] Configure the n8n **production** webhooks.

#### E.2 — Custom domain

- [ ] In Vercel → `vedioconference-production` → Settings → Domains → add `app.integrale.app`.
- [ ] Add the CNAME record at the DNS provider.
- [ ] Wait for SSL provisioning (Vercel issues a Let's Encrypt cert automatically).

#### E.3 — Final pre-prod checks

- [ ] Rotate the Supabase keys that are currently in `apps/web/.env.example` (the standing "security follow-up" from the B2 close-out).
- [ ] Update `apps/web/.env.example` to ship placeholders only.
- [ ] Run the RLS smoke suite against the production Supabase.
- [ ] Run the 4 quality gates locally (`pnpm type-check && pnpm lint && pnpm test && pnpm build`).

#### E.4 — Promotion

- [ ] Merge `staging` → `main` (after explicit user approval per the standing constraint).
- [ ] Vercel auto-deploys the production project.
- [ ] `curl -I https://app.integrale.app/en` → `200 OK`.
- [ ] Tag the release (`git tag v<x.y.z>-phase<n>-sprint<m>`).
- [ ] Write the Sprint 4 close-out summary in `docs/review/`.

---

## 8. Open questions (no work begins until answered)

1. **Are the 6 services going to be created by the
   operator before Sprint 4 starts, or should the
   assistant wait for them?** (The current standing
   constraint is "do not commit anything", which the
   assistant reads as "do not start Sprint 4".)
2. **Is the workflow filename cleanup
   (`module-*.json` → `session-*.json`) in Sprint 4
   scope, or should it be deferred to avoid breaking
   any active n8n import?**
3. **Is the "Resend email" admin action in Sprint 4
   scope, or does the disabled button stay for
   Phase 5?**
4. **Is the tutor edit / archive form in Sprint 4
   scope, or is it a Sprint 5 item?**
5. **Should the `.env.example` Supabase keys be
   rotated + replaced with placeholders as part of
   Sprint 4.0, or as a separate pre-Sprint 4
   security task?**

---

*Last updated: 2026-07-20. Owner: project lead. This is
a read-only setup guide. No code modified, no Sprint 4
work started, no external service connection attempted.*
