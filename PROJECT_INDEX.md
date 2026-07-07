# PROJECT INDEX

> **The navigation hub.** Every important document in the project
> is linked from this page. If you can't find a document in 30
> seconds, it's missing from this index.

## Quick links

- [README.md](./README.md) — start here
- [ONBOARDING.md](./ONBOARDING.md) — first 30 minutes for a new dev
- [PROJECT_STATE.md](./PROJECT_STATE.md) — where the project is right now
- [PHASES.md](./PHASES.md) — phase plan, acceptance and exit criteria
- [DECISIONS.md](./DECISIONS.md) — every architectural decision
- [PROJECT_HEALTH.md](./PROJECT_HEALTH.md) — quality report
- [CHANGELOG.md](./CHANGELOG.md) — release notes
- [docs/review/PHASE1_REVIEW.md](./docs/review/PHASE1_REVIEW.md) — formal Phase 1 review
- [docs/review/REMEDIATION.md](./docs/review/REMEDIATION.md) — what the review changed

---

## Architecture

| Document | Purpose |
|---|---|
| [docs/architecture/Architecture.md](./docs/architecture/Architecture.md) | Locked decisions, layered architecture |
| [docs/architecture/SYSTEM_ARCHITECTURE.mmd](./docs/architecture/SYSTEM_ARCHITECTURE.mmd) | Mermaid system diagram |
| [docs/architecture/ER_DIAGRAM.mmd](./docs/architecture/ER_DIAGRAM.mmd) | Database ER diagram |
| [docs/architecture/USER_FLOW.mmd](./docs/architecture/USER_FLOW.mmd) | User journey |
| [docs/architecture/AUTH_FLOW.mmd](./docs/architecture/AUTH_FLOW.mmd) | Auth sequence |
| [docs/architecture/Architecture.md](./docs/architecture/Architecture.md) | Locked decisions, layered architecture |

## Database

| Document | Purpose |
|---|---|
| [docs/database/Database.md](./docs/database/Database.md) | Schema, RLS, indexes, enums |
| [supabase/migrations/](./supabase/migrations/) | 8 SQL migration files |
| [supabase/seed/000_seed.sql](./supabase/seed/000_seed.sql) | Idempotent dev seed |
| [supabase/config.toml](./supabase/config.toml) | Auth + storage config |

## API

| Document | Purpose |
|---|---|
| [docs/api/API.md](./docs/api/API.md) | Every route handler, request/response, errors |
| `apps/web/app/api/` | 21 route handlers |
| [docs/BookingFlow.md](./docs/BookingFlow.md) | End-to-end booking flow |

## Security

| Document | Purpose |
|---|---|
| [docs/security/Security.md](./docs/security/Security.md) | OWASP, headers, rate limit, GDPR |
| [docs/review/PHASE1_REVIEW.md §5](./docs/review/PHASE1_REVIEW.md) | OWASP ASVS L1 audit |

## Deployment & DevOps

| Document | Purpose |
|---|---|
| [docs/deployment/Deployment.md](./docs/deployment/Deployment.md) | Vercel + Supabase + n8n topology |
| [docs/deployment/Environment.md](./docs/deployment/Environment.md) | Every env var |
| [docs/DisasterRecovery.md](./docs/DisasterRecovery.md) | RPO / RTO, scenarios, drills |
| [docs/Monitoring.md](./docs/Monitoring.md) | Health, metrics, alerts, Sentry |
| [docs/Logging.md](./docs/Logging.md) | Levels, request id, redaction |
| [apps/web/.env.example](./apps/web/.env.example) | Local env template |
| [.github/workflows/](./.github/workflows/) | ci, codeql, secret-scan |

## Roadmap & Review

| Document | Purpose |
|---|---|
| [docs/DevelopmentRoadmap.md](./docs/DevelopmentRoadmap.md) | Phases, milestones, ETA |
| [PHASES.md](./PHASES.md) | Per-phase deliverables and exit criteria |
| [docs/review/PHASE1_REVIEW.md](./docs/review/PHASE1_REVIEW.md) | Phase 1 architecture review |
| [docs/review/REMEDIATION.md](./docs/review/REMEDIATION.md) | What the review forced us to change |
| [PROJECT_HEALTH.md](./PROJECT_HEALTH.md) | Current project health |
| [PROJECT_STATE.md](./PROJECT_STATE.md) | Where the project is right now |

## n8n

| Document | Purpose |
|---|---|
| [n8n/docs/WORKFLOWS.md](./n8n/docs/WORKFLOWS.md) | Every workflow (design) |
| [n8n/workflows/](./n8n/workflows/) | 8 workflow JSON exports (placeholders) |
| [scripts/deploy-n8n.sh](./scripts/deploy-n8n.sh) | Deploy script |

## Developer guides

| Document | Purpose |
|---|---|
| [docs/FolderStructure.md](./docs/FolderStructure.md) | Annotated tree + layer rules |
| [docs/CodingStandards.md](./docs/CodingStandards.md) | TS rules, branch strategy, review checklist |
| [docs/ErrorHandling.md](./docs/ErrorHandling.md) | Failure modes and recovery |
| [docs/TechnicalDebt.md](./docs/TechnicalDebt.md) | Open debt, severity, plan |
| [scripts/](./scripts/) | db-push, db-types, db-url, deploy-n8n |

## Decision records

| Document | Purpose |
|---|---|
| [DECISIONS.md](./DECISIONS.md) | ADR log (20 decisions) |

## Specification

| Document | Purpose |
|---|---|
| [docs/specification_raw.txt](./docs/specification_raw.txt) | Client specification (extracted) |
