# PHASES

> The complete phase plan, from Phase 1 (closed) to the final
> deployment phase. Every phase has explicit objectives, deliverables,
> acceptance criteria, and exit criteria.
>
> This is the single page a Tech Lead reads to know what to do next.

---

## Phase 1 — Foundation ✅ DONE

**Objective:** Document every architectural decision, freeze the
schema, lay out the folder structure, produce the n8n workflow plan.

### Deliverables

- ✅ Folder structure finalised
- ✅ Supabase schema (8 migrations) + RLS + storage
- ✅ TypeScript / Next.js app skeleton (App Router + RSC)
- ✅ Auth flow (Supabase + middleware + roles)
- ✅ n8n workflow plan (8 workflows documented, not implemented)
- ✅ API surface (21 route handlers)
- ✅ Documentation set (24 docs)
- ✅ Coding standards and branch strategy
- ✅ 4 Mermaid diagrams (ER, system, user, auth)
- ✅ Formal architecture review (closed)

### Acceptance criteria

- Every architecture decision documented in `DECISIONS.md`.
- Schema passes `supabase db reset` cleanly.
- `pnpm type-check && pnpm lint && pnpm build` would pass on a real
  machine.

### Exit criteria

- ✅ Phase 1 review approved (`docs/review/PHASE1_REVIEW.md`).
- ✅ No critical or high findings outstanding.
- ✅ `docs/TechnicalDebt.md` lists the remaining low/medium items.

---

## Phase 2 — Marketing, Auth UI, Dashboard shell  🔜 NEXT

**Objective:** A runnable Vercel deployment with the marketing
site, full auth, and an empty student dashboard. CI must be green
from day 1.

### Deliverables

- **M2.1 Marketing site**
  - Landing (hero, features, tutor preview, testimonials, CTA)
  - About
  - Courses list + course detail (slug-driven)
  - Tutors directory
  - Pricing
  - Contact (form + Resend or admin email)
  - All pages SSR with public Supabase data
  - `Cache-Control: s-maxage=60, stale-while-revalidate=600` on
    public pages
- **M2.2 Auth UI**
  - Sign up with `acceptTerms`
  - Sign in
  - Forgot / reset password
  - Verify email
  - Sign out (global)
  - All forms: react-hook-form + Zod + shadcn Form
- **M2.3 Dashboard shell**
  - Sidebar + header
  - Profile (read + edit)
  - Bookings (placeholder list)
  - Resources (placeholder list)
  - Empty-state widgets
- **M2.4 CI green**
  - `pnpm lint && pnpm type-check && pnpm test && pnpm build` on
    every PR
  - Vercel preview deploys linked in the PR

### Acceptance criteria

- Lighthouse ≥ 90 (perf / a11y / SEO) on the marketing site.
- A new visitor can sign up, verify their email, sign in, and see
  the empty dashboard.

### Exit criteria

- Smoke test `register → verify → login → dashboard` passes in CI.
- Marketing pages pass axe-core with 0 critical issues.
- No PR is merged to `main` without a green CI run.

---

## Phase 3 — Booking, Stripe, Calendly, Zoom  ⏳

**Objective:** Students can browse a course, pick a slot, pay, and
receive a Zoom link by email with reminders.

### Deliverables

- **M3.1 Stripe Checkout integration**
  - `POST /api/bookings/checkout` (booking row first, then Stripe)
  - `POST /api/webhooks/stripe` (signature-verified, idempotent)
  - Refund path via the cancellation flow
- **M3.2 n8n workflows live**
  - `booking-to-payment` (Calendly → Supabase → Stripe)
  - `payment-to-zoom` (Stripe → Zoom → Supabase)
  - `confirmation-email` (Supabase → Resend)
  - `reminder-scheduler` (cron 15 min)
  - `cancellation`
  - `reschedule`
  - `admin-notification`
  - `tutor-notification`
- **M3.3 Calendly embed on course detail**
  - Widget + availability fetch
  - "Slot taken" recovery
- **M3.4 Zoom meeting creation**
  - Server-to-Server OAuth token cache
  - Host = tutor's Zoom user
  - Reconciliation subflow for orphan meetings
- **M3.5 Resend email templates**
  - `BookingConfirmed` (React Email)
  - `BookingReminder24h`
  - `BookingReminder1h`
  - `BookingCancelled`
  - `BookingRescheduled`

### Acceptance criteria

- A signed-in student can book, pay, and receive a working Zoom
  link by email within 60 seconds.
- T-24h and T-1h reminders fire from the cron workflow.
- All three reminders are visible in the admin notification log.

### Exit criteria

- A full end-to-end test (`docs/review/SMOKETEST.md` from Phase 2)
  passes in staging with real third-party test accounts.
- `n8n_dead_letters` is empty after the test.

---

## Phase 4 — Admin dashboard  ⏳

**Objective:** Admins can manage courses, tutors, resources, and
bookings from a single UI.

### Deliverables

- **M4.1 Admin overview KPIs**
- **M4.2 Course CRUD** (with image upload to `course-covers`)
- **M4.3 Tutor CRUD** (with avatar upload, Calendly + Zoom wiring)
- **M4.4 Bookings table** (filter by status, date, student, tutor;
  manual confirm / cancel / refund / resend email)
- **M4.5 Students list** (with last login, total spend, lifetime
  bookings)
- **M4.6 Resources library** (upload to `resources` bucket, set
  visibility)
- **M4.7 Coupons admin** (CRUD on `coupons`)
- **M4.8 Audit log viewer** (filter, search, export CSV)

### Acceptance criteria

- A new tutor + course can be onboarded purely from the admin UI.
- A booking can be cancelled (refund + Zoom delete) from the admin
  panel without external tools.

### Exit criteria

- A demo script (`docs/operations/ADMIN_DEMO.md`) walks through
  every admin action and is signed off by the client.

---

## Phase 5 — Resources, Notifications, Polish  ⏳

**Objective:** Tutors can share study material; students get an
in-app notification feed; UX polish; rate limiting; observability.

### Deliverables

- **M5.1 Resources UI** (per-course list, upload, download via
  signed URL)
- **M5.2 Notification bell + feed** (in-app, mark-as-read, infinite
  scroll)
- **M5.3 Cancel / reschedule UI for students** (1h window rule)
- **M5.4 Accessibility audit** (axe, NVDA, contrast)
- **M5.5 Rate limiting** (Upstash Redis, per-IP + per-user counters)
- **M5.6 Sentry** (browser + server)
- **M5.7 Status page** (status.example.com)
- **M5.8 i18n (en-US)** (machine-translated, not native review)
- **M5.9 Dark mode** (shadcn dark variant)

### Acceptance criteria

- WCAG 2.1 AA on every public and authenticated page.
- 0 critical Sentry issues in a 24h soak.

### Exit criteria

- Sign-off from the client on the Operations Guide draft.

---

## Phase 6 — Hardening, E2E, Deploy  ⏳

**Objective:** Production-ready: e2e tests, load test, observability,
runbook, status page, handover.

### Deliverables

- **M6.1 Playwright e2e**
  - signup → verify → login → browse → book → pay → reminder
- **M6.2 Vitest coverage ≥ 70%**
- **M6.3 k6 load test on `/api/bookings/checkout`**
- **M6.4 SLO dashboards** (Grafana JSON committed)
- **M6.5 Operations Guide (non-technical)**
- **M6.6 Incident runbook**
- **M6.7 Production cut-over**
- **M6.8 Handover session with the client**

### Acceptance criteria

- All e2e tests pass on every PR.
- Synthetic monitoring green for 72h.
- The client signs off the Operations Guide.

### Exit criteria

- `docs/PROJECT_CLOSE.md` is filed and the repo is tagged
  `v1.0.0`.

---

## How the phases interlock

```
[1]──[2]──[3]──[4]──[5]──[6]
 │    │    │    │    │    │
 ▼    ▼    ▼    ▼    ▼    ▼
Docs UI   Book  Admin Polish Prod
Schema Test ings          e2e
         Zoom             deploy
         Stripe
         Calendly
         n8n
```

Each phase may **read** the artifacts of every previous phase but
**must not** modify Phase 1 documents (schema, architecture,
security baseline) without an ADR. If a change is required, the
ADR goes through a code review that includes the architect.
