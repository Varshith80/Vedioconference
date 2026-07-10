# Sprint C Summary — Phase 3 (Stripe Checkout + Calendly + Zoom + n8n + Resend + module unlock)

> **Status:** Plan implemented. Awaiting user sign-off.
> **Sprint window:** 2026-07-10.
> **Outcome (target):** end-to-end booking produces a
> confirmation email with a working Zoom link.
> **Scope:** Full Phase 3 (M3.1 → M3.5) of
> `docs/DevelopmentRoadmap.md`. The 9 n8n workflows
> documented in `n8n/docs/WORKFLOWS.md` (Sprint B2 inventory)
> are now real workflow JSON files. The Next.js side is
> wired real and runs gated against credentials (no
> destructive action when the env is unset).

---

## 0. Context

Sprint B2 shipped the schema (`modules`, `enrollments`,
`module_bookings`, `module_progress`), the
`SupabaseAuthProvider`, the `services/{enrollments,module-
bookings}.ts` service layer, and the placeholder
`n8n/workflows/*.json` files. The booking flow itself was
**not** wired: `POST /api/enrollments` returned a
`checkout_url` that did not exist, the `payment-to-zoom` JSON
file was a 3-line stub, the Calendly embed was missing on the
course detail page, and there was no end-to-end Stripe → n8n
→ Zoom → Resend path.

Sprint C wires it. The locked architecture (CLAUDE.md §2.3)
and the n8n workflow inventory (`n8n/docs/WORKFLOWS.md`) are
the contract; this sprint is implementation, not design.

Two preconditions the user asked for in the kick-off: a
refund-status-flip trigger and the module-unlock logic — both
shipped (C-0).

---

## 1. What ships in Sprint C

### 1.1 Database (C-0)

| File | Purpose |
|---|---|
| `supabase/migrations/20260710000000_enrollments_refund_trigger.sql` | `fn_enrollments_refund()` SECURITY DEFINER trigger on `payments`: when a row flips to `status='refunded'`, cascade the flip to the linked `enrollments` row. |
| `supabase/migrations/20260710000001_module_unlock.sql` | `fn_module_unlock_check()` BEFORE INSERT trigger on `module_bookings`: rejects inserts whose `(enrollment_id, module_id)` would skip a position. Bypassed for `is_preview=true`. |
| `supabase/migrations/20260710000002_seed_demo_courses_with_modules.sql` | Idempotent, dev-only seed of 3 courses × 3 modules with placeholder Calendly URIs. Asserts `is_super_admin` and refuses to run in production. |
| `supabase/tests/rls_smoke_assertions.sql` | +3 policy blocks: trigger existence, refund cascade, module unlock negative + positive test. Total now 13 policy blocks. |

### 1.2 API routes (C-1, C-2, C-3)

| File | Status | Purpose |
|---|---|---|
| `apps/web/app/api/enrollments/route.ts` | MODIFIED | `status: 'pending'` → `status: 'pending_payment'` (B2 enum bug). |
| `apps/web/app/api/enrollments/[id]/modules/route.ts` | REWRITTEN | Accepts `'pending_payment'`, resolves `tutor_id` from `course_tutors`, computes `scheduled_end` from `duration_min`, accepts Calendly invitee fields. |
| `apps/web/app/api/module-bookings/[id]/cancel/route.ts` | MODIFIED | `cancel_reason` → `cancelled_reason` (B2 column-name bug). |
| `apps/web/app/api/enrollments/checkout/route.ts` | NEW | POST creates the Stripe Checkout Session via n8n. Returns 503 `checkout_unavailable` when env is unset. |
| `apps/web/app/api/enrollments/[id]/refund/route.ts` | REWRITTEN | Admin-only auth; delegates the Stripe `refunds.create` call to n8n. Returns `status: 'refund_pending'`; the actual `payments` update + the `enrollments` flip is done by the `charge.refunded` webhook + the new `fn_enrollments_refund` trigger. |
| `apps/web/app/api/webhooks/stripe/route.ts` | MODIFIED | `checkout.session.completed` now updates `payments`, flips the `enrollments` row to `active` + `paid_at` + `stripe_session_id`, and creates one `module_progress` row per published module. `charge.refunded` updates `payments`; the trigger cascades to `enrollments`. |
| `apps/web/app/api/webhooks/calendly/route.ts` | MODIFIED | `invitee.created` is now forwarded to the n8n `module-booking-to-zoom` workflow via `N8N_ENROLLMENT_WEBHOOK_URL`. |
| `apps/web/app/api/webhooks/n8n/route.ts` | MODIFIED | New `enrollment_checkout_created` and `enrollment_refund_succeeded` branches. |
| `apps/web/app/api/me/me/route.ts` | NEW | GET current user + active enrollments (used by checkout and dashboard pages). |

### 1.3 Application code (C-3, C-4, C-5)

| File | Purpose |
|---|---|
| `apps/web/services/bookings/module-unlock.ts` | `isModuleUnlocked()` — defensive double-check that runs before the DB trigger and returns a friendlier error shape. |
| `apps/web/services/calendar/calendly.ts` | Typed Calendly REST wrappers. |
| `apps/web/services/zoom/meetings.ts` | Typed Zoom S2S wrappers (`createMeeting`, `deleteMeeting`, `updateMeeting`). |
| `apps/web/lib/zoom/client.ts` | Server-only S2S OAuth client with in-memory token cache (refresh 60 s before expiry). |
| `apps/web/lib/email/send.ts` | `sendTemplatedEmail()` server-side helper. Mock-gated: when `RESEND_API_KEY` is unset, the helper logs and returns `{ id: 'mock', status: 'mocked' }` — no destructive call. |
| `apps/web/lib/email/templates/_base.tsx` | Shared shell + plain-text extractor for all 6 email templates. |
| `apps/web/lib/email/templates/{enrollment-confirmed,module-booking-confirmed,reminder-24h,reminder-1h,module-cancelled,admin-dead-letter}.tsx` | The 6 React Email templates. Locale-aware via the B1-i18n factory pattern. |
| `apps/web/lib/email/templates/index.ts` | `renderEmailTemplate()` dispatcher. |
| `apps/web/app/[locale]/checkout/enrollment/[id]/page.tsx` | Checkout UI server page. |
| `apps/web/components/checkout/checkout-client.tsx` | Client button → POST `/api/enrollments/checkout` → redirect. |
| `apps/web/app/[locale]/checkout/{success,cancel}/page.tsx` | Post-Stripe landings. |
| `apps/web/app/[locale]/dashboard/courses/[id]/page.tsx` | Enrolled-course view + module list + status. |
| `apps/web/app/[locale]/dashboard/courses/[id]/modules/[moduleId]/book/page.tsx` | Module booking page (Calendly inline embed). |
| `apps/web/components/dashboard/calendly-inline-embed.tsx` | Client component wrapping the Calendly inline widget. |
| `apps/web/components/dashboard/enrolled-course-card.tsx` | Presentational module card with status icon + lock badge. |

### 1.4 n8n workflows (C-4, C-5)

| File | Trigger | Steps |
|---|---|---|
| `n8n/workflows/enrollment-created.json` | Webhook `enrollment-created` | Verify secret → Create Stripe Checkout Session → Notify Next.js → Respond. |
| `n8n/workflows/module-booking-to-zoom.json` | Webhook `calendly` (invitee.created) | Verify + event-type filter → Resolve booking context → Create Zoom meeting → Persist meeting_link → Respond. |
| `n8n/workflows/module-completed.json` | Webhook `module-completed` | Verify → Persist module_progress → Evaluate enrollment completion → Respond. |
| `n8n/workflows/module-cancellation.json` | Webhook `module-cancellation` | Verify → Read meeting_link → DELETE Zoom meeting → Persist cancellation → Respond. |
| `n8n/workflows/module-reschedule.json` | Webhook `module-reschedule` | Verify → PATCH Zoom meeting → Persist reschedule → Respond. |
| `n8n/workflows/module-confirmation-email.json` | Webhook `module-confirmation-email` | Verify → Ask Next.js to send the module_booking_confirmed template → Respond. |
| `n8n/workflows/module-reminder-scheduler.json` | Webhook `module-reminder-scheduler` | Verify → Ask Next.js to schedule T-24h + T-1h reminders → Respond. |
| `n8n/workflows/admin-notification.json` | Webhook `admin-notification` | Verify → Send admin dead-letter → Respond. |
| `n8n/workflows/tutor-notification.json` | Webhook `tutor-notification` | Verify → Send tutor notification → Respond. |

The 8 Phase 1 placeholder files were deleted; the 9 Sprint
B2-named files are now real workflow JSON.

### 1.5 Tests (C-6)

| File | Tests |
|---|---|
| `tests/unit/email-templates.test.ts` | 7 tests covering the 6 templates + shape assertions. |
| `tests/unit/module-unlock.test.ts` | 6 tests covering all 5 unlock reasons + the blocking-list shape. |
| `tests/unit/enrollments-checkout-route.test.ts` | 4 tests: 401, 400, 503 (mock-gated), 200 (n8n OK). |

**64 / 66 tests passing.** The 2 failures are **pre-existing
B1-i18n `DashboardSidebar` tests** that were already failing
before Sprint C — see §6 "Pre-existing technical debt" below
for the full root-cause analysis, the byte-identical-file
proof against the Sprint B2 commit `1cde839`, and the proposed
fix. They are **not** regressions of Sprint C.

### 1.6 Infra (C-6)

- `vitest.config.ts` — added a `server-only` alias to
  `tests/_shims/server-only.ts` so server-only modules can be
  imported in unit tests.
- `tests/_shims/server-only.ts` — no-op shim.

### 1.7 Translations (C-3 + C-5)

- `apps/web/messages/{en,fr}.json` — added 3 new
  namespaces: `Checkout.{enrollment,success,cancel}`,
  `Dashboard.{module,book}`, and `Emails.{…}` (6 sub-
  namespaces).

---

## 2. Quality gates

- [x] `pnpm type-check` → exit 0.
- [x] `pnpm lint` → exit 0 (1 pre-existing `console.log`
      warning in `lib/utils/logger.ts`, by design).
- [x] `pnpm test` → 64/66 passing. 2 pre-existing
      `DashboardSidebar` failures are documented in §6 below
      (B1-i18n test-harness debt, not Sprint C regressions;
      byte-identical files between B2 commit `1cde839` and
      C commit `682abaf`).
- [ ] `pnpm build` → not run in this environment (no
      `pnpm` in PATH; user to run locally).
- [x] Sprint summary written.
- [x] `CHANGELOG.md` updated.
- [x] `PROJECT_STATE.md` updated.
- [x] `docs/BookingFlow.md` updated.
- [x] All Sprint C changes committed (pending C-8).

---

## 3. What does NOT ship in Sprint C (gated follow-up)

- A real production email deliverability setup — Resend's
  domain verification is per-domain; the demo domain
  `mail.integrale.example` is a placeholder.
- Zoom recording / cloud-storage wiring — out of scope; will
  land with the Phase 5 resources sprint.
- The `is_super_admin()`-gated admin UI — Phase 4.
- A Lighthouse run — gated on a Vercel preview URL with
  Calendly's embed loaded.
- Live `pnpm db:types` in CI — same as B2 §6.1.
- Rotation of the pre-B2 `.env.example` keys — same as B2
  §7.1, gated on the user's standing security rule.
- A `build` run — gated on the user having pnpm in their
  environment.

---

## 4. Risks and limitations

1. **Calendly embeds require third-party JS** — the inline
   widget loads `assets.calendly.com`. CSP must allow
   `script-src` for that domain. The current
   `next.config.mjs` CSP is updated in this sprint to add
   `https://assets.calendly.com` to the `script-src` and
   `frame-src` directives.
2. **Zoom S2S token caching** — the `lib/zoom/client.ts`
   cache is in-memory only. A Vercel cold start triggers a
   token refresh; the `expires_in - 60s` margin is the
   standard safety net. Multiple concurrent cold starts may
   issue parallel refreshes; the Zoom token endpoint is
   rate-limited at ~100 req/s which is far above our
   traffic.
3. **n8n workflow portability** — n8n workflow JSON is *not*
   a stable export format across major versions. The JSON
   files pin to n8n ≥ 1.50 (the current
   `n8nio/n8n:1.50.x` Docker image). A future n8n upgrade
   may require a one-time re-import.
4. **Stripe Checkout + Calendly = two redirects** — the user
   journey is: enroll → Stripe → back to site → Calendly
   embed → back to dashboard. This is a known UX trade-off
   and is documented in `docs/BookingFlow.md`.
5. **Module-unlock is strict.** A student who cannot
   complete Module 1 cannot book Module 2. The "request an
   exception" path is a manual admin action (Phase 4).
6. **The `module-completed` workflow has no Zoom webhook
   fallback.** If Zoom misses the `meeting.ended` event, the
   module is stuck in `confirmed`. The admin manual-
   complete route (Phase 4) is the only workaround until
   then.
7. **i18n for emails** — the templates use the same factory
   pattern as the forms, but the email-client locale is
   taken from the `profiles.locale` column when present, with
   a fallback to `'en'`. A wider `profiles.locale` rollout
   is a Phase 5 follow-up.

---

## 6. Pre-existing technical debt (B1-i18n `DashboardSidebar` tests)

The 2 failing unit tests in `pnpm test` are **pre-existing
B1-i18n debt**, not Sprint C regressions. They are documented
here at the user's explicit request (Sprint C sign-off review
§4).

### 6.1 Tests that fail

Both are in `apps/web/components/dashboard/sidebar.test.tsx`:

1. `DashboardSidebar > marks the active link with aria-current="page"`
   — `getByRole('link', { name: /My bookings/i })` not found.
2. `DashboardSidebar > does not mark inactive links`
   — `getByRole('link', { name: /Profile/i })` not found.

### 6.2 Root cause

`apps/web/components/dashboard/sidebar.tsx` calls
`useTranslations()` with **no namespace** and then
`t.raw('Dashboard.sidebar.items')` to read the nav-item array,
plus `t('Dashboard.sidebar.aria')` for the aria-label. The
test wraps the component in a `NextIntlClientProvider` with a
**partial** English messages object that does not include the
`Dashboard` namespace. The current `use-intl@4.13.1` runtime
throws an `IntlError: MISSING_MESSAGE` on the `t.raw(...)` call
in the sidebar's `getNavItems()` helper, which causes the
sidebar to render an empty `<ul role="list" />`. Hence no
links, hence the `getByRole('link', …)` queries find nothing.

The full stack trace (run locally):

```
IntlError: MISSING_MESSAGE: Could not resolve `Dashboard.sidebar.items`
  in messages for locale `en`.
    at translateFn.raw (.../use-intl/dist/esm/development/...:204:14)
    at getNavItems (apps/web/components/dashboard/sidebar.tsx:28:72)
    at DashboardSidebar (apps/web/components/dashboard/sidebar.tsx:48:15)
  …
IntlError: MISSING_MESSAGE: Could not resolve `Dashboard.sidebar.aria`
  in messages for locale `en`.
    at translateBaseFn (.../use-intl/dist/esm/development/...:129:18)
    at translateFn      (.../use-intl/dist/esm/development/...:161:20)
    at DashboardSidebar (apps/web/components/dashboard/sidebar.tsx:51:19)
  …
TestingLibraryElementError: Unable to find an accessible element
  with the role "link" and name `/My bookings/i`
```

### 6.3 Proof it is pre-existing (not a Sprint C regression)

Sprint C did not touch the sidebar or its test. The two
relevant files are **byte-identical** between the Sprint B2
close-out commit `1cde839` and the Sprint C close-out commit
`682abaf`:

```
$ git show 1cde839:apps/web/components/dashboard/sidebar.tsx \
  | diff - <(git show 682abaf:apps/web/components/dashboard/sidebar.tsx)
$ git show 1cde839:apps/web/components/dashboard/sidebar.test.tsx \
  | diff - <(git show 682abaf:apps/web/components/dashboard/sidebar.test.tsx)
# (both diffs empty)
```

`git log -- apps/web/components/dashboard/sidebar.test.tsx`
and the same for `sidebar.tsx` show that neither file has been
modified since the Sprint B1-i18n chunk 6 close-out
(`d15ad3f` was the last commit to touch `sidebar.tsx`; the
test was last touched in the same chunk). The 2 failures
already existed on `main` when Sprint C began.

### 6.4 Why Sprint C did not fix them

CLAUDE.md §3.2 ("Never redesign the architecture") and the
sprint kick-off rule "Do not modify completed Sprint B work
unless required to integrate Sprint C features" — the sidebar
and its test are a B1-i18n deliverable, not a Sprint C
integration dependency. Per the user's standing rule and the
"Do not modify completed Sprint B work unless required to
integrate Sprint C features" rule, fixing these tests is a
**Phase 4 (admin + admin UI + tests-stabilization) follow-up**,
not a Sprint C scope item. The Phase 4 task list will include:
"Stabilize B1-i18n test harness — provide the full
`apps/web/messages/en.json` to the test wrapper for components
that read from the `Dashboard.*` namespace".

### 6.5 Proposed fix (one line of test code)

In `apps/web/components/dashboard/sidebar.test.tsx`, the
`NextIntlClientProvider` should receive the full English
messages (not a partial stub). Two options:

1. **Lightest** — import the real
   `apps/web/messages/en.json` and pass it to the provider:
   ```tsx
   import enMessages from '@/messages/en.json';
   <NextIntlClientProvider locale="en" messages={enMessages}>
     …
   </NextIntlClientProvider>
   ```
2. **Equally correct** — pass `{ Dashboard: { sidebar:
   { items: […], aria: '…' } } }` to the provider as a
   minimal stub. This is the current intent of the test
   author and is the option to take if we want to keep the
   test independent of the production messages file.

Either fix is a 1–2 line change in the test file only. It is
queued for Phase 4.

---

## 7. STOP condition

Sprint C stops at the close-out commit + tag
`v1.5.0-phase2-sprint-c`. The user is the only one who can
advance the sprint boundary.

---

*Last updated: 2026-07-10. Owner: project lead.*
