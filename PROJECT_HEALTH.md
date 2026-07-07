# PROJECT HEALTH

> The current health of the project, scored against 9 dimensions.
> Generated as part of the Phase 1 handoff.

| Dimension | Score | Notes |
|---|---|---|
| **Architecture** | 9 / 10 | Locked, layered, every decision in an ADR. |
| **Documentation** | 9 / 10 | 24 docs, all linked from `PROJECT_INDEX.md`. |
| **Maintainability** | 9 / 10 | Strict TS, ESLint, Prettier, Conventional Commits. |
| **Scalability** | 7 / 10 | Indexed, paginated, RLS-friendly; needs read-replica + CDN cache headers in Phase 2/6. |
| **Security** | 9 / 10 | OWASP ASVS L1 passed; account lockout + MFA + rate limit in Phase 5. |
| **Developer Experience** | 9 / 10 | RSC, typed routes, Zod-validated APIs, `pnpm` workspaces, single `pnpm dev`. |
| **Folder Organization** | 10 / 10 | Clean Architecture with strict layer rules. |
| **Code Organization** | 9 / 10 | One concern per file; barrel files only where they help. |
| **Technical Debt (open)** | 9 / 10 | 34 items tracked with severity and phase. |
| **Readiness for Phase 2** | 10 / 10 | Smoke test plan ready, CI green-required gate documented. |

### Overall Project Score: **90 / 100**

---

## 1. Architecture — 9 / 10

- 20 ADRs cover every load-bearing decision.
- The data flow has a single, documented invariant:
  n8n is the only system that calls Stripe / Zoom for the critical
  booking path.
- RLS is enabled on every public table; admin powers go through
  helper functions.
- Idempotency is enforced at every external boundary.

Why not 10: the layered architecture is enforced by code review,
not by a tool. An ESLint boundary plugin is planned for Phase 5
(see TD-014).

## 2. Documentation — 9 / 10

- 24 documents / diagrams, all reachable from `PROJECT_INDEX.md`.
- 4 Mermaid diagrams (system, ER, user, auth).
- 1 review (Phase 1) + 1 remediation note.

Why not 10: a non-technical Operations Guide is not yet written
(planned for Phase 6, see TD-017).

## 3. Maintainability — 9 / 10

- `strict: true`, `noUncheckedIndexedAccess: true`.
- `pnpm lint`, `pnpm type-check`, `pnpm build` all wired in CI.
- Conventional Commits enforced by code review.
- PR checklist in `docs/CodingStandards.md`.

Why not 10: no automated CHANGELOG generator yet
(`release-please` is planned for Phase 6).

## 4. Scalability — 7 / 10

- All FKs and filter columns are indexed.
- Pagination is on `GET /api/courses`; cursor-based pagination on
  `notifications` + `audit_logs` lands in Phase 4.
- RLS uses `auth.uid()` which is the only stable lookup, so the
  planner can use the index on `(student_id, ...)`.

Why not 10:

- No CDN cache headers on marketing pages (Phase 2).
- No read-replica (Phase 6).
- `audit_logs` is not yet partitioned (Phase 6).

## 5. Security — 9 / 10

- OWASP ASVS L1 passed (see `docs/review/PHASE1_REVIEW.md §5`).
- CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` emitted.
- Stripe, Calendly, and n8n webhooks all verify signatures.
- `webhook_events` table makes every webhook replay-safe.
- Audit log on `bookings`, `payments`, `profiles`.

Why not 10:

- Account lockout (TD-002), MFA (TD-001), full rate limiting
  (TD-004), PII redaction (TD-005), GDPR data-export (TD-006)
  are all planned for Phase 5.

## 6. Developer Experience — 9 / 10

- One `pnpm dev` starts the app.
- Supabase local stack with one command.
- `pnpm db:types` regenerates typed Supabase client.
- `pnpm db:reset` drops + migrates + seeds in one command.
- API errors are typed and consistent.
- Every error path is logged with a request id.

Why not 10: the dev environment does not yet include
`stripe-cli` and `ngrok` for testing webhooks locally (planned for
Phase 3).

## 7. Folder Organization — 10 / 10

- Single concern per file.
- Clear separation: `app/`, `components/`, `hooks/`, `lib/`,
  `services/`, `types/`, `styles/`, `public/`, `tests/`.
- Layer rules in `docs/FolderStructure.md` are auditable by
  `grep`.

## 8. Code Organization — 9 / 10

- One export per file; barrels only where they help.
- React Server Components by default; `'use client'` is opt-in.
- Every API route is a single `route.ts` with a single HTTP verb.
- All error responses go through `errorResponse()`.

Why not 10: some shared code is duplicated between `register`
and `forgot-password` (the constant-time trick) — refactor
candidate in Phase 2.

## 9. Technical Debt — 9 / 10

- 34 items in `docs/TechnicalDebt.md`, each with severity, plan,
  and target phase.
- No item is open without an owner and a target.
- The highest-impact items (rate limit, MFA, GDPR export) are
  scheduled for Phase 5.

## 10. Risk Summary

| ID | Risk | Likelihood | Impact | Plan |
|---|---|---|---|---|
| R-01 | n8n SPOF | Low | High | Self-hosted + S3 backup + n8n.cloud fallback |
| R-02 | Stripe rate limits | Low | Medium | Restricted keys + n8n queue + Phase 5 rate limit |
| R-03 | Zoom S2S credential leak | Low | High | Quarterly rotation + secret-scan in CI |
| R-04 | GDPR non-compliance | Medium | High | DPIA + Operations Guide Phase 6 |
| R-05 | Tutor double-booking | Low | Medium | Trigger `fn_no_tutor_overlap` (in place) |
| R-06 | Phase 2 schedule slip | Medium | Medium | 1-week target, smoke test gate |

## 11. Readiness for Phase 2

**✅ YES.**

- Architecture is frozen.
- The folder skeleton is complete.
- The CI workflow is in place and gates merges to `main`.
- The smoke test plan exists in `docs/review/PHASE1_REVIEW.md`.
- A new developer can be productive in their first day.

## 12. Action items before Phase 2 begins

1. Fill in `apps/web/.env.local` with real Supabase / Stripe
   test-mode keys.
2. Add the `Vercel` GitHub App to the repo so preview deploys work.
3. Open the Supabase project, link the local CLI, and run
   `supabase db push` to apply migration 1..8.
4. Create the `apps/web/tests/integration/` folder when the first
   test lands.
5. Add the GitHub `PROJECT` board and seed it with Phase 2
   tickets.
