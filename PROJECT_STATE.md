# PROJECT STATE

> **Single source of truth for "where the project is right now".**
> Update this file at the end of every milestone (or weekly,
> whichever is shorter). It is the file a new developer reads first
> when they join the team.

---

## Project name

**Vedioconference — Course Platform**
Internal codename: `vedioconference`
Repository: `C:\Vedioconference`

## Current phase

**Phase 1 — Foundation** → **CLOSED (approved)**.

## Current status

🟢 **Ready for Phase 2.**
Phase 1 has been formally reviewed (`docs/review/PHASE1_REVIEW.md`)
and approved. All critical and high-severity findings have been
remediated. The architecture is **frozen** and the repository is
organised for long-term, multi-session, multi-phase development.

## Phase completion summary

| Phase | Scope | Status | Date |
|---|---|---|---|
| **1** | Foundation, schema, docs, n8n plan | ✅ Approved | 2026-07-07 |
| 2 | Marketing site, auth UI, dashboard shell | 🟡 Next | — |
| 3 | n8n workflows, Stripe, Calendly, Zoom | ⏳ | — |
| 4 | Admin dashboard | ⏳ | — |
| 5 | Resources, notifications, polish | ⏳ | — |
| 6 | E2E tests, observability, deploy | ⏳ | — |

## Completed deliverables (Phase 1)

### Repository scaffolding

- pnpm monorepo (`apps/web`, scripts, n8n, supabase, docs).
- EditorConfig, Prettier, ESLint, TypeScript strict mode.
- 3 GitHub Actions workflows (`ci`, `codeql`, `secret-scan`).

### Supabase

- 8 SQL migrations (`20260707000001_…` → `…_0008_…`), idempotent.
- 18 tables, 4 enums, RLS on every public table, 3 storage
  buckets, 5 triggers (audit, late-cancel, tutor-overlap, role
  self-escalation, tutor immutability).
- `supabase/config.toml` (auth, JWT, password policy).
- `supabase/seed/000_seed.sql` (idempotent dev data).

### Next.js application

- App Router, RSC, typed routes.
- Supabase clients: `client` (browser), `server` (RLS), `admin`
  (webhook / register only).
- Auth: middleware + admin layout + role helpers.
- API surface: 21 route handlers (auth, profile, courses, tutors,
  bookings, resources, admin, webhooks, health).
- Forms: login, register, forgot-password (react-hook-form + Zod).
- UI primitives: Button, Toaster; Tailwind + shadcn design tokens.

### n8n

- 8 workflows documented (`n8n/docs/WORKFLOWS.md`) and exported
  as JSON placeholders.
- 5 credentials defined.
- Deploy script (`scripts/deploy-n8n.sh`).

### Documentation (24 files)

- 4 architecture documents + 4 Mermaid diagrams.
- 1 database reference.
- 1 API reference.
- 1 folder-structure reference.
- 1 development roadmap.
- 1 deployment + 1 environment reference.
- 1 security reference + 1 coding-standards reference.
- 1 booking-flow walkthrough.
- 1 error-handling reference, 1 logging reference, 1 monitoring
  reference, 1 disaster-recovery reference.
- 1 technical-debt register.
- 1 phase-1 review + 1 remediation note.
- 1 n8n workflow reference.

### Reviews & sign-off

- `docs/review/PHASE1_REVIEW.md` — formal architecture review.
- `docs/review/REMEDIATION.md` — every change that the review
  forced, with reasons.

## Remaining phases (preview)

| Phase | Scope | Target | Exit criterion |
|---|---|---|---|
| 2 | Marketing, auth UI, dashboard shell | 1 wk | Sign up → log in → empty dashboard live |
| 3 | Stripe + Calendly + Zoom + n8n | 2 wk | Book → pay → Zoom → email end-to-end |
| 4 | Admin dashboard | 1.5 wk | Catalog + bookings managed from admin |
| 5 | Resources, notifications, polish | 1 wk | WCAG 2.1 AA, 0 critical Sentry issues |
| 6 | Hardening, E2E, deploy | 1 wk | e2e green, runbook signed off |

Total: ~6.5 weeks (one full-stack engineer).

## Current tech stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router, RSC) | TypeScript strict |
| Styling | Tailwind CSS 3 + shadcn/ui design tokens | — |
| Forms | react-hook-form + Zod | — |
| Server | Next.js Route Handlers | App Router |
| Auth | Supabase Auth | JWT in httpOnly cookies |
| Database | Supabase Postgres 15 | RLS, PITR, EU region |
| Storage | Supabase Storage | 3 buckets (avatars, course-covers, resources) |
| Automation | n8n | Self-hosted or n8n.cloud |
| Scheduling | Calendly Standard | embed + webhook |
| Payments | Stripe Checkout | webhook signed + idempotent |
| Video | Zoom (Server-to-Server OAuth) | — |
| Email | Resend | transactional |
| Hosting | Vercel | EU region (cdg1) |
| Versioning | Git + GitHub | `main` / `staging` / `feat/*` |
| CI | GitHub Actions | lint, type-check, test, build, codeql, gitleaks |
| Package manager | pnpm 9 | workspaces |

## Current architecture

Locked. See `docs/architecture/Architecture.md`. The full diagram is
in `docs/architecture/SYSTEM_ARCHITECTURE.mmd`. The data flow is:

```
Student → Next.js 15 (Vercel)
              ↘ SSR + RSC
                Supabase (Auth + Postgres + RLS + Storage)
              ↗ webhooks
            n8n
              ↘
                {Calendly, Stripe, Zoom, Resend}
              ↗
            Supabase write-back  → Dashboard reflects the new state
```

Key invariants:

- n8n is the **only** system that calls Stripe / Zoom for the
  critical booking path. The Next.js app holds no Zoom secret and
  no service-role key for booking mutations.
- Every external call is **idempotent** (Stripe `idempotency_key`,
  `webhook_events` table, `meeting_links.booking_id` UNIQUE,
  `notifications` dedupe).
- Every public table is RLS-protected. Admin powers go through
  `public.is_admin()` / `public.is_super_admin()` helper functions.
- Service-role key is restricted to `app/api/webhooks/**` and
  `app/api/auth/register/**` by layer rules (see FolderStructure.md).

## Current folder structure

See `docs/FolderStructure.md` for the annotated tree. The skeleton
is finalised; Phase 2 adds marketing-page files, components and
tests under the existing folders — no new top-level folders.

```
vedioconference/
├── apps/web/                  # Next.js 15
│   ├── app/(marketing|auth|dashboard|admin|api)
│   ├── components/(ui|layout|marketing|dashboard|admin|forms|shared)
│   ├── hooks, lib, services, types, styles, public, tests
│   ├── middleware.ts
│   ├── next.config.mjs (CSP, HSTS, security headers)
│   └── .env.example
├── supabase/                  # config.toml + migrations/* + seed/*
├── n8n/                       # workflows/* + docs/WORKFLOWS.md
├── docs/                      # 24 .md / .mmd files
├── scripts/                   # db-push, db-url, db-types, deploy-n8n
└── .github/workflows/         # ci, codeql, secret-scan
```

## Current database status

- **Postgres 15** (Supabase, EU region).
- **18 tables** in production schema:
  `profiles`, `tutors`, `courses`, `course_tutors`, `bookings`,
  `payments`, `meeting_links`, `resources`, `resource_grants`,
  `notifications`, `audit_logs`, `subscriptions`, `coupons`,
  `invoices`, `webhook_events`, `n8n_executions`, `n8n_dead_letters`,
  `+ auth.users` (Supabase-managed).
- **4 enums** (`user_role`, `booking_status`, `payment_status`,
  `payment_provider`, `subscription_status`, `coupon_kind`,
  `invoice_status`).
- **RLS enabled on every public table** with explicit policies
  documented in `docs/database/Database.md`.
- **5 triggers** (auto-updated_at, audit, tutor-overlap, role
  self-escalation, tutor-profile immutability, late-cancel).
- **3 storage buckets** (avatars / course-covers / resources).
- **Type generation:** `pnpm db:types` writes
  `apps/web/types/database.generated.ts`.
- **Migrations are forward-only.** New SQL changes ship as new
  files; never edit an applied migration.

## Current API status

- **21 route handlers** under `apps/web/app/api/**`.
- All mutating bodies validated with **Zod**; errors converted to
  a typed JSON envelope by `errorResponse()`.
- **Webhooks signed**: Stripe (`stripe-signature`), Calendly
  (`Calendly-Webhook-Signature`), n8n (`X-Webhook-Secret`).
- **Idempotent**: Stripe via `webhook_events.event_id UNIQUE`,
  Calendly via the same table, n8n via `event_id` when present.
- **Health endpoint:** `GET /api/health` (liveness + readiness).
- **Auth endpoint:** sign up forces `email_confirm: false` and
  re-sends the verification email; forgot-password returns
  identical responses with a constant-time delay.
- **Business rule:** a student cannot cancel a booking less than
  1 hour before the start time (enforced server-side and by a
  trigger).

## Current security status

- **OWASP ASVS L1** audit completed (see `docs/review/PHASE1_REVIEW.md` §5).
- **RLS** on every table; **no** policy allows anonymous reads of
  PII.
- **JWT** in `httpOnly Secure SameSite=Lax` cookies; rotating
  refresh tokens.
- **CSP**, **HSTS**, **X-Frame-Options**, **X-Content-Type-Options**,
  **Referrer-Policy**, **Permissions-Policy** emitted from
  `next.config.mjs`.
- **Secret-scan** in CI (gitleaks).
- **CodeQL** weekly + on every PR.
- **No secrets in the repo**; only `.env.example`.
- **Audit log** on `bookings`, `payments`, `profiles` (append-only).
- **Account-lockout, MFA, full rate limiting** → Phase 5
  (tracked in `docs/TechnicalDebt.md`).

## Current n8n status

- 8 workflows **designed and documented** in
  `n8n/docs/WORKFLOWS.md`. JSON exports in
  `n8n/workflows/*.json` are placeholders that the deploy script
  will install in Phase 3.
- Triggers / actions / credentials / retries / dead-letter all
  specified.
- **Implementation starts in Phase 3.**

## Current deployment status

- **Local:** `pnpm dev` (Next.js) + `supabase start` (DB, auth,
  storage).
- **Preview:** Vercel auto-deploys every PR.
- **Staging:** Vercel `staging` branch → linked Supabase staging
  → n8n staging.
- **Production:** Vercel `main` → Supabase production (EU) →
  n8n production.
- **No production deployment yet** (Phase 6 deliverable).
- **CI:** green-on-PR required for merge to `main`.

## Current documentation status

- 24 documents / diagrams under `docs/`.
- Cross-references validated (`PROJECT_INDEX.md` is the navigation
  hub).
- Every doc is dated and versioned implicitly through the git
  history.
- **No broken links** as of this commit (validated by the
  consistency audit on 2026-07-07).

## Outstanding technical debt

See `docs/TechnicalDebt.md` for the full list (34 items). The
highest-impact items:

| ID | Item | Plan |
|---|---|---|
| TD-004 | Rate limiting (Upstash) | Phase 5 |
| TD-005 | PII redaction in logs | Phase 5 |
| TD-006 | GDPR data-export endpoint | Phase 5 |
| TD-007 | ClamAV file-upload scan | Phase 6 |
| TD-013 | Streaming SSR on `/dashboard` | Phase 2 |
| TD-015 | shadcn component set | Phase 2 |
| TD-026 | Vitest coverage ≥ 70% | Phase 6 |
| TD-027 | Playwright e2e | Phase 6 |
| TD-028 | k6 load test | Phase 6 |

## Known risks

| ID | Risk | Owner | Mitigation |
|---|---|---|---|
| R-01 | n8n becomes a SPOF | DevOps | Self-hosted + S3 backup + n8n.cloud fallback |
| R-02 | Stripe rate limits under load | Tech Lead | Restricted keys + n8n queue + Phase 5 rate limit |
| R-03 | Zoom S2S credential leak | SRE | Quarterly rotation + secret-scan in CI |
| R-04 | GDPR non-compliance at launch | PM | DPIA + Operations Guide in Phase 6 |
| R-05 | Tutor double-booking under high load | DBA | Trigger `fn_no_tutor_overlap` (in place) |

## Next phase objectives (Phase 2)

- Marketing site (Landing, About, Courses, Tutors, Pricing, Contact).
- Full auth UI (login, register, forgot-password, reset-password, verify-email).
- Dashboard shell (sidebar, header, profile, bookings, resources pages).
- CI green from day 1.
- Streaming SSR on `/dashboard`.
- Marketing-page cache headers.

**Acceptance criteria:** Lighthouse ≥ 90 (perf/a11y/SEO) on
marketing pages, smoke test for `register → login → dashboard` is
green.

## Estimated overall progress

**~17%** of the project (Phase 1 = ~17% of the 6-phase plan).

| Phase | Weight | % Complete |
|---|---|---|
| 1 | 17% | **17%** ✅ |
| 2 | 17% | 0% |
| 3 | 33% | 0% |
| 4 | 17% | 0% |
| 5 | 8% | 0% |
| 6 | 8% | 0% |

## Last updated

**2026-07-07** by the Phase 1 architecture review.
