# ONBOARDING — First 30 minutes

> A new senior developer should be able to understand this project
> in under 30 minutes by following this page. If you can't, please
> file a PR against `docs/`.

## 0:00 — Orient yourself (3 min)

- Skim [`PROJECT_STATE.md`](./PROJECT_STATE.md) — one page, every
  status flag in one place.
- Skim [`PHASES.md`](./PHASES.md) — what the next phase is.
- Read [`README.md`](./README.md) up to and including "Technology
  stack".

## 0:05 — Architecture (8 min)

- [`docs/architecture/Architecture.md`](./docs/architecture/Architecture.md) — read in full.
- [`docs/architecture/SYSTEM_ARCHITECTURE.mmd`](./docs/architecture/SYSTEM_ARCHITECTURE.mmd) — render in VS Code (Mermaid preview) or [mermaid.live](https://mermaid.live).
- [`docs/architecture/ER_DIAGRAM.mmd`](./docs/architecture/ER_DIAGRAM.mmd) — same.

## 0:15 — Folder structure + layer rules (5 min)

- [`docs/FolderStructure.md`](./docs/FolderStructure.md) — the
  annotated tree, with **layer rules** at the bottom. The layer
  rules are the only "convention" that can fail code review.

## 0:20 — Code standards + ADRs (5 min)

- [`docs/CodingStandards.md`](./docs/CodingStandards.md) — TS, naming,
  branches, PR checklist.
- [`DECISIONS.md`](./DECISIONS.md) — at minimum, read ADR-001 (Next.js),
  ADR-002 (Supabase), ADR-003 (n8n), ADR-009 (RLS), ADR-016 (idempotency).
  Skim the rest.

## 0:25 — Database + API surface (5 min)

- [`docs/database/Database.md`](./docs/database/Database.md) — read §1,
  §2, §6. The rest is reference.
- [`docs/api/API.md`](./docs/api/API.md) — scan the endpoint list.

## 0:30 — Set up your local environment (15 min)

- `pnpm install`
- `cp apps/web/.env.example apps/web/.env.local`
- Fill in Supabase keys (request from the on-call).
- `supabase start && pnpm db:reset && pnpm db:types`
- `pnpm dev` — open <http://localhost:3000>

**Total: 30 minutes to your first `pnpm dev` running.**

## Day 1 follow-ups

- Read [`docs/CodingStandards.md`](./docs/CodingStandards.md) in full.
- Skim [`docs/BookingFlow.md`](./docs/BookingFlow.md) — even if you
  don't work on bookings, you will be asked about them.
- Skim [`docs/ErrorHandling.md`](./docs/ErrorHandling.md).
- Pair with another developer on a one-line PR to validate your
  environment.

## When in doubt

- "How does the auth work?" → [`docs/architecture/AUTH_FLOW.mmd`](./docs/architecture/AUTH_FLOW.mmd) + [`docs/security/Security.md`](./docs/security/Security.md)
- "Where do I put X?" → [`docs/FolderStructure.md`](./docs/FolderStructure.md) (layer rules)
- "Why was X decided?" → [`DECISIONS.md`](./DECISIONS.md)
- "Is this in scope for the next phase?" → [`PHASES.md`](./PHASES.md)
- "What's broken right now?" → [`PROJECT_STATE.md`](./PROJECT_STATE.md) and [`docs/TechnicalDebt.md`](./docs/TechnicalDebt.md)
