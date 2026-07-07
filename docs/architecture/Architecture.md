# Architecture

> Single source of truth for the platform's technical decisions.
> If a later change contradicts something in this file, this file
> wins — update it as part of the same change.

## 1. Goals

1. **Low-code / no-code first.** Use managed SaaS for everything that
   is not business logic (payments, scheduling, video, email).
2. **Single Next.js codebase** for marketing site, student space and
   admin space — no extra CMS or admin tool to maintain.
3. **Supabase as the system of record.** All persistent data and
   authentication live in one managed Postgres instance.
4. **n8n is the only "backend for backend".** Calendly, Stripe, Zoom and
   Resend talk to n8n, which talks to Supabase. The Next.js app never
   calls Stripe or Zoom directly for the critical path.
5. **Hard security boundary** through JWT + RLS for every row.

## 2. System diagram

See [`SYSTEM_ARCHITECTURE.mmd`](./SYSTEM_ARCHITECTURE.mmd).

```
Student → Next.js 15 → Supabase → n8n → {Calendly, Stripe, Zoom, Resend}
                                                  ↓
                                          Supabase (write-back)
                                                  ↓
                                          Dashboard update
```

## 3. Layered architecture (Next.js)

| Layer        | Path                                 | Responsibility |
|--------------|--------------------------------------|----------------|
| Presentation | `apps/web/app/(marketing|auth|...)`  | Pages, layouts, RSC |
| UI           | `apps/web/components/`               | Re-usable presentational + form components |
| Hooks        | `apps/web/hooks/`                    | Client-only React state |
| Services     | `apps/web/services/`                 | Server-only data access (uses Supabase + n8n) |
| Lib / utils  | `apps/web/lib/`                      | Framework adapters, helpers, error classes |
| API          | `apps/web/app/api/**/route.ts`       | HTTP edge (REST) for external callers |
| Schema       | `supabase/migrations/`               | Source of truth for persistence |

Boundaries:

- Components never import from `services/` or `lib/supabase/admin.ts`.
- Services may use `lib/supabase/server.ts` (RLS-bound) but not
  `lib/supabase/admin.ts` (only the webhook handler does).
- API routes are the only callers of `lib/stripe/client.ts` and
  `lib/email/client.ts`.

## 4. Authentication

See [`AUTH_FLOW.mmd`](./AUTH_FLOW.mmd).

- **Provider:** Supabase Auth (email + password, password recovery).
- **Session:** JWT stored in an `httpOnly`, `Secure`, `SameSite=Lax`
  cookie. The cookie is set by `@supabase/ssr` and refreshed on every
  request by `apps/web/middleware.ts`.
- **Roles:** `student` (default), `admin`, `super_admin`. Stored in
  `public.profiles.role` and exposed through the helper functions
  `public.is_admin()` / `public.is_super_admin()` so that RLS policies
  can call them.
- **Protection:**
  - `middleware.ts` blocks unauthenticated traffic to `/dashboard/**`
    and `/admin/**`.
  - `app/admin/layout.tsx` adds a role check on top of that.
  - RLS policies are the final guard at the database level.

## 5. Booking flow (end-to-end)

See [`USER_FLOW.mmd`](./USER_FLOW.mmd).

1. Student clicks **"Réserver"** on a course page.
2. The Next.js API route `POST /api/bookings/checkout` creates a
   **Stripe Checkout Session** and embeds the Calendly event link.
3. On payment success, **Stripe webhook → n8n** (`payment-to-zoom`).
4. n8n creates the **Zoom meeting** (Server-to-Server OAuth), writes a
   `meeting_links` row and a `payments` row, and updates the booking
   status to `confirmed`.
5. n8n triggers `confirmation-email`, which sends a Resend email with
   the join link.
6. n8n schedules `reminder-scheduler` (cron) to send a T-24h and T-1h
   reminder.
7. Student joins Zoom at the scheduled time. After the class, n8n (or
   a manual admin action) marks the booking `completed` and unlocks
   any associated `resources` via `resource_grants`.

## 6. Data flow rules

- The Next.js app **never writes** to the `bookings` or `meeting_links`
  tables for confirmed events. Those writes are owned by n8n, which is
  the only system with a service-role key in those flows.
- All payment / refund state changes are driven by Stripe webhooks;
  client code can only request them, not perform them.
- A single webhook entry point (`POST /api/webhooks/n8n`) accepts
  callbacks from n8n and updates Supabase using the admin client, with
  a shared secret in `X-Webhook-Secret`.

## 7. Failure / degradation modes

| Failure | Behaviour |
|---|---|
| Stripe webhook delayed | Booking stays `pending_payment`; user can retry the checkout link |
| Zoom create fails | n8n retries 3×; on permanent failure → `n8n_dead_letters` row + admin email, booking stays `pending_payment` |
| Email (Resend) fails | n8n retries; failure is logged in `n8n_executions` table |
| Supabase downtime | Next.js serves 5xx; Vercel surfaces the outage via its dashboard |
| Calendly webhook missed | Admin can trigger a manual sync from the admin dashboard (Phase 4) |

## 8. Branching & deployment

- Default branch: `main`. Everything merges via PR.
- Feature branches: `feat/<short-name>`
- Bug branches: `fix/<short-name>`
- Hotfix branches: `hotfix/<short-name>` → fast-track into `main`
- Vercel deploys every push to `main` to production.
- Preview deployments are created for every PR.

See [`docs/DevelopmentRoadmap.md`](../DevelopmentRoadmap.md) for the
release cadence and phase plan.
