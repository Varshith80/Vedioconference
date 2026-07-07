# DECISIONS — Architectural Decision Record (ADR)

> Every load-bearing decision made during Phase 1, with the reason,
> the alternatives, why they were rejected, and the impact. New
> decisions are appended at the bottom — never delete or rewrite a
> decision; supersede it with a new one that references the old.

Format inspired by the [MADR](https://adr.github.io/madr/) template.

---

## ADR-001 — Next.js 15 (App Router) as the frontend

**Decision:** Build the marketing site, student space, and admin
console in a single Next.js 15 application using the App Router and
React Server Components.

**Reason:** The brief asked for a single low-code stack; Next.js 15
gives us RSC for performance, Route Handlers for the API surface,
typed routes, and a single deploy target (Vercel). RSC lets us read
from Supabase on the server with zero round-trip cost.

**Alternatives considered:**

- **Webflow** — original spec mentioned it. Rejected: would require
  a separate admin tool, two codebases, and integration glue.
- **WordPress + plugin soup** — Rejected: maintenance cost, slow
  security response, no first-class TypeScript.
- **Astro** — Rejected: no first-class Route Handlers / form
  handling, smaller ecosystem.

**Why rejected:** none of the alternatives match the spec's "single
codebase for marketing + student + admin" requirement.

**Impact:** Single framework, single language, single deploy. The
team must know React + Next.js. RSC becomes the default — `'use
client'` is opt-in.

**Future considerations:** if marketing evolves to A/B testing with
edge personalization, Vercel Edge Middleware is already in place.

---

## ADR-002 — Supabase as Auth + Database + Storage

**Decision:** Use Supabase for authentication, the relational
database (Postgres 15), and object storage.

**Reason:** Supabase bundles the three things that the platform
needs with managed auth (JWT + refresh), RLS, PITR, and three
storage buckets in a single project. Its `@supabase/ssr` package
integrates with Next.js 15 cookies transparently.

**Alternatives considered:**

- **Firebase** — Rejected: no relational DB, no RLS-equivalent.
- **Auth0 + PlanetScale + S3** — Rejected: three vendors, three
  contracts, three bills.
- **Self-hosted Postgres + NextAuth + S3** — Rejected: devops cost
  contradicts the "low-code" requirement.

**Why rejected:** the other options would re-introduce the
operational complexity the brief explicitly forbids.

**Impact:** All PII and financial records live in Supabase EU. The
service-role key is a top-level secret.

**Future considerations:** Supavisor pooler is used for serverless
connections; read-replicas and branching are planned for Phase 6.

---

## ADR-003 — n8n as the automation layer

**Decision:** Use n8n to orchestrate Calendly, Stripe, Zoom and
Resend, and to write the resulting state back into Supabase.

**Reason:** n8n is the only mature, self-hostable, no-code engine
that handles the full chain (webhook in → external API calls →
conditional branching → email send → DB write) with retry and a
visual editor. It allows the consultant (and the client) to inspect
the booking pipeline without reading code.

**Alternatives considered:**

- **Inngest** — Rejected: requires a separate function runtime;
  doesn't help with sending emails or making outbound API calls
  in one place.
- **AWS Step Functions** — Rejected: too devops-heavy, the client
  can't edit it.
- **Zapier / Make** — Rejected: cost at scale, no self-host.

**Why rejected:** n8n is the only one that fits the brief, scales
to thousands of bookings/month, and is self-hostable.

**Impact:** The Next.js app holds **no** Stripe / Zoom / Calendly
secret. All booking mutations go through n8n. Operational
visibility comes from `n8n_executions` and `n8n_dead_letters`.

**Future considerations:** n8n.cloud is the fallback for the
self-hosted instance. A nightly `n8n export:workflow` is the
disaster-recovery mechanism.

---

## ADR-004 — Calendly Standard for scheduling

**Decision:** Use Calendly Standard as the scheduling surface.
Tutors get a Calendly account per organisation; the booking page
embeds the Calendly widget.

**Reason:** Calendly gives us real-time availability, timezone
handling, automatic reminders, and a webhook out of the box. Building
this in-house is explicitly out of scope per the brief.

**Alternatives considered:**

- **SimplyBook.me** — Rejected: less polished UX, fewer integrations.
- **Self-built calendar** — Rejected: explicitly forbidden.

**Why rejected:** Calendly is the spec's preferred tool and the
default for the market.

**Impact:** Real-time availability lives in Calendly, not in our
DB. Our DB stores the eventual booking row that the webhook
creates.

**Future considerations:** Phase 5 may add a tutor-side
"blackout dates" admin action that calls Calendly's API.

---

## ADR-005 — Stripe Checkout (hosted) for payments

**Decision:** Use Stripe Checkout (hosted) and listen to
`checkout.session.completed` for fulfillment.

**Reason:** Hosted Checkout is PCI-DSS scope-free, supports Apple
Pay / Google Pay / SEPA, handles SCA, and has a single source of
truth (the Checkout Session) that we can idempotently correlate to
a booking.

**Alternatives considered:**

- **Stripe Elements** — Rejected: more code, more PCI scope, no
  real benefit at this scale.
- **PayPal** — Rejected: less friendly to the FR/EU market.

**Why rejected:** Checkout is simpler, safer, and the same price.

**Impact:** All payments are server-to-server; the browser never
sees a card. Refunds and disputes are handled by Stripe Dashboard
or by an n8n workflow.

**Future considerations:** Phase 5 introduces subscriptions via
Stripe Billing; the `subscriptions` table is already in place.

---

## ADR-006 — Zoom (Server-to-Server OAuth) for video

**Decision:** Use Zoom's Server-to-Server OAuth app to create
meetings programmatically; meetings are owned by a single "host"
Zoom user per tutor.

**Reason:** S2S OAuth is the supported path for unattended
meeting creation. It does not require the tutor to click "Allow"
every time, and it lets us create the meeting as part of the
post-payment workflow.

**Alternatives considered:**

- **Google Meet (Calendar API)** — Rejected: less reliable API,
  weaker webhook story.
- **Daily / Whereby** — Rejected: per-minute cost, smaller market
  recognition in the FR/EU school segment.

**Why rejected:** Zoom is the spec's preferred tool and the
default in the target segment.

**Impact:** The host user has a quota; quotas are monitored
(`n8n_executions`).

**Future considerations:** Phase 6 adds Zoom Cloud Recording
optional storage.

---

## ADR-007 — Resend for transactional email

**Decision:** Use Resend as the email provider for transactional
emails (booking confirmation, reminder, cancellation).

**Reason:** Resend has a simple HTTP API, a clean React Email
story, and a generous free tier (100 emails/day) that covers
launch. Its deliverability and DKIM/SPF setup are managed.

**Alternatives considered:**

- **SendGrid** — Rejected: complex API, legacy auth model.
- **AWS SES** — Rejected: more setup, sandbox mode pain.

**Why rejected:** Resend is the most developer-friendly option and
the same price as SES at our scale.

**Impact:** All email content lives in the `n8n/workflows` and is
versioned as code.

**Future considerations:** Phase 5 introduces a templated
newsletter path (separate from transactional).

---

## ADR-008 — Vercel as the hosting target

**Decision:** Deploy the Next.js app on Vercel, in the `cdg1`
(Paris) region.

**Reason:** Vercel is the canonical Next.js host: zero-config
deploys, edge middleware, preview deploys per PR, EU regions,
and seamless integration with GitHub.

**Alternatives considered:**

- **Netlify** — Rejected: weaker Next.js 15 RSC support.
- **Self-hosted on Hetzner** — Rejected: operational cost, no
  preview-per-PR, no edge.

**Why rejected:** Vercel is the lowest-effort, highest-quality
host for this stack.

**Impact:** All env vars are managed in Vercel. CI does not deploy
to Vercel — Vercel listens to GitHub.

**Future considerations:** Phase 6 considers Vercel Enterprise for
custom SLAs.

---

## ADR-009 — Row Level Security (RLS) on every public table

**Decision:** Enable RLS on every public table and write explicit
policies for every operation. Admin powers go through
`public.is_admin()` / `public.is_super_admin()` helper functions.

**Reason:** RLS is the only mechanism that prevents application-layer
bugs from leaking data. Centralising the role check in SQL helper
functions means policies stay short and auditable.

**Alternatives considered:**

- **Application-layer authorization only** — Rejected: a single
  forgotten `where` clause leaks data.
- **Custom RBAC tables** — Rejected: reinventing Postgres roles
  with worse ergonomics.

**Why rejected:** RLS is the lowest-effort, highest-assurance
option in Supabase.

**Impact:** Every read and write goes through a policy. Service-role
key is restricted by folder rule (see FolderStructure.md).

**Future considerations:** Phase 5 adds per-resource ACLs (e.g.
"tutor X can edit only their own resources"), which extend the
existing pattern.

---

## ADR-010 — UUID primary keys

**Decision:** Every primary key is a `uuid default gen_random_uuid()`.

**Reason:** UUIDs are safe to expose in URLs, do not leak row
counts, and are merge-friendly (no collision when merging two
environments). Postgres' `pgcrypto` provides the generator.

**Alternatives considered:**

- **Auto-increment integers** — Rejected: leaks row counts, not
  merge-friendly.
- **ULIDs** — Rejected: not natively supported by Postgres
  indexes (string sort).

**Why rejected:** UUIDs are the industry default for OLTP in
Postgres.

**Impact:** Slightly larger indexes (16 bytes vs 4), accepted.

**Future considerations:** none.

---

## ADR-011 — Clean Architecture (layered)

**Decision:** Adopt a strict layered architecture in `apps/web`:

```
app/         → presentation (RSC + Route Handlers)
components/  → presentational + form
hooks/       → client-only React state
services/    → server-side data access
lib/         → framework adapters + utilities
types/       → generated + domain types
```

**Reason:** Clean Architecture keeps the "what" (pages) separate
from the "how" (Supabase / Stripe / Resend). It makes the codebase
navigable for new joiners and testable in isolation.

**Alternatives considered:**

- **Hexagonal (ports & adapters)** — Rejected: too much ceremony
  for the team size; we achieve the same separation with this
  lighter layering.
- **Flat (all in `app/`)** — Rejected: doesn't scale past 30 files.

**Why rejected:** Clean Architecture gives us the right level of
abstraction for the size of the project.

**Impact:** The "layer rules" in `docs/FolderStructure.md` are
enforced by code review and (eventually) by an ESLint boundary
plugin.

**Future considerations:** Phase 5 adds `apps/web/tests/integration`
to test services in isolation.

---

## ADR-012 — App Router (not Pages Router)

**Decision:** Use the Next.js App Router exclusively; the Pages
Router is disabled.

**Reason:** App Router gives us RSC, layouts, parallel routes,
and Server Actions, all of which the platform needs. The Pages
Router is in maintenance mode.

**Alternatives considered:** none (App Router is the recommended
path).

**Impact:** All new code is under `app/`. The folder layout uses
route groups `(marketing)`, `(auth)`, `(dashboard)`, `(admin)`.

**Future considerations:** React 19 features (use, Server
Components improvements) are available out of the box.

---

## ADR-013 — TypeScript (strict)

**Decision:** Write everything in TypeScript with `strict: true`
and `noUncheckedIndexedAccess: true`.

**Reason:** Type safety catches the most expensive class of bugs
in a financial application (off-by-one cents, undefined
properties, mismatched API contracts). The team is comfortable
with TS.

**Alternatives considered:** JavaScript + JSDoc. Rejected: not
strict enough.

**Impact:** Build fails on any type error. `pnpm type-check` runs
in CI.

**Future considerations:** consider tRPC / Zod-minired contracts in
Phase 4 once the data model is stable.

---

## ADR-014 — Tailwind CSS + shadcn/ui

**Decision:** Use Tailwind CSS for styling and the shadcn/ui
design system for components.

**Reason:** Tailwind is the de-facto Next.js styling layer. shadcn
gives us a small, copy-paste component library that we can modify
without a version-pin lock.

**Alternatives considered:**

- **CSS Modules** — Rejected: more boilerplate, no design tokens.
- **Mantine / Chakra** — Rejected: heavy runtime, opinionated
  theme.

**Why rejected:** Tailwind + shadcn is the lowest-friction, highest-
quality option for the team.

**Impact:** Design tokens live in `styles/globals.css` and
`tailwind.config.ts`. Components are added via
`npx shadcn-ui@latest add <name>`.

**Future considerations:** Phase 5 introduces dark-mode.

---

## ADR-015 — Conventional Commits + branch protection on `main`

**Decision:** Use Conventional Commits (`feat:`, `fix:`, …) and
require green CI + 1 approval before merging to `main`.

**Reason:** Conventional Commits power automatic changelogs and
semantic-versioning. Branch protection catches the most common
merge mistakes before they ship.

**Alternatives considered:** trunk-based development. Rejected: the
team is small but multi-timezone, and we want a stable `main` for
hot-fixes.

**Impact:** A PR template (Phase 2) enforces the checklist.

**Future considerations:** release-please in Phase 6 to automate
the changelog.

---

## ADR-016 — Idempotency at every external boundary

**Decision:** Every external call (Stripe, Calendly, Zoom, Resend,
n8n) is idempotent. The app stores every inbound webhook event in
`webhook_events(provider, event_id)` (UNIQUE) and every outbound
call carries a deterministic key.

**Reason:** At-least-once delivery is the only delivery guarantee
we get from third parties. Without idempotency, a single replay
would double-charge a student.

**Alternatives considered:** none — this is a non-negotiable.

**Impact:** `webhook_events`, `meeting_links.booking_id` UNIQUE,
`notifications` dedupe index, Stripe `idempotency_key` from
`booking_id`.

**Future considerations:** add an `Idempotency-Key` header to
every mutating API route (Phase 3).

---

## ADR-017 — Money in integer cents

**Decision:** All monetary amounts are stored as `integer` cents.

**Reason:** Floating-point money is a bug factory. Cents are exact
in any language and any database.

**Alternatives considered:** `numeric(10,2)`. Rejected: slower
arithmetics, more storage, no benefit at this scale.

**Impact:** The Stripe SDK expects cents already; the conversion
happens only at the UI edge.

**Future considerations:** none.

---

## ADR-018 — Audit log on every financial table

**Decision:** `bookings`, `payments`, `profiles` carry a trigger
that writes the change to `audit_logs`.

**Reason:** Financial records require an immutable audit trail
(PCI, GDPR Art.30, French CNIL guidance).

**Alternatives considered:** CDC via Supabase replication. Rejected:
operationally heavy, and we don't need change-data-capture at the
row level for analytics yet.

**Impact:** `audit_logs` is admin-read-only and lives in the same
database (acceptable because RLS protects it).

**Future considerations:** partition by month in Phase 6.

---

## ADR-019 — pnpm workspaces

**Decision:** Use pnpm 9 with workspaces; only one workspace for
now (`apps/web`).

**Reason:** pnpm is the fastest, most disk-efficient Node package
manager and supports monorepos out of the box. Future packages
(e.g. `packages/ui`, `packages/config`) can be added without a
restructure.

**Alternatives considered:** npm workspaces. Rejected: slower,
larger `node_modules`.

**Impact:** `pnpm install`, `pnpm -r type-check`, `pnpm -r build`
all work from the repo root.

**Future considerations:** add `packages/eslint-config`,
`packages/tsconfig`, `packages/ui` in Phase 2/4.

---

## ADR-020 — Tests (Vitest + Playwright)

**Decision:** Use Vitest for unit + integration, Playwright for
E2E. Coverage gate: 70% in Phase 6.

**Reason:** Vitest is the fastest TS-native test runner and the
default in Vercel's templates. Playwright is the de-facto E2E tool
for Next.js.

**Alternatives considered:** Jest. Rejected: slower, more
configuration.

**Impact:** Tests live in `apps/web/tests/{unit,integration,e2e}`.

**Future considerations:** add visual regression with Playwright
in Phase 6.

---

## How to add a new decision

1. Copy the template at the bottom of this file.
2. Give it the next ADR number.
3. Reference superseded ADRs in **Future considerations**.
4. Commit with `docs(adr): ADR-NNN – <title>`.
