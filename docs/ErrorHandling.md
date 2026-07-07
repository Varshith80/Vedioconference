# Error handling

> Every failure mode the platform must handle, what the user sees,
> how the system recovers, and what the operator sees.

## 1. Principles

1. **Never leak internal error details to the end user.** Show a
   localized, plain-language message; log the full error server-side.
2. **Always have a default behaviour.** A missing recovery path is a
   bug, not a TODO.
3. **Idempotent retries** are safe; **non-idempotent retries are bugs**.
4. **The browser is read-only for confirmed events.** Mutations
   always go through a server route or an n8n workflow.

## 2. Layered error handling

```
[ User ]
   ↓ sees friendly message
[ Next.js route handler ]
   ↓ throws ApiError | ZodError
[ errorResponse() ]     ──→ JSON { error: { code, message, details } }
   ↓ logs (request id)
[ Supabase / n8n ]      ──→ on failure: dead-letter row + admin email
   ↓
[ Sentry ]              ──→ breadcrumb
```

## 3. Failure modes

### 3.1 Stripe failures

| Scenario | Behaviour |
|---|---|
| `card_declined` on checkout | Stripe-hosted page shows the error; user returns to `cancel_url`; no Supabase mutation. |
| Stripe API 5xx during session create | `errorResponse(502, 'payment_provider_unavailable')`; the booking remains `pending_payment`; the user can retry. |
| Stripe webhook signature invalid | `401` from `/api/webhooks/stripe`; **no** DB mutation. Logged. |
| Stripe webhook duplicate | `webhook_events` table has UNIQUE on `event_id`; second insert raises a constraint error → handler returns 200 (idempotent). |
| Refund fails | n8n retries 3×; on failure inserts to `n8n_dead_letters`; admin email; booking marked `cancelled` with `metadata.refund_error`. |
| Partial refund not allowed | Use a full refund. Logged. |

### 3.2 Zoom failures

| Scenario | Behaviour |
|---|---|
| OAuth token refresh fails | n8n retries 3×; falls back to admin email; meeting creation is retried manually from the admin panel. |
| Zoom returns 4xx (e.g. invalid user) | n8n logs; admin email; booking stays `pending_payment`. |
| Zoom returns 5xx | n8n retries with backoff; failure → dead-letter. |
| Zoom meeting created but DB update fails | Compensation: an n8n subflow "delete orphan meetings" runs every hour and reconciles `meeting_links` vs Zoom. |
| Host not available | Tutor's Zoom `user_id` is checked at booking time; admin notified if absent. |

### 3.3 Calendly failures

| Scenario | Behaviour |
|---|---|
| Calendly API 401 | n8n credential rotated automatically (Phase 3); admin email. |
| Calendly slot already taken | Tutor cannot be double-booked; the user is asked to pick a new slot. |
| Calendly webhook signature invalid | `401`; logged. |
| Calendly returns 5xx during availability fetch | The embed shows "temporarily unavailable"; cache the last-known availability for 15 min. |

### 3.4 Resend failures

| Scenario | Behaviour |
|---|---|
| Resend 4xx (invalid `to` address) | Logged; admin email; user sees "we couldn't send your email". |
| Resend 5xx | n8n retries 3×; failure → dead-letter; admin email. |
| Bounce / spam complaint | `profiles.email_bounced_at` set; subsequent transactional emails are blocked until the address is fixed. |

### 3.5 Database failures

| Scenario | Behaviour |
|---|---|
| Postgres 5xx | `errorResponse(503, 'service_unavailable')`; client retries. |
| Constraint violation | `errorResponse(409, 'conflict')`; details include the failing constraint. |
| Connection pool exhausted | Supavisor queues; client sees 503 with `Retry-After`. |
| RLS denies write | `errorResponse(403, 'forbidden')`; logged. |

### 3.6 Webhook failures (inbound)

| Scenario | Behaviour |
|---|---|
| Stripe webhook payload malformed | `400`; logged; **no** retry. |
| n8n webhook with invalid `X-Webhook-Secret` | `401`; logged. |
| Handler throws an exception | `500`; Stripe/n8n will retry according to their own policies; we additionally write a `webhook_events.error` row. |
| `webhook_events.event_id` already processed | `200`; no-op. |

### 3.7 n8n failures

| Scenario | Behaviour |
|---|---|
| Workflow node fails 3× | Insertion into `n8n_dead_letters`; admin email. |
| n8n itself unreachable | Stripe webhooks keep retrying (Stripe policy); once n8n is back, the queue drains. No data loss because state changes go through Supabase. |
| Partial workflow (some nodes ok, some failed) | A `compensation` subflow runs (e.g. delete the Zoom meeting if the email send fails). |

### 3.8 Network failures (client-side)

| Scenario | Behaviour |
|---|---|
| User loses connection during checkout | Stripe-hosted page; their card is not charged; on reconnect they can resume. |
| User loses connection after payment | Stripe webhook + n8n pipeline runs server-side; user refreshes the dashboard and sees the new booking. |
| User closes the tab mid-form | The `bookings` row in `pending_payment` expires after 30 min (cron cleanup). |

## 4. User-facing messages

All messages are localized in `fr-FR` and `en-US`. Examples:

| Code | `fr` | `en` |
|---|---|---|
| `validation_error` | "Certains champs ne sont pas valides." | "Some fields are not valid." |
| `unauthorized`     | "Veuillez vous connecter."          | "Please sign in." |
| `forbidden`        | "Vous n'avez pas les droits requis."| "You don't have the required permissions." |
| `not_found`        | "Élément introuvable."              | "Item not found." |
| `conflict`         | "Cet élément a déjà été modifié."   | "This item has already been updated." |
| `payment_provider_unavailable` | "Le paiement est momentanément indisponible. Réessayez." | "Payment is temporarily unavailable. Please retry." |
| `meeting_create_failed` | "Le cours est confirmé mais le lien de visioconférence sera envoyé par e-mail dès qu'il sera prêt." | "Your class is confirmed; the video link will be emailed as soon as it's ready." |
| `server_error`     | "Une erreur est survenue. Réessayez." | "Something went wrong. Please retry." |

## 5. Retry strategy

| Layer | Strategy |
|---|---|
| Browser → /api | exponential backoff (300ms × 2^attempt, max 3 attempts) on `5xx` and network errors |
| /api → Stripe | Stripe SDK built-in retry (3 attempts) on 5xx and connection errors |
| /api → n8n | explicit retry (3 attempts, 1s/3s/9s) on 5xx |
| n8n → external | Retry-on-fail node (3 attempts, exponential backoff) |
| Webhook inbound | n8n returns 5xx → Stripe retries with its own backoff |

## 6. Rollback strategy

| Operation | Rollback |
|---|---|
| Booking created | Stripe refund + delete Zoom meeting (n8n cancellation flow) |
| Stripe refund issued | Manual — Stripe does not support refund reversal |
| Zoom meeting created | `DELETE /meetings/{id}` |
| Email sent | None — but the user is told the action cannot be undone |
| Profile updated | `audit_logs` row + admin can revert from the admin panel |
| Resource deleted | none (hard delete) — but admin must confirm twice |

## 7. Operational runbook (summary)

- `pg_stat_activity` shows long queries → kill backend, alert SRE.
- `audit_logs` shows unexpected role change → page on-call, freeze
  promotions in `supabase/config.toml`.
- `n8n_dead_letters` non-empty → on-call opens the row, fixes the
  underlying issue, clicks **Retry** in the admin UI (Phase 4).
- Stripe dashboard shows `webhook delivery failing` → on-call rotates
  the endpoint secret and re-deploys.
