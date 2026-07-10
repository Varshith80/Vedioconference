# Technical Debt Register

> Every known debt item, with severity, owner, and a target phase.
> Update this file as items are paid down.

| ID | Severity | Area | Item | Plan |
|---|---|---|---|---|
| TD-001 | Low | Auth | MFA (TOTP) for student + admin | Phase 5 |
| TD-002 | Low | Auth | Account-lockout policy (max 5 signins / 5 min) | Phase 5 |
| TD-003 | Low | Auth | Email enumeration mitigation beyond the response-time trick | Phase 5 |
| TD-004 | Med | Security | Rate limiting (Upstash Redis) | Phase 5 |
| TD-005 | Med | Security | PII redaction in logs (already in plan; needs `redact()` helper) | Phase 5 |
| TD-006 | Med | Security | GDPR data-export endpoint (`GET /api/profile/export`) | Phase 5 |
| TD-007 | Med | Security | File-upload ClamAV scan | Phase 6 |
| TD-008 | Med | Security | Production CSP | **Done** in this review |
| TD-009 | Med | DB | Add `stripe_event_id` UNIQUE to `webhook_events` | **Done** in this review |
| TD-010 | Med | DB | Partition `audit_logs` by month | Phase 6 |
| TD-011 | Med | API | Cursor-based pagination for `notifications` + `audit_logs` | Phase 4 |
| TD-012 | Med | API | `/api/v1` prefix | Phase 6 |
| TD-013 | Med | Frontend | Streaming SSR on `/dashboard` | Phase 2 |
| TD-014 | Med | Frontend | `Cache-Control: s-maxage` on marketing | Phase 2 |
| TD-015 | Low | Frontend | shadcn component set complete (Dialog, Tabs, Dropdown, Toast, etc.) | Phase 2 |
| TD-016 | Low | Frontend | Internationalisation (en-US) | Phase 6 |
| TD-017 | Low | Ops | Operations Guide (non-technical, for the client) | Phase 6 |
| TD-018 | Low | Ops | Status page (status.example.com) | Phase 5 |
| TD-019 | Low | DB | Tutor rating trigger (recompute on every booking completion) | Phase 4 |
| TD-020 | Low | DB | Hardened `tutors.profile_id` immutability trigger | **Done** in this review |
| TD-021 | Low | DB | `course_tutors` write policy tightened to admin | **Done** in this review |
| TD-022 | Low | API | Idempotency-Key header support on every mutating route | Phase 3 |
| TD-023 | Low | n8n  | Per-workflow run log table | **Done** in this review |
| TD-024 | Low | n8n  | Dead-letter table | **Done** in this review |
| TD-025 | Low | n8n  | Compensation subflow "delete orphan meetings" | Phase 3 |
| TD-026 | Low | Tests | Vitest coverage ≥ 70% | Phase 6 |
| TD-027 | Low | Tests | Playwright e2e covering signup → book → pay → reminder | Phase 6 |
| TD-028 | Low | Tests | k6 load test on `/api/bookings/checkout` | Phase 6 |
| TD-029 | Low | Docs | Threat model document (STRIDE) | Phase 6 |
| TD-030 | Low | Ops  | Renovate weekly PR bot | Phase 5 |
| TD-031 | Low | Ops  | Secret-scan in CI | **Done** in this review |
| TD-032 | Low | DB   | `subscriptions` table | **Done** in this review |
| TD-033 | Low | DB   | `coupons` table | **Done** in this review |
| TD-034 | Low | DB   | `invoices` table | **Done** in this review |
| TD-035 | Low | Tests | B1-i18n `DashboardSidebar` test harness — provider receives a partial English messages stub that omits the `Dashboard` namespace; `useTranslations()` then throws `IntlError: MISSING_MESSAGE` on `t.raw('Dashboard.sidebar.items')` and the sidebar renders an empty list. Affects 2 of 66 unit tests. Byte-identical files between Sprint B2 (`1cde839`) and Sprint C (`682abaf`) — pre-existing, not a Sprint C regression. Fix: pass the full `messages/en.json` (or a minimal `{ Dashboard: { sidebar: { items, aria } } }` stub) to `NextIntlClientProvider` in `apps/web/components/dashboard/sidebar.test.tsx`. Tracked in `docs/review/PHASE2_SPRINT_C_SUMMARY.md` §6. | Phase 4 |
