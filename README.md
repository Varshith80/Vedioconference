# Vedioconference — Course Platform

> A production-ready, low-code videoconferencing tutoring platform
> for high-school and preparatory-class students. Students browse
> courses, book slots, pay online, and receive an automated Zoom
> link with email reminders. Tutors and admins are managed from a
> single admin dashboard.

**Architecture:** Next.js 15 (App Router, RSC) → Supabase (Auth,
Postgres, Storage) → n8n (automation) → Calendly + Stripe + Zoom +
Resend → Supabase write-back.

**Project status:** Phase 1 closed and approved. Ready for Phase 2.
See [`PROJECT_STATE.md`](./PROJECT_STATE.md) and
[`PHASES.md`](./PHASES.md).

---

## Table of contents

1. [Project overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology stack](#technology-stack)
4. [Project structure](#project-structure)
5. [Setup instructions](#setup-instructions)
6. [Environment variables](#environment-variables)
7. [Development workflow](#development-workflow)
8. [Available scripts](#available-scripts)
9. [Folder structure](#folder-structure)
10. [Documentation index](#documentation-index)
11. [Coding standards](#coding-standards)
12. [Contribution guide](#contribution-guide)
13. [Deployment](#deployment)
14. [Roadmap and future phases](#roadmap-and-future-phases)
15. [License](#license)

---

## Project overview

`vedioconference` is a private-lesson platform for high-school and
preparatory-class students. The original client specification is
mirrored at `docs/specification_raw.txt`.

**What the platform does:**

- Renders a marketing site (Landing, About, Courses, Tutors,
  Pricing, Contact).
- Lets a student sign up, browse courses, and book a time slot
  via a Calendly embed.
- Collects payment via Stripe Checkout (hosted).
- Creates a Zoom meeting through a Server-to-Server OAuth app,
  triggered by n8n.
- Sends the meeting link by email (Resend) and a T-24h / T-1h
  reminder.
- Provides a student dashboard (history, upcoming, resources,
  profile) and an admin dashboard (catalog, bookings, payments,
  resources, audit log).

**What the platform does NOT do** (by design — these are SaaS
integrations):

- ❌ In-house video conferencing (uses Zoom).
- ❌ In-house payments (uses Stripe).
- ❌ In-house calendar / scheduling (uses Calendly).
- ❌ In-house email infrastructure (uses Resend).

---

## Architecture

The data flow has a single invariant: **n8n is the only system that
calls Stripe / Zoom for the critical booking path**. The Next.js
app holds no Zoom secret and no service-role key for booking
mutations.

```
   ┌─────────────┐
   │   Student   │
   └──────┬──────┘
          ▼
   ┌──────────────────────────┐
   │  Next.js 15 (Vercel, EU) │   App Router + RSC + Route Handlers
   │  Supabase (RLS)          │   Auth, Postgres, Storage (EU)
   └──────┬───────────────────┘
          ▼
   ┌──────────────┐
   │     n8n      │   Self-hosted or n8n.cloud
   └─┬────┬────┬──┘
     ▼    ▼    ▼
   Calendly Stripe  Zoom  Resend
```

Full diagrams:

- [System architecture (Mermaid)](./docs/architecture/SYSTEM_ARCHITECTURE.mmd)
- [ER diagram](./docs/architecture/ER_DIAGRAM.mmd)
- [User flow](./docs/architecture/USER_FLOW.mmd)
- [Auth flow](./docs/architecture/AUTH_FLOW.mmd)
- [Booking flow walkthrough](./docs/BookingFlow.md)

Every decision is recorded in [`DECISIONS.md`](./DECISIONS.md).

---

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, RSC) + TypeScript strict |
| UI | Tailwind CSS 3 + shadcn/ui design tokens |
| Forms | react-hook-form + Zod |
| Server | Next.js Route Handlers |
| Auth | Supabase Auth (JWT in httpOnly cookies) |
| Database | Supabase Postgres 15 + RLS (EU) |
| Storage | Supabase Storage (3 buckets) |
| Automation | n8n (self-hosted or n8n.cloud) |
| Scheduling | Calendly Standard |
| Payments | Stripe Checkout (hosted) |
| Video | Zoom (Server-to-Server OAuth) |
| Email | Resend |
| Hosting | Vercel (region `cdg1`) |
| Versioning | Git + GitHub (branch protection on `main`) |
| CI | GitHub Actions (lint, type-check, test, build, codeql, gitleaks) |
| Package manager | pnpm 9 (workspaces) |

---

## Project structure

```
vedioconference/
├── apps/
│   └── web/                        # Next.js 15 application
│       ├── app/                    # App Router (RSC + route handlers)
│       ├── components/             # UI + form components
│       ├── lib/                    # Supabase / Stripe / Resend / utils
│       ├── services/               # Server-side data access
│       ├── hooks/                  # Client React hooks
│       ├── types/                  # Generated + domain types
│       ├── styles/                 # Tailwind / globals
│       ├── public/                 # Static assets
│       ├── tests/                  # Vitest + Playwright
│       ├── middleware.ts           # Auth + security headers
│       └── next.config.mjs
├── supabase/
│   ├── config.toml
│   ├── migrations/                 # 8 SQL migrations
│   ├── seed/                       # Idempotent dev seed
│   └── functions/                  # Edge functions (Phase 3+)
├── n8n/
│   ├── workflows/                  # 8 workflow JSON exports
│   ├── credentials/                # Credential templates
│   └── docs/WORKFLOWS.md           # Workflow design
├── docs/                           # 24 docs / diagrams
├── scripts/                        # db-push, db-types, db-url, deploy-n8n
├── .github/workflows/              # ci, codeql, secret-scan
├── package.json                    # pnpm workspace
└── README.md
```

The full annotated tree is in
[`docs/FolderStructure.md`](./docs/FolderStructure.md).

---

## Setup instructions

### Prerequisites

- **Node.js** 20.11+ (use `nvm install` to match `.nvmrc`)
- **pnpm** 9 (via `corepack enable && corepack prepare pnpm@9 --activate`)
- **Supabase CLI** (`brew install supabase/tap/supabase`)
- **Stripe CLI** (Phase 3, for webhook testing)
- **Docker** (Supabase local stack)

### First-time setup

```bash
# 1. Clone the repo
git clone <repo-url> vedioconference && cd vedioconference

# 2. Install dependencies
corepack enable && corepack prepare pnpm@9 --activate
pnpm install

# 3. Copy env files
cp apps/web/.env.example apps/web/.env.local
# Fill in the keys (see "Environment variables" below)

# 4. Start Supabase locally
supabase start
pnpm db:reset          # apply migrations + seed

# 5. Regenerate typed Supabase client
pnpm db:types

# 6. Start the Next.js app
pnpm dev                # http://localhost:3000
```

### Verifying the install

```bash
pnpm lint              # ESLint
pnpm type-check        # tsc --noEmit
pnpm test              # Vitest
pnpm build             # next build
```

The first time, `pnpm test` and `pnpm build` will fail because no
tests and no marketing pages exist yet (those land in Phase 2). If
you get a missing-key error from Supabase, fill in
`apps/web/.env.local`.

---

## Environment variables

The full reference is in
[`docs/deployment/Environment.md`](./docs/deployment/Environment.md).

**Public (`NEXT_PUBLIC_*`):**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the app |
| `NEXT_PUBLIC_CALENDLY_URL` | Public Calendly link (marketing CTA) |

**Server-only — Supabase / Stripe / Zoom / Calendly / Resend / n8n / Misc:**

See `docs/deployment/Environment.md` for every variable, its
meaning, and where to get the value.

> ⚠️ **Never** prefix a secret with `NEXT_PUBLIC_`.
> Never commit a real `.env.local` (it is `.gitignore`d).

---

## Development workflow

We follow **Git Flow** for a small team:

```
main              ← production (Vercel auto-deploy, protected)
 └── staging      ← release-candidate
      ├── feat/<name>
      ├── fix/<name>
      └── chore/<name>
hotfix/<name>     → fast-track into main
```

**Rules:**

- One PR per concern; small, focused diffs.
- PR into `main` requires: 1 approval + green CI.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `test:`, `build:`, `ci:`, `perf:`).
- PR template (Phase 2) enforces the checklist in
  [`docs/CodingStandards.md`](./docs/CodingStandards.md).

**Process:**

1. `git checkout -b feat/<name>` from `staging`.
2. Make changes. Keep commits atomic.
3. `pnpm lint && pnpm type-check && pnpm test && pnpm build` locally.
4. Open a PR. Vercel deploys a preview URL.
5. Reviewer approves → squash-merge into `staging`.
6. Once the staging environment is green, fast-forward `main`.

---

## Available scripts

| Command | Effect |
|---|---|
| `pnpm dev`               | Next.js dev server (Turbopack) on :3000 |
| `pnpm build`             | Production build |
| `pnpm start`             | Run the production build locally |
| `pnpm lint`              | ESLint over the workspace |
| `pnpm type-check`        | `tsc --noEmit` over the workspace |
| `pnpm test`              | Vitest run |
| `pnpm test:watch`        | Vitest watch mode |
| `pnpm test:e2e`          | Playwright E2E tests (Phase 6) |
| `pnpm format`            | Prettier write |
| `pnpm format:check`      | Prettier check |
| `pnpm db:reset`          | `supabase db reset` (drop + migrate + seed) |
| `pnpm db:push`           | `supabase db push` (apply pending migrations) |
| `pnpm db:types`          | Regenerate `apps/web/types/database.generated.ts` |
| `./scripts/deploy-n8n.sh <env>` | Deploy every workflow in `n8n/workflows/` |

---

## Folder structure

See [`docs/FolderStructure.md`](./docs/FolderStructure.md) for the
annotated tree and the **layer rules** that every PR must respect.

**TL;DR:**

- `components/` may **not** import from `services/` or `lib/supabase/admin.ts`.
- `services/` uses `lib/supabase/server.ts` (RLS-bound) only.
- `lib/supabase/admin.ts` is restricted to
  `app/api/webhooks/**` and `app/api/auth/register/**`.
- `lib/stripe/client.ts` and `lib/email/client.ts` are server-only.

---

## Documentation index

| Document | Purpose |
|---|---|
| [PROJECT_STATE.md](./PROJECT_STATE.md) | Where the project is right now |
| [PHASES.md](./PHASES.md) | Per-phase deliverables and exit criteria |
| [DECISIONS.md](./DECISIONS.md) | Every architectural decision (ADR) |
| [PROJECT_HEALTH.md](./PROJECT_HEALTH.md) | Quality report |
| [PROJECT_INDEX.md](./PROJECT_INDEX.md) | Navigation hub |
| [docs/architecture/Architecture.md](./docs/architecture/Architecture.md) | Architecture decisions |
| [docs/architecture/SYSTEM_ARCHITECTURE.mmd](./docs/architecture/SYSTEM_ARCHITECTURE.mmd) | System diagram |
| [docs/architecture/ER_DIAGRAM.mmd](./docs/architecture/ER_DIAGRAM.mmd) | ER diagram |
| [docs/architecture/USER_FLOW.mmd](./docs/architecture/USER_FLOW.mmd) | User journey |
| [docs/architecture/AUTH_FLOW.mmd](./docs/architecture/AUTH_FLOW.mmd) | Auth sequence |
| [docs/database/Database.md](./docs/database/Database.md) | Schema, RLS, indexes |
| [docs/api/API.md](./docs/api/API.md) | HTTP API reference |
| [docs/FolderStructure.md](./docs/FolderStructure.md) | Annotated tree + layer rules |
| [docs/DevelopmentRoadmap.md](./docs/DevelopmentRoadmap.md) | Phases, milestones, ETA |
| [docs/deployment/Deployment.md](./docs/deployment/Deployment.md) | Vercel + Supabase + n8n |
| [docs/deployment/Environment.md](./docs/deployment/Environment.md) | Every env var |
| [docs/security/Security.md](./docs/security/Security.md) | OWASP, headers, GDPR |
| [docs/CodingStandards.md](./docs/CodingStandards.md) | TS rules, branch strategy, review checklist |
| [docs/ErrorHandling.md](./docs/ErrorHandling.md) | Failure modes and recovery |
| [docs/Logging.md](./docs/Logging.md) | Levels, request id, redaction |
| [docs/Monitoring.md](./docs/Monitoring.md) | Health, metrics, alerts |
| [docs/DisasterRecovery.md](./docs/DisasterRecovery.md) | RPO / RTO, scenarios |
| [docs/BookingFlow.md](./docs/BookingFlow.md) | End-to-end booking walkthrough |
| [docs/TechnicalDebt.md](./docs/TechnicalDebt.md) | Open debt, severity, plan |
| [docs/review/PHASE1_REVIEW.md](./docs/review/PHASE1_REVIEW.md) | Phase 1 architecture review |
| [docs/review/REMEDIATION.md](./docs/review/REMEDIATION.md) | What the review changed |
| [n8n/docs/WORKFLOWS.md](./n8n/docs/WORKFLOWS.md) | Every n8n workflow |
| [docs/specification_raw.txt](./docs/specification_raw.txt) | Client specification (extracted) |

---

## Coding standards

See [`docs/CodingStandards.md`](./docs/CodingStandards.md). Highlights:

- **TypeScript** with `strict: true` and
  `noUncheckedIndexedAccess: true`.
- **One concern per file**; barrel files only where they help.
- **Server Components by default**; `'use client'` is opt-in.
- **Zod** validates every API body; `errorResponse()` is the only
  error-to-HTTP path.
- **Conventional Commits** + branch protection on `main`.

---

## Contribution guide

1. Read [`PROJECT_STATE.md`](./PROJECT_STATE.md) and
   [`PHASES.md`](./PHASES.md) to understand where the project is
   and what the next phase requires.
2. Read [`DECISIONS.md`](./DECISIONS.md) before opening a PR that
   touches architecture. If you need to change a decision, add a
   new ADR (don't rewrite the old one).
3. Read [`docs/CodingStandards.md`](./docs/CodingStandards.md) and
   [`docs/FolderStructure.md`](./docs/FolderStructure.md).
4. Branch from `staging`: `git checkout -b feat/<name>`.
5. Develop. Run `pnpm lint && pnpm type-check && pnpm test && pnpm build`
   locally before pushing.
6. Open a PR. The CI must be green. The reviewer must approve.
7. Squash-merge.

**Definition of Done** for a PR:

- Layer rules respected.
- New env var → `.env.example` + `docs/deployment/Environment.md`
  in the same PR.
- New SQL change → new migration file + matching RLS policy.
- New public function / route → `docs/api/API.md` updated.
- New env-dependent path → fallback documented in
  `docs/ErrorHandling.md`.

---

## Deployment

See [`docs/deployment/Deployment.md`](./docs/deployment/Deployment.md).

- **Preview** — Vercel auto-deploys every PR.
- **Staging** — Vercel `staging` branch → linked Supabase staging
  → n8n staging.
- **Production** — Vercel `main` → Supabase production (EU) →
  n8n production.

First production cut-over is the **Phase 6 deliverable**, not
Phase 1.

---

## Roadmap and future phases

See [`PHASES.md`](./PHASES.md).

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation | ✅ Closed |
| 2 | Marketing, auth UI, dashboard shell | 🔜 Next |
| 3 | Booking, Stripe, Calendly, Zoom | ⏳ |
| 4 | Admin dashboard | ⏳ |
| 5 | Resources, notifications, polish | ⏳ |
| 6 | Hardening, E2E, deploy | ⏳ |

---

## License

© 2026 Vedioconference. Proprietary. All rights reserved.
