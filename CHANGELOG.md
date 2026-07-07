# CHANGELOG

> All notable changes to this project are documented in this file.
> The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
> and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial repository scaffolding (pnpm workspaces, Next.js 15, Supabase, n8n).
- Documentation set (24 docs / diagrams) and 20 ADRs.
- Formal Phase 1 architecture review and remediation.

## [1.0.0-phase1] — 2026-07-07

### Added
- **Supabase schema** — 8 idempotent migrations, 18 tables, 7 enums,
  RLS on every public table, 5 triggers, 3 storage buckets.
- **Next.js 15** application skeleton — App Router, RSC, typed routes.
- **Auth** — Supabase Auth, JWT in `httpOnly Secure SameSite=Lax` cookies,
  middleware + admin layout + role helpers.
- **API surface** — 21 route handlers (auth, profile, courses, tutors,
  bookings, resources, admin, webhooks, health).
- **Forms** — login, register, forgot-password (react-hook-form + Zod).
- **UI primitives** — Button, Toaster; Tailwind + shadcn design tokens.
- **n8n** — 8 workflows designed and documented
  (`n8n/docs/WORKFLOWS.md`); 8 JSON placeholders in
  `n8n/workflows/`.
- **Documentation** — README, PROJECT_STATE, PROJECT_INDEX,
  PROJECT_HEALTH, PHASES, DECISIONS, architecture (4 Mermaid
  diagrams), database, API, folder structure, deployment,
  environment, security, coding standards, error handling,
  logging, monitoring, disaster recovery, booking flow, technical
  debt, Phase 1 review + remediation.
- **CI** — GitHub Actions: `ci.yml` (lint, type-check, test, build),
  `codeql.yml` (weekly + per-PR), `secret-scan.yml` (gitleaks).
- **Scripts** — `db-push.sh`, `db-types.sh`, `db-url.sh`,
  `deploy-n8n.sh`.
- **Security** — CSP, HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
  in `next.config.mjs`; signature verification on Stripe, Calendly,
  n8n webhooks; `webhook_events` table for replay safety;
  constant-time responses on `register` and `forgot-password` to
  prevent user enumeration.

[Unreleased]:                  # phase-1 → phase-2
[1.0.0-phase1]: 2026-07-07
