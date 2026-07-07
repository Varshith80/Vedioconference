# Development roadmap

> A phase-by-phase plan with explicit milestones, deliverables, and
> definition-of-done. Update this file as phases are completed.

---

## Phase 1 — Foundation  ✅ DONE

**Goal:** document every architectural decision, freeze the schema,
lay out the folder structure, and produce the n8n workflow plan.

| # | Deliverable | Status |
|---|-------------|--------|
| 1.1 | Folder structure finalised | ✅ |
| 1.2 | Supabase schema + RLS + storage | ✅ |
| 1.3 | Auth strategy (Supabase + middleware + roles) | ✅ |
| 1.4 | n8n workflow plan (8 workflows) | ✅ |
| 1.5 | API surface (REST route handlers) | ✅ |
| 1.6 | Documentation set (README + 9 docs) | ✅ |
| 1.7 | Coding standards + branch strategy | ✅ |
| 1.8 | Mermaid diagrams (ER, system, user, auth) | ✅ |

---

## Phase 2 — Marketing, Auth, Dashboard shell  (target: 1 week)

**Goal:** a runnable Vercel deployment with the marketing site, full
auth, and an empty student dashboard.

### Milestones

- **M2.1** Marketing site live
  - Landing, About, Courses list/detail, Tutors, Pricing, Contact
  - All marketing pages SSR with public data
- **M2.2** Auth flows
  - Email + password sign up / sign in / password reset
  - Email verification
  - Protected `/dashboard` layout
- **M2.3** Dashboard shell
  - Sidebar, header, empty state widgets
  - Profile page (read + edit)
- **M2.4** CI green
  - `pnpm lint && pnpm type-check && pnpm test` on every PR
  - Vercel preview deploys

### Exit criteria

- A new visitor can sign up, verify their email, log in, and see an
  empty dashboard.
- The marketing site is Lighthouse ≥ 90 (perf / a11y / SEO).

---

## Phase 3 — Booking, Stripe, Zoom, Calendly  (target: 2 weeks)

**Goal:** students can browse a course, pick a slot, pay, and receive
a Zoom link by email.

### Milestones

- **M3.1** Stripe Checkout integration
  - `POST /api/bookings/checkout`
  - Webhook receiver (`/api/webhooks/stripe`)
- **M3.2** n8n workflows live
  - `booking-to-payment`, `payment-to-zoom`, `confirmation-email`,
    `reminder-scheduler`
- **M3.3** Calendly embed on the course detail page
- **M3.4** Zoom meeting creation (Server-to-Server OAuth)
- **M3.5** Resend email templates (4 templates)

### Exit criteria

- An end-to-end booking produces a confirmation email with a working
  Zoom link.
- T-24h and T-1h reminders fire.
- All three reminders are visible in the admin notification log.

---

## Phase 4 — Admin dashboard  (target: 1.5 weeks)

**Goal:** admins can manage courses, tutors, resources and bookings
without touching the database.

### Milestones

- **M4.1** Admin overview KPIs
- **M4.2** Course CRUD
- **M4.3** Tutor CRUD
- **M4.4** Bookings table (filter by status, date, student)
- **M4.5** Manual actions (confirm, cancel, refund, resend email)
- **M4.6** Students list

### Exit criteria

- A new tutor + course can be onboarded purely from the admin UI.
- A booking can be cancelled (refund + Zoom delete) from the admin
  panel without external tools.

---

## Phase 5 — Resources, Notifications, Polish  (target: 1 week)

**Goal:** tutors can share study material; students get an in-app
notification feed; UX polish.

### Milestones

- **M5.1** Resources (upload, list, per-course filter)
- **M5.2** Notification bell + feed
- **M5.3** Cancel / reschedule UI for students
- **M5.4** Accessibility audit (axe, NVDA)
- **M5.5** Rate limiting (Upstash) + observability (Sentry)

### Exit criteria

- WCAG 2.1 AA on every public and authenticated page.
- 0 critical Sentry issues in a 24h soak.

---

## Phase 6 — Hardening, E2E, Deploy  (target: 1 week)

**Goal:** production-ready: e2e tests, load test, observability, runbook.

### Milestones

- **M6.1** Playwright e2e (signup → book → pay → reminder)
- **M6.2** Load test (k6) of `/api/bookings/checkout`
- **M6.3** SLO dashboards (Vercel + Supabase + n8n)
- **M6.4** Incident runbook
- **M6.5** Customer-facing help centre

### Exit criteria

- All e2e tests pass on every PR.
- Synthetic monitoring green for 72h.

---

## Milestones summary

| Phase | Weeks | Exit criterion |
|-------|-------|----------------|
| 1     | 0     | ✅ All architecture, schema, docs finalised |
| 2     | 1     | Sign up → log in → empty dashboard live |
| 3     | 3     | Book → pay → Zoom → email works end-to-end |
| 4     | 4.5   | Admin can manage catalog and bookings |
| 5     | 5.5   | Resources, notifications, polish done |
| 6     | 6.5   | Production-ready, e2e green, runbook signed off |

Total estimated delivery: **6.5 weeks** (one full-stack engineer, plus
part-time n8n work in phase 3).
