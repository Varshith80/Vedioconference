# CLAUDE.md — Vedioconference

> **Permanent instruction manual for every Claude Code session in this repository.**
> Read this file first. Then read `PROJECT_STATE.md` and the latest
> sprint summary in `docs/review/`.

---

## 1. Project Overview

- **Name:** Vedioconference — Course Platform.
- **Internal codename:** `vedioconference`.
- **Repository root:** `C:\Vedioconference` (pnpm monorepo: `apps/web`, `supabase/`, `n8n/`, `docs/`, `scripts/`).
- **Business objective:** Production-grade online tutoring and video-conferencing platform for French high-school (*lycée*) and *classes préparatoires* students. One-to-one, individual, scheduled video sessions between a student and a verified tutor. The platform owns the catalog, the booking, the payment, the video meeting, and the post-session resources — end to end.
- **Current phase:** **Phase 2 — Marketing & Onboarding**.
- **Current sprint:** **Sprint A — done (awaiting explicit user approval before Sprint B).**
- **Overall progress:** ~25 % (Phase 1 = 17 %, Sprint A of Phase 2 = +8 %).

The single source of truth for "where the project is right now" is `PROJECT_STATE.md`. Read it before doing anything else.

---

## 2. Locked Architecture

The Phase 1 architecture is **frozen**. Do not modify, redesign, or "improve" it without an explicit, in-chat user approval. Treat every ADR in `docs/architecture/` and every schema migration in `supabase/migrations/` as a contract.

### 2.1 Technology stack (locked)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router, RSC) | TypeScript strict, `noUncheckedIndexedAccess` |
| Styling | Tailwind CSS 3 + hand-rolled shadcn-style design tokens | Mobile-first (`sm/md/lg/xl/2xl`) |
| Forms | react-hook-form + Zod | Zod is the validation contract on both client and server |
| Server | Next.js Route Handlers | App Router |
| Auth | Supabase Auth | JWT in `httpOnly Secure SameSite=Lax` cookies, rotating refresh tokens |
| Database | Supabase Postgres 15 (EU) | RLS on every public table, PITR enabled |
| Storage | Supabase Storage | 3 buckets: `avatars`, `course-covers`, `resources` |
| Automation | n8n | Self-hosted or n8n.cloud |
| Scheduling | Calendly Standard | Embed + webhook |
| Payments | Stripe Checkout | Webhook signed + idempotent |
| Video | Zoom (Server-to-Server OAuth) | — |
| Email | Resend | Transactional |
| Hosting | Vercel (EU `cdg1`) | `main` / `staging` / `feat/*` branches |
| CI | GitHub Actions | `ci.yml` (lint/type-check/test/build), `codeql.yml`, `secret-scan.yml` (gitleaks) |
| Package manager | pnpm 9 workspaces | — |

### 2.2 System architecture (locked)

```
Student → Next.js 15 (Vercel, RSC, RLS-respecting server client)
              ↘ SSR + RSC
                Supabase (Auth + Postgres + RLS + Storage)
              ↗ webhooks
            n8n
              ↘
                {Calendly, Stripe, Zoom, Resend}
              ↗
            Supabase write-back → Dashboard reflects the new state
```

Full diagram: `docs/architecture/SYSTEM_ARCHITECTURE.mmd`. Data model: `docs/architecture/ER_DIAGRAM.mmd`.

### 2.3 Integration architecture (locked — n8n is the only automation layer)

- **n8n is the *only* system that calls Stripe / Zoom for the critical booking path.** The Next.js application holds no Zoom secret and no service-role key for booking mutations.
- The Next.js app exposes:
  - RSC pages for SSR.
  - Route Handlers under `app/api/**` (read endpoints + Zod-validated mutations + signed webhooks).
  - Webhooks: Stripe (`stripe-signature`), Calendly (`Calendly-Webhook-Signature`), n8n (`X-Webhook-Secret`).
- **Every external call is idempotent.** Stripe uses `idempotency_key`; `webhook_events.event_id` is `UNIQUE`; `meeting_links.booking_id` is `UNIQUE`; `notifications` are deduped.
- **Every public table is RLS-protected.** Admin powers go through `public.is_admin()` / `public.is_super_admin()` helper functions.
- **Service-role key is restricted** to `app/api/webhooks/**` and `app/api/auth/register/**` by layer rules. No other code path may use it.
- **Migrations are forward-only.** Never edit an applied migration. New SQL changes ship as new files.

### 2.4 SaaS services (locked)

Supabase, n8n, Calendly, Stripe, Zoom, Resend, Vercel, GitHub, Sentry (Phase 5), Upstash (Phase 5). No additional SaaS may be introduced without explicit user approval.

---

## 3. Project Rules (non-negotiable)

1. **Never redesign the architecture.** Treat `docs/architecture/Architecture.md` and the ADRs as a contract.
2. **Never change the database schema without explicit approval.** Migrations are forward-only. New columns, tables, indexes, RLS policies, and triggers all require the user's sign-off.
3. **Never introduce placeholder or fake implementations.** No `// TODO: implement later`, no stubbed Stripe calls, no mocked Zoom URLs, no fake auth. Every line ships ready for production. If a feature cannot be built right now, the right answer is to *not build it yet* and wait for the right sprint.
4. **Never commit secrets or `.env.local`.** The repo ships only `.env.example`. Use environment variables for all credentials. `secret-scan` (gitleaks) is wired in CI and will fail the build.
5. **Never prefix a secret with `NEXT_PUBLIC_`.** Anything under `NEXT_PUBLIC_` is bundled into the client and is public.
6. **n8n is the only automation layer for the booking workflow.** Next.js does not call Stripe, Zoom, or Calendly APIs directly for the critical booking path. The Resend send in `app/api/contact/route.ts` is the only Next.js → vendor call today, and it is for the contact form, not bookings.
7. **Follow all ADRs.** Read `docs/architecture/` before proposing any architectural change. If a change is necessary, surface it as a proposed ADR and stop — do not implement it without approval.
8. **Stop after every sprint and wait for explicit user approval** before starting the next one. The user is the only one who can advance the sprint boundary.
9. **Use the type-safety boundary correctly.** `apps/web/types/domain.ts` carries the strong types; `apps/web/types/database.generated.ts` is the permissive stand-in. Services cast at the boundary; components consume strong types.
10. **SOLID, Clean Architecture, DRY, KISS, mobile-first.** Business logic lives in `services/` and `lib/`, not in components. Components are presentational.
11. **Lighthouse budget:** `Performance ≥ 90`, `Accessibility ≥ 95`, `SEO ≥ 95`, `Best Practices ≥ 95`. Anything that pushes a marketing or auth page below these numbers must be reworked, not shipped.
12. **No duplicate UI. No duplicate business logic.** Prefer extending an existing component or service over creating a new one. If you find yourself copy-pasting, refactor instead.

---

## 4. Resume Workflow — what to do on every new Claude Code session

On every new session in this repository, perform the following steps **in order**, before making any change:

1. Read `PROJECT_STATE.md` (current phase, sprint, status, blockers, "next phase objectives").
2. Read `C:\Users\Maniv\.claude\projects\C--Vedioconference\memory\MEMORY.md` and the memory file(s) it indexes (long-lived facts about the user and the project).
3. Read `CHANGELOG.md` (latest versioned entry first; then top-down for context).
4. Read the latest sprint summary in `docs/review/` (e.g. `PHASE2_SPRINT_A_SUMMARY.md`).
5. Read `docs/architecture/Architecture.md` and the relevant ADRs / diagrams.
6. Read `docs/database/Database.md` if the task touches data.
7. Run `git status` and `git log -5` to see uncommitted work and recent commits.
8. **Summarize the current state back to the user** in 5–10 lines: phase, sprint, status, last commit hash, what is gated on user approval, what the next action is. Then ask: *"Want me to start <next>?"*
9. Do not touch any file until the user confirms the next step.

If a memory file lists a "tomorrow's intent" note, use that as the starting prompt.

---

## 5. Development Workflow

A sprint is executed in this exact order. Do not skip steps. Do not reorder steps.

```
Planning         →   Write / update the sprint plan in PROJECT_STATE.md
                       (or the sprint summary template).
                       List: scope, files to add/modify, tests to add,
                       docs to update, exit criterion.

Implementation   →   Build the change. Follow the architecture.
                       Business logic in services/ or lib/, not in
                       components. Reuse before creating.

Testing          →   Add or update unit tests (Vitest, colocated in
                       tests/unit/). For API routes, the test is
                       the Zod schema + the route handler signature.

Documentation    →   Update the doc the change belongs to.
                       If the change is new behaviour, add a
                       paragraph; if it is a new pattern, add an
                       ADR. If the change touches the database,
                       update docs/database/Database.md.

Sprint Summary   →   Write or update docs/review/PHASE{n}_SPRINT_{m}_SUMMARY.md
                       (completed files, remaining work, blockers,
                       what needs explicit approval).

Git Commit       →   Conventional commit subject. One commit per
                       logical change. Reference the sprint
                       version in the body when a sprint closes.

User Approval    →   Stop. Report. Wait. Do not start the next
                       sprint.

Next Sprint      →   Only after explicit user approval.
```

---

## 6. Coding Standards

- **TypeScript strict mode.** `strict: true`, `noUncheckedIndexedAccess: true`. No `any`. No `// @ts-ignore`. No `as never` unless it is the documented boundary cast (see §3.9).
- **Mobile-first responsive design.** Default styles target the smallest screen. Use `sm:` / `md:` / `lg:` / `xl:` / `2xl:` to step up. Always test at 360 px (mobile), 768 px (tablet), 1280 px (laptop), 1536 px (desktop).
- **Reusable components.** If a UI pattern repeats, extract it into a shared atom. The design-system primitives are in `apps/web/components/shared/` and `apps/web/components/ui/`.
- **SOLID, Clean Architecture, DRY, KISS.** Single responsibility per file. Dependency injection where it helps. No god components. No copy-pasted logic.
- **No duplicated UI.** No duplicated business logic. If you find yourself writing the same code twice, refactor.
- **Accessibility first.** Semantic HTML first. `aria-*` only when the semantic equivalent doesn't exist. `prefers-reduced-motion` is enforced globally. Every interactive element is keyboard-reachable. Contrast ratio ≥ 4.5:1.
- **SEO best practices.** Every public page has a unique `<title>`, `<meta name="description">`, canonical URL, and OpenGraph block. JSON-LD on landing + course + tutor pages. Sitemap is generated; robots is explicit.
- **Error handling.** Use `errorResponse()` from `lib/api/errors.ts` for all API error returns. Never `throw new Error('…')` from a route handler without catching it.
- **Logging.** Use `lib/utils/logger.ts`. Never `console.log` in production code (the only allowed `console.log` is in the logger itself).
- **No `process.env` outside `lib/env.ts`.** Centralise environment access so it can be validated at boot.

---

## 7. Quality Gates

Before declaring a sprint done, **all** of the following must be true:

- [ ] `pnpm type-check` exits 0.
- [ ] `pnpm lint` exits 0 (warnings are allowed only with a documented reason).
- [ ] `pnpm test` exits 0 with 100 % of tests passing.
- [ ] `pnpm build` exits 0 with the expected number of routes.
- [ ] The change is documented in the doc that owns the topic.
- [ ] `PROJECT_STATE.md` is updated (status, "last updated" date, deliverables list).
- [ ] `CHANGELOG.md` has a new versioned entry for the sprint.
- [ ] A sprint summary exists at `docs/review/PHASE{n}_SPRINT_{m}_SUMMARY.md`.
- [ ] All changes are committed and pushed to GitHub.
- [ ] The sprint is tagged in git (`v<x.y.z>-phase<n>-sprint<m>`).

If any gate fails, the sprint is not done. Do not ask the user to approve a sprint that has a failing gate.

---

## 8. Git Workflow

- **One commit per logical change.** Use Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`).
- **Commit subject ≤ 72 chars.** Body explains the *why*; the diff explains the *what*.
- **Push daily.** At the end of every working day, even if the sprint is not done.
- **Tag every completed sprint.** `git tag v<x.y.z>-phase<n>-sprint<m>` and `git push --tags`. Tags are the rollback points.
- **Never leave the repository in a broken state.** A `pnpm type-check` / `pnpm lint` / `pnpm build` failure on `main` is an incident — fix it before moving on.
- **Branching:** `main` (production), `staging` (pre-production), `feat/<sprint>-<short-name>` (work). PRs into `main` require green CI.
- **No force-push to `main` or `staging`.** Ever.
- **No secrets in commits.** `gitleaks` runs on every PR; a leak will fail the build.

---

## 9. Definition of Done (per sprint)

A sprint is **done** when, and only when:

1. Every item in the sprint plan is implemented, tested, and documented.
2. The four quality gates in §7 are green.
3. The sprint summary in `docs/review/` lists: completed files (with paths), remaining work, blockers, and what needs explicit user approval.
4. `PROJECT_STATE.md` reflects the new status and the new "last updated" date.
5. `CHANGELOG.md` has a new versioned entry (`[x.y.z-phase<n>-sprint<m>]`) with `Added / Changed / Removed / Quality gates` sections.
6. The sprint tag is pushed to GitHub.
7. The user has been told the sprint is done and is waiting for explicit approval.
8. **No** work has begun on the next sprint.

---

## 10. Project Documentation Map

| Path | Purpose |
|---|---|
| `README.md` | Entry point. One-paragraph project description, quick start, links to the important docs. |
| `PROJECT_STATE.md` | **The** source of truth for "where the project is right now". Phase table, deliverables, status, last-updated date, blockers, known limitations, known risks, next-phase objectives. Update at every sprint close. |
| `CHANGELOG.md` | Versioned history of every change. `[x.y.z-phase<n>-sprint<m>]` convention. Newest entry first. |
| `DECISIONS.md` | Architectural decisions (ADRs) at the project level. Decisions live here. |
| `PHASES.md` | The 6-phase plan with target dates and exit criteria. |
| `PROJECT_INDEX.md` | Cross-references and navigation hub between docs. |
| `PROJECT_HEALTH.md` | Top-level health snapshot: open risks, debt, incidents. |
| `ONBOARDING.md` | What a new developer reads on day 1. |
| `docs/architecture/` | `Architecture.md` (the locked system design) + 4 Mermaid diagrams (`SYSTEM_ARCHITECTURE`, `ER_DIAGRAM`, `USER_FLOW`, `AUTH_FLOW`). |
| `docs/database/Database.md` | The 18 tables, 4 enums, RLS policies, triggers, indexes. |
| `docs/api/API.md` | The 21+ route handlers: method, path, auth, request, response, error codes. |
| `docs/deployment/Deployment.md` + `docs/deployment/Environment.md` | How to deploy, what env vars exist. |
| `docs/security/Security.md` | OWASP ASVS L1 controls, RLS, JWT, CSP, secret rotation. |
| `docs/CodingStandards.md` | The detailed coding standard (style, naming, error handling, logging). |
| `docs/ErrorHandling.md` / `docs/Logging.md` / `docs/Monitoring.md` | Operational docs. |
| `docs/DisasterRecovery.md` | Backups, RPO/RTO, runbooks. |
| `docs/BookingFlow.md` | End-to-end walkthrough of a booking. |
| `docs/TechnicalDebt.md` | The 34-item debt register. |
| `docs/DevelopmentRoadmap.md` | Detailed sprint-by-sprint plan. |
| `docs/review/PHASE{n}_REVIEW.md` + `REMEDIATION.md` | Formal architecture review per phase. |
| `docs/review/PHASE{n}_SPRINT_{m}_SUMMARY.md` | Sprint close-out note. The single most useful doc for resuming work. |
| `supabase/` | `config.toml`, `migrations/00000000_…` (forward-only), `seed/000_seed.sql`, `policies/`, `functions/`. |
| `n8n/workflows/*.json` | The 8 n8n workflow JSON exports. Placeholders today, real flows in Phase 3. |
| `n8n/docs/WORKFLOWS.md` | Workflow-by-workflow documentation (triggers, actions, credentials, retries, dead-letter). |
| `n8n/credentials/` | Credential reference (no real secrets). |
| `scripts/db-push.sh` / `db-types.sh` / `db-url.sh` / `deploy-n8n.sh` | Local-DB and n8n helper scripts. |
| `apps/web/` | The Next.js 15 application. App Router, RSC, Route Handlers, components, services, types. |
| `apps/web/types/domain.ts` | The strong domain types (`Course`, `Tutor`, `Profile`, `Booking`, `Payment`, `Resource`, `MeetingLink`, `Notification`). |
| `apps/web/types/database.generated.ts` | The permissive `Database` stand-in. Replaced by `pnpm db:types` output against a live database. |
| `apps/web/lib/supabase/{client,server,admin}.ts` | The three Supabase clients. `server` is build-time safe; `admin` is webhook/register only. |
| `apps/web/services/` | Business logic. Auth, courses, tutors, bookings, resources, admin. |
| `apps/web/components/{ui,shared,layout,marketing,dashboard,admin,forms}/` | Presentational components, organised by layer. |
| `apps/web/middleware.ts` | Auth + role middleware. |
| `apps/web/next.config.mjs` | CSP, HSTS, security headers, server-action body limit. |
| `apps/web/tests/unit/` | Vitest unit tests. |

---

## 11. AI Operating Rules (how Claude should behave on future sessions)

1. **Read project state before coding.** Follow the §4 Resume Workflow every time. Do not start a session by editing.
2. **Respect the locked architecture.** No silent refactors, no "while I'm here" changes, no new SaaS, no new top-level folders. If a change is required, surface it and stop.
3. **Never skip documentation updates.** A code change without a doc change is incomplete. A sprint close without `PROJECT_STATE.md` and `CHANGELOG.md` is not a close.
4. **Never continue to the next sprint without explicit user approval.** Sprint boundaries are owned by the user.
5. **Prefer modifying existing components over creating duplicates.** Reuse before create. If the change is small, modify; if the change is large, propose a refactor first.
6. **Always explain significant architectural decisions before implementing them.** A new pattern, a new table, a new SaaS, a new directory — explain *what* and *why* in chat, then wait for confirmation, then implement.
7. **Be explicit about uncertainty.** If the spec is ambiguous, ask one focused question with `AskUserQuestion`. Do not guess on architecture, on data model, or on a rule.
8. **Prefer the smallest correct change.** Resist scope creep. A sprint is the unit of work, not the conversation.
9. **Report blockers honestly.** If a step fails, say so with the actual output. Do not gloss, do not hand-wave, do not move on as if it passed.
10. **When a rule and a user instruction conflict, the rule wins** unless the user has explicitly overridden it in the current session. (E.g. "do not change the schema" beats "just add this column" unless the user has approved the column.)

---

*Last updated: 2026-07-07. Owner: project lead. This file is the first thing every Claude Code session should read.*
