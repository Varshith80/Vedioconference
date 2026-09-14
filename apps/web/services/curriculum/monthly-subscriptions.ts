import 'server-only';
import { createSupabaseServerClient, createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

type EmailLocale = 'en' | 'fr';

/**
 * `services/curriculum/monthly-subscriptions.ts` — the recurring-
 * billing lifecycle for the Monthly Support product
 * (€109 TTC / month, 4×60-min sessions / period, no rollover,
 * end-of-period cancellation).
 *
 * Locked decisions (user-approved D-1 → D-6):
 *   - D-1: subscription `past_due` or suspended → current-period
 *     credits remain consumable until `current_period_end`. No
 *     rollover. No restoration.
 *   - D-2: cancellation is end-of-period. Current period remains.
 *     No refund. No next-period grant.
 *   - D-3: when both Monthly and Pack pools exist, consume the
 *     Monthly pool first (handled in `session-bookings.ts`
 *     `pickSubscriptionPoolFirst`).
 *   - D-4: idempotency uses the existing `n8n_executions` UNIQUE
 *     `run_id` primitive (`20260707000008:111`) PLUS the
 *     `subscription_period_grants` PRIMARY KEY
 *     (`20260914000002_monthly_subscription_period_support.sql`).
 *     No second incompatible idempotency mechanism.
 *   - D-5: email uses the existing `lib/email/send.ts`
 *     (Next.js → Resend, mock-gated on `RESEND_API_KEY`). No
 *     production Resend config change.
 *   - D-6: `subscriptions.current_period_start` /
 *     `subscriptions.current_period_end` are the AUTHORITATIVE
 *     billing period. The application NEVER computes a 30-day
 *     period. `MONTHLY_PERIOD_DAYS` is intentionally NOT exported
 *     here — only `MONTHLY_TOTAL_CREDITS` and `MONTHLY_PRICE_CENTS`.
 *
 * Architecture
 * ------------
 *   - The Stripe webhook (service role) calls the lifecycle
 *     functions below.
 *   - The student-initiated cancel calls `requestCancelAtPeriodEnd`
 *     via the RLS-respecting server client.
 *   - The dashboard reads via `getStudentSubscription` +
 *     `getSubscriptionPeriodHistory` (RLS-respecting).
 *   - The outbox is `n8n_executions`; the `run_id` shape is
 *     `monthly_<event_kind>:<subscription_id>:<event_id>:<now_iso>`
 *     — the existing Pack-refund pattern
 *     (`services/admin/pack-grants.ts:executePackRefund`).
 */

// =====================================================================
// Constants — TEST/HELPER ONLY. Never used to compute the real period.
// (D-6: Stripe's current_period_start / current_period_end are
//  authoritative. Do not export MONTHLY_PERIOD_DAYS.)
// =====================================================================

export const MONTHLY_TOTAL_CREDITS = 4;
export const MONTHLY_PRICE_CENTS = 10900; // €109 TTC
export const MONTHLY_CURRENCY: 'EUR' = 'EUR';

// =====================================================================
// Pure helpers
// =====================================================================

/** Pure: is `now` within the [periodStart, periodEnd) range?
 *  Used for dashboard display only. The period itself comes from
 *  the `subscriptions` row (D-6). */
export function resolveCurrentPeriod(args: {
  periodStart: Date | string;
  periodEnd: Date | string;
  now?: Date;
}): { periodStart: Date; periodEnd: Date; isCurrentPeriod: boolean } {
  const start = typeof args.periodStart === 'string' ? new Date(args.periodStart) : args.periodStart;
  const end = typeof args.periodEnd === 'string' ? new Date(args.periodEnd) : args.periodEnd;
  const now = args.now ?? new Date();
  const t = now.getTime();
  return {
    periodStart: start,
    periodEnd: end,
    isCurrentPeriod: t >= start.getTime() && t < end.getTime(),
  };
}

/** Pure: produce the canonical outbox `run_id` for a lifecycle event.
 *  Matches the Pack-refund pattern: a unique string per (event_kind,
 *  subscription_id, stripe_event_id, attempt). The first three
 *  components are deterministic; the timestamp forces a unique
 *  retry per attempt.
 *
 *  Example: `monthly_past_due:<uuid>:<evt_123>:2026-09-14T00:00:00.000Z`. */
export function buildOutboxRunId(args: {
  eventKind:
    | 'monthly_past_due'
    | 'monthly_recovered'
    | 'monthly_suspended'
    | 'monthly_provision'
    | 'monthly_period_refresh';
  subscriptionId: string;
  stripeEventId: string;
  now?: Date;
}): string {
  const ts = (args.now ?? new Date()).toISOString();
  return `${args.eventKind}:${args.subscriptionId}:${args.stripeEventId}:${ts}`;
}

// =====================================================================
// Internal helpers — outbox write
// =====================================================================

/** Read the lifecycle-relevant fields of a subscription row.
 *  Used by every code path that needs to decide whether to
 *  flip status / recover / finalise. The fields returned are
 *  the canonical terminal-state signals:
 *
 *    cancelled_at IS NOT NULL  → terminal (user-approved D-1/D-2)
 *    status = 'cancelled'      → terminal (defence-in-depth)
 *
 *  Note: `cancel_at_period_end = true` is NOT terminal — it is a
 *  pending request that survives payment recovery. The terminal
 *  predicate uses `cancelled_at IS NOT NULL` exclusively. */
interface SubscriptionState {
  id: string;
  student_id: string;
  status: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  past_due_at: string | null;
  suspended_at: string | null;
  current_period_end: string;
}

async function readSubscriptionState(
  subscriptionId: string,
): Promise<SubscriptionState | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('subscriptions')
    .select('id, student_id, status, cancel_at_period_end, cancelled_at, past_due_at, suspended_at, current_period_end')
    .eq('id', subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SubscriptionState | null;
}

/** Is this row in a terminal state? Terminal = a row whose
 *  `cancelled_at` is set OR whose `status` is `'cancelled'`.
 *  Used as the recovery blocker in every write path that would
 *  otherwise flip a row back to `active`. */
function isTerminal(state: SubscriptionState): boolean {
  return state.cancelled_at !== null || state.status === 'cancelled';
}

/** Insert one row into `n8n_executions`. UNIQUE `run_id` is the
 *  at-most-once primitive. Returns true on insert, false on 23505
 *  duplicate (the caller treats `false` as "already enqueued"). */
async function enqueueOutboxRun(args: {
  workflow: 'monthly-lifecycle';
  runId: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; duplicate: true }> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from('n8n_executions').insert({
    workflow: args.workflow,
    run_id: args.runId,
    status: 'started',
    attempts: 1,
    payload: args.payload,
  } as never);
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return { ok: false, duplicate: true };
    logger.error('monthly outbox enqueue failed', {
      runId: args.runId,
      ...describeError(error),
    });
    throw error;
  }
  return { ok: true };
}

/** Stamp the outcome of the outbox run. Idempotent (no-op if
 *  the row was never inserted; safe to call after a duplicate
 *  outcome too). */
async function stampOutboxRun(args: {
  runId: string;
  status: 'completed' | 'failed';
  error?: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin
    .from('n8n_executions')
    .update({
      status: args.status,
      finished_at: new Date().toISOString(),
      error: args.error ?? null,
    } as never)
    .eq('run_id', args.runId);
}

/** POST the payload to n8n's notify endpoint. Mirrors the
 *  Pack-refund pattern: the URL comes from `N8N_ENROLLMENT_WEBHOOK_URL`
 *  (the existing env var). Returns `ok: true` on 2xx,
 *  `ok: false` on non-2xx / fetch throw / URL null. */
async function postToN8N(args: {
  url: string | null;
  secret: string | null;
  body: Record<string, unknown>;
}): Promise<{ ok: true; status: number } | { ok: false; reason: string }> {
  if (!args.url) return { ok: false, reason: 'webhook_url_not_configured' };
  try {
    const res = await fetch(args.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': args.secret ?? '',
      },
      body: JSON.stringify(args.body),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    return { ok: false, reason: `n8n returned ${res.status}` };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

/** Dispatch a transactional email via the Next.js /api/n8n/notify
 *  route. This route is server-only and owns the React template
 *  rendering + Resend call — by going through HTTP, the service
 *  does not need to import the email renderer (which transitively
 *  pulls in `react-dom/server` and breaks Next.js client-bundle
 *  checks when the service is imported from a route handler).
 *
 *  The route is mock-gated when `RESEND_API_KEY` is unset: it 200s
 *  with `{ ok: true, skipped: 'resend_unset' }` so this caller is
 *  replay-safe. */
async function dispatchMonthlyEmail(args: {
  template:
    | 'monthly_payment_failed'
    | 'monthly_payment_recovered'
    | 'monthly_suspended';
  to: string;
  locale: EmailLocale;
  props: Record<string, unknown>;
}): Promise<{ ok: true; status: number } | { ok: false; reason: string }> {
  const url = process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/n8n/notify`
    : null;
  const secret = serverEnv().N8N_WEBHOOK_SECRET ?? null;
  if (!url || !secret) {
    // Mock-gated: treat as success (the same behaviour as the
    // /api/n8n/notify route when RESEND_API_KEY is unset).
    return { ok: true, status: 200 };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': secret,
      },
      body: JSON.stringify({
        type: 'email',
        template: args.template,
        to: args.to,
        locale: args.locale,
        props: args.props,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `notify returned ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

// =====================================================================
// Public types
// =====================================================================

export type ProvisionMonthlyResult =
  | { kind: 'ok'; subscriptionId: string; grantId: string; periodGrantsId: string }
  | { kind: 'duplicate_subscription'; subscriptionId: string }
  | { kind: 'unknown' };

export type RefreshMonthlyResult =
  | { kind: 'ok'; grantId: string; periodGrantsId: string }
  | { kind: 'already_refreshed' }
  | { kind: 'ineligible_state'; currentStatus: string }
  | { kind: 'period_ended_cancel' }
  | { kind: 'no_op_terminal' }
  | { kind: 'unknown' };

export interface StudentSubscriptionView {
  id:                       string;
  student_id:               string;
  status:                   string;
  current_period_start:     string;
  current_period_end:       string;
  cancel_at_period_end:     boolean;
  cancelled_at:             string | null;
  past_due_at:              string | null;
  grace_period_ends_at:     string | null;
  suspended_at:             string | null;
  stripe_subscription_id:   string | null;
  stripe_price_id:          string | null;
}

export interface PeriodGrantView {
  subscription_id:  string;
  period_start:     string;
  period_end:       string;
  session_grant_id: string;
  created_at:       string;
}

// =====================================================================
// Provisioning — first subscription period
// =====================================================================

/**
 * Create a `subscriptions` row + a `session_grants` pool row +
 * a `subscription_period_grants` row, all in one atomic write.
 *
 * Called by the Stripe webhook on `customer.subscription.created`.
 * Service role only (bypasses RLS).
 *
 * Period values come from Stripe (D-6) — never computed locally.
 *
 * Returns discriminated result so the route layer can map to
 * a structured HTTP response.
 */
export async function provisionMonthlySubscription(args: {
  studentId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  latestInvoiceId: string | null;
  stripeEventId: string;
}): Promise<ProvisionMonthlyResult> {
  try {
    const admin = createSupabaseAdminClient();

    // Pre-flight: dedupe by stripe_subscription_id (UNIQUE).
    const { data: existing, error: exErr } = await admin
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', args.stripeSubscriptionId)
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) return { kind: 'duplicate_subscription', subscriptionId: (existing as { id: string }).id };

    // 1. INSERT subscriptions row.
    // status defaults to 'incomplete' until the first payment
    // succeeds; the existing `checkout.session.completed`
    // handler does not flip subscription.status — the
    // subscription-lifecycle webhooks do (see
    // `lib/stripe/subscription-event-handlers.ts`).
    const { data: sub, error: subErr } = await admin
      .from('subscriptions')
      .insert({
        student_id:             args.studentId,
        status:                 'incomplete',
        stripe_subscription_id: args.stripeSubscriptionId,
        stripe_customer_id:     args.stripeCustomerId,
        stripe_price_id:        args.stripePriceId,
        current_period_start:   args.currentPeriodStart.toISOString(),
        current_period_end:     args.currentPeriodEnd.toISOString(),
        cancel_at_period_end:   false,
        stripe_latest_invoice_id: args.latestInvoiceId,
      } as never)
      .select('id')
      .single();
    if (subErr) throw subErr;
    const subscriptionId = (sub as unknown as { id: string }).id;

    // 2. INSERT session_grants pool row (subscription grant_type,
    //    total_credits = 4, expires_at NULL — the period end IS
    //    the source of truth, per
    //    `20260825000001_session_grants_pack_subscription.sql`
    //    §2.6 comment).
    const { data: grant, error: grantErr } = await admin
      .from('session_grants')
      .insert({
        student_id:       args.studentId,
        session_id:       null,
        grant_type:       'subscription',
        total_credits:    MONTHLY_TOTAL_CREDITS,
        consumed_credits: 0,
        expires_at:       null,
        status:           'active',
        amount_cents:     MONTHLY_PRICE_CENTS,
        currency:         MONTHLY_CURRENCY,
        metadata: {
          kind: 'monthly',
          subscription_id: subscriptionId,
          credits: MONTHLY_TOTAL_CREDITS,
        },
      } as never)
      .select('id')
      .single();
    if (grantErr) throw grantErr;
    const grantId = (grant as unknown as { id: string }).id;

    // 3. Backfill the FK on subscriptions.
    const { error: linkErr } = await admin
      .from('subscriptions')
      .update({ session_grant_id: grantId } as never)
      .eq('id', subscriptionId);
    if (linkErr) throw linkErr;

    // 4. INSERT subscription_period_grants row (the
    //    at-most-once-on-period-refresh primitive).
    const { data: spg, error: spgErr } = await admin
      .from('subscription_period_grants')
      .insert({
        subscription_id:  subscriptionId,
        period_start:     args.currentPeriodStart.toISOString(),
        period_end:       args.currentPeriodEnd.toISOString(),
        session_grant_id: grantId,
      } as never)
      .select('subscription_id')
      .single();
    if (spgErr) throw spgErr;
    const periodGrantsId =
      (spg as unknown as { subscription_id: string; period_start: string }).subscription_id +
      ':' +
      (spg as unknown as { subscription_id: string; period_start: string }).period_start;

    return { kind: 'ok', subscriptionId, grantId, periodGrantsId };
  } catch (e) {
    logger.error('provisionMonthlySubscription failed', {
      ...describeError(e),
      stripeSubscriptionId: args.stripeSubscriptionId,
    });
    return { kind: 'unknown' };
  }
}

// =====================================================================
// Period refresh
// =====================================================================

/**
 * Idempotent period refresh. Inserts one `subscription_period_grants`
 * row + one fresh `session_grants` pool row for the NEW period.
 *
 * Race-safety: the PK on `subscription_period_grants(subscription_id,
 * period_start)` is the at-most-once primitive. A duplicate refresh
 * returns `'already_refreshed'`.
 *
 * Suspended / cancelled never get new grants (returns
 * `'ineligible_state'` or `'period_ended_cancel'`).
 *
 * Called by the Stripe webhook on `customer.subscription.updated`
 * with a new `current_period_start` (period rollover).
 */
export async function refreshSubscriptionPeriod(args: {
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  stripeEventId: string;
}): Promise<RefreshMonthlyResult> {
  try {
    const admin = createSupabaseAdminClient();

    // 1. Load the subscription row to check eligibility.
    const state = await readSubscriptionState(args.subscriptionId);
    if (!state) {
      return { kind: 'ineligible_state', currentStatus: 'not_found' };
    }

    // D-2: cancel_at_period_end=true at current_period_end →
    // finalise as cancelled, NO new period grant. This branch
    // runs BEFORE the terminal guard because `cancel_at_period_end`
    // is a PENDING request, not a terminal state — it gets
    // finalised here. (A row with `cancelled_at` already set is
    // terminal and is handled by the next guard.)
    if (state.cancel_at_period_end && state.cancelled_at === null) {
      const { error: cancelErr } = await admin
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        } as never)
        .eq('id', args.subscriptionId);
      if (cancelErr) throw cancelErr;
      return { kind: 'period_ended_cancel' };
    }

    // Terminal-state guard (user-approved correction v2): a row
    // with `cancelled_at` set OR `status='cancelled'` is dead.
    // No new period grant, no status flip.
    if (isTerminal(state)) {
      logger.info('refreshSubscriptionPeriod: subscription is terminal, NO-OP', {
        subscriptionId: args.subscriptionId,
        cancelled_at: state.cancelled_at,
        status: state.status,
      });
      return { kind: 'no_op_terminal' };
    }

    // D-1: incomplete_expired never gets new grants (Stripe-side
    // termination that we have not flipped to cancelled yet).
    if (state.status === 'incomplete_expired') {
      return { kind: 'ineligible_state', currentStatus: state.status };
    }

    // 2. INSERT subscription_period_grants row first (PK is the
    //    race-safety primitive).
    let periodGrantsId: string;
    try {
      const { data: spg, error: spgErr } = await admin
        .from('subscription_period_grants')
        .insert({
          subscription_id: args.subscriptionId,
          period_start:    args.periodStart.toISOString(),
          period_end:      args.periodEnd.toISOString(),
          session_grant_id: '00000000-0000-0000-0000-000000000000', // FK placeholder; replaced in step 3
        } as never)
        .select('subscription_id, period_start')
        .single();
      if (spgErr) throw spgErr;
      periodGrantsId =
        (spg as unknown as { subscription_id: string; period_start: string }).subscription_id +
        ':' +
        (spg as unknown as { subscription_id: string; period_start: string }).period_start;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') return { kind: 'already_refreshed' };
      throw e;
    }

    // 3. INSERT session_grants pool row.
    const { data: grant, error: grantErr } = await admin
      .from('session_grants')
      .insert({
        student_id:       state.student_id,
        session_id:       null,
        grant_type:       'subscription',
        total_credits:    MONTHLY_TOTAL_CREDITS,
        consumed_credits: 0,
        expires_at:       null,
        status:           'active',
        amount_cents:     MONTHLY_PRICE_CENTS,
        currency:         MONTHLY_CURRENCY,
        metadata: {
          kind: 'monthly',
          subscription_id: args.subscriptionId,
          credits: MONTHLY_TOTAL_CREDITS,
        },
      } as never)
      .select('id')
      .single();
    if (grantErr) throw grantErr;
    const grantId = (grant as unknown as { id: string }).id;

    // 4. UPDATE subscription_period_grants.session_grant_id with
    //    the real FK (the placeholder in step 2 is a constraint
    //    workaround; the FK is RESTRICT, not DEFERRABLE).
    const { error: linkErr } = await admin
      .from('subscription_period_grants')
      .update({ session_grant_id: grantId } as never)
      .eq('subscription_id', args.subscriptionId)
      .eq('period_start', args.periodStart.toISOString());
    if (linkErr) throw linkErr;

    // 5. UPDATE subscriptions.current_period_* + status='active'
    //    + clear past_due markers (recovery via fresh period).
    const { error: subUpdErr } = await admin
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_start: args.periodStart.toISOString(),
        current_period_end:   args.periodEnd.toISOString(),
        past_due_at:          null,
        grace_period_ends_at: null,
        suspended_at:         null,
        session_grant_id:     grantId,
      } as never)
      .eq('id', args.subscriptionId);
    if (subUpdErr) throw subUpdErr;

    return { kind: 'ok', grantId, periodGrantsId };
  } catch (e) {
    logger.error('refreshSubscriptionPeriod failed', {
      ...describeError(e),
      subscriptionId: args.subscriptionId,
    });
    return { kind: 'unknown' };
  }
}

// =====================================================================
// Lifecycle state transitions (Stripe-driven)
// =====================================================================

/**
 * Stripe-driven: subscription went `past_due`. Stamps
 * `past_due_at`, `grace_period_ends_at` (now + 5 days, the
 * business rule "2 retries over 5 days"). Sends payment-failed
 * email. Outbox: `n8n_executions` row.
 *
 * D-1: does NOT mutate the current-period pool row.
 */
export async function markSubscriptionPastDue(args: {
  subscriptionId: string;
  stripeEventId: string;
  failureReason: string;
  studentEmail: string | null;
  studentName: string | null;
  locale: EmailLocale;
  periodEndIso: string;
}): Promise<{ kind: 'ok' } | { kind: 'no_subscription' } | { kind: 'webhook_unavailable' }> {
  const admin = createSupabaseAdminClient();
  const now = new Date();
  const grace = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

  const { data: row, error: loadErr } = await admin
    .from('subscriptions')
    .select('id, status, past_due_at, student_id')
    .eq('id', args.subscriptionId)
    .maybeSingle();
  if (loadErr) throw loadErr;
  if (!row) return { kind: 'no_subscription' };

  // Idempotent: if already past_due_at set AND unchanged reason
  // is fine — the second webhook hit on the same event_id is
  // a replay.
  const runId = buildOutboxRunId({
    eventKind: 'monthly_past_due',
    subscriptionId: args.subscriptionId,
    stripeEventId: args.stripeEventId,
    now,
  });

  const outbox = await enqueueOutboxRun({
    workflow: 'monthly-lifecycle',
    runId,
    payload: {
      event: 'past_due',
      subscription_id: args.subscriptionId,
      failure_reason: args.failureReason,
      period_end: args.periodEndIso,
      locale: args.locale,
      student_email: args.studentEmail,
      student_name: args.studentName,
    },
  });
  if (!outbox.ok && outbox.duplicate) {
    return { kind: 'ok' }; // already enqueued — no double-email
  }

  // Stamp DB state (D-1: does NOT touch session_grants pool).
  const { error: updErr } = await admin
    .from('subscriptions')
    .update({
      status: 'past_due',
      past_due_at: now.toISOString(),
      grace_period_ends_at: grace.toISOString(),
    } as never)
    .eq('id', args.subscriptionId);
  if (updErr) throw updErr;

  // Send email (mock-gated on RESEND_API_KEY — D-5).
  let emailOk = true;
  let emailError: string | null = null;
  if (args.studentEmail) {
    const dispatched = await dispatchMonthlyEmail({
      template: 'monthly_payment_failed',
      to: args.studentEmail,
      locale: args.locale,
      props: {
        studentName: args.studentName ?? '',
        failureReason: args.failureReason,
        periodEnd: args.periodEndIso,
        amountEur: MONTHLY_PRICE_CENTS / 100,
      },
    });
    if (!dispatched.ok) {
      emailOk = false;
      emailError = dispatched.reason;
      logger.error('monthly past_due email dispatch failed', {
        reason: dispatched.reason,
        subscriptionId: args.subscriptionId,
      });
    }
  }

  // Stamp the outbox row outcome.
  await stampOutboxRun({
    runId,
    status: emailOk ? 'completed' : 'failed',
    error: emailError ?? undefined,
  });

  return { kind: 'ok' };
}

/**
 * Stripe-driven: subscription recovered from past_due. Flips back
 * to `active`, clears `past_due_at` + `grace_period_ends_at`.
 * Sends payment-recovered email. Outbox: `n8n_executions`.
 *
 * D-1: only clears the past_due markers; does NOT restore any
 * expired credits (the existing period remains whatever-it-was).
 *
 * Terminal-state guard (user-approved correction v2): a row with
 * `cancelled_at` set OR `status='cancelled'` is dead and CANNOT
 * be reactivated. `cancel_at_period_end=true` is NOT terminal —
 * it is a pending request that we preserve through recovery (the
 * update below deliberately does NOT touch `cancel_at_period_end`).
 */
export async function markSubscriptionPaymentRecovered(args: {
  subscriptionId: string;
  stripeEventId: string;
  studentEmail: string | null;
  studentName: string | null;
  locale: EmailLocale;
}): Promise<{ kind: 'ok' } | { kind: 'no_op_terminal' } | { kind: 'no_subscription' } | { kind: 'webhook_unavailable' }> {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  // Read the current state BEFORE inserting the outbox row —
  // the terminal-state guard is a pure predicate; if the row is
  // dead we want to skip the entire side-effect pipeline (no
  // outbox INSERT, no email, no UPDATE).
  const state = await readSubscriptionState(args.subscriptionId);
  if (!state) return { kind: 'no_subscription' };
  if (isTerminal(state)) {
    logger.info('markSubscriptionPaymentRecovered: subscription is terminal, NO-OP', {
      subscriptionId: args.subscriptionId,
      cancelled_at: state.cancelled_at,
      status: state.status,
    });
    return { kind: 'no_op_terminal' };
  }

  const runId = buildOutboxRunId({
    eventKind: 'monthly_recovered',
    subscriptionId: args.subscriptionId,
    stripeEventId: args.stripeEventId,
    now,
  });

  const outbox = await enqueueOutboxRun({
    workflow: 'monthly-lifecycle',
    runId,
    payload: {
      event: 'recovered',
      subscription_id: args.subscriptionId,
      locale: args.locale,
      student_email: args.studentEmail,
      student_name: args.studentName,
    },
  });
  if (!outbox.ok && outbox.duplicate) {
    return { kind: 'ok' };
  }

  // Note: cancel_at_period_end is intentionally NOT in the update
  // payload — it must be preserved if it was set (a cancellation
  // request survives payment recovery). past_due_at and
  // grace_period_ends_at are cleared (recovery window is closed).
  const { error: updErr } = await admin
    .from('subscriptions')
    .update({
      status: 'active',
      past_due_at: null,
      grace_period_ends_at: null,
    } as never)
    .eq('id', args.subscriptionId);
  if (updErr) throw updErr;

  let emailOk = true;
  let emailError: string | null = null;
  if (args.studentEmail) {
    const dispatched = await dispatchMonthlyEmail({
      template: 'monthly_payment_recovered',
      to: args.studentEmail,
      locale: args.locale,
      props: { studentName: args.studentName ?? '' },
    });
    if (!dispatched.ok) {
      emailOk = false;
      emailError = dispatched.reason;
      logger.error('monthly recovered email dispatch failed', {
        reason: dispatched.reason,
        subscriptionId: args.subscriptionId,
      });
    }
  }

  await stampOutboxRun({
    runId,
    status: emailOk ? 'completed' : 'failed',
    error: emailError ?? undefined,
  });

  return { kind: 'ok' };
}

/**
 * Stripe-driven OR grace-expiry final suspension. Stamps
 * `status='cancelled'`, `suspended_at`. Sends suspended email.
 * Outbox: `n8n_executions`.
 *
 * D-1: does NOT touch the existing pool row — current-period
 * credits remain consumable until `current_period_end`.
 */
export async function markSubscriptionSuspended(args: {
  subscriptionId: string;
  stripeEventId: string;
  reason: 'grace_expired' | 'stripe_deleted';
  studentEmail: string | null;
  studentName: string | null;
  locale: EmailLocale;
}): Promise<{ kind: 'ok' } | { kind: 'no_subscription' } | { kind: 'webhook_unavailable' }> {
  const admin = createSupabaseAdminClient();
  const now = new Date();

  const runId = buildOutboxRunId({
    eventKind: 'monthly_suspended',
    subscriptionId: args.subscriptionId,
    stripeEventId: args.stripeEventId,
    now,
  });

  const outbox = await enqueueOutboxRun({
    workflow: 'monthly-lifecycle',
    runId,
    payload: {
      event: 'suspended',
      subscription_id: args.subscriptionId,
      reason: args.reason,
      locale: args.locale,
      student_email: args.studentEmail,
      student_name: args.studentName,
    },
  });
  if (!outbox.ok && outbox.duplicate) {
    return { kind: 'ok' };
  }

  const { error: updErr } = await admin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      suspended_at: now.toISOString(),
      cancelled_at: now.toISOString(),
      past_due_at: null,
      grace_period_ends_at: null,
    } as never)
    .eq('id', args.subscriptionId);
  if (updErr) throw updErr;

  let emailOk = true;
  let emailError: string | null = null;
  if (args.studentEmail) {
    const dispatched = await dispatchMonthlyEmail({
      template: 'monthly_suspended',
      to: args.studentEmail,
      locale: args.locale,
      props: { studentName: args.studentName ?? '', reason: args.reason },
    });
    if (!dispatched.ok) {
      emailOk = false;
      emailError = dispatched.reason;
      logger.error('monthly suspended email dispatch failed', {
        reason: dispatched.reason,
        subscriptionId: args.subscriptionId,
      });
    }
  }

  await stampOutboxRun({
    runId,
    status: emailOk ? 'completed' : 'failed',
    error: emailError ?? undefined,
  });

  return { kind: 'ok' };
}

// =====================================================================
// Student-initiated cancel
// =====================================================================

/**
 * Student-initiated: set `cancel_at_period_end=true`. No state
 * change yet; the period-refresh path at `current_period_end`
 * sees the flag and finalises via `refreshSubscriptionPeriod`
 * → `'period_ended_cancel'` (no new period grant).
 *
 * D-2: no refund, no immediate cancellation, no new grant.
 */
export async function requestCancelAtPeriodEnd(args: {
  subscriptionId: string;
  studentId: string;
}): Promise<
  | { kind: 'ok'; periodEnd: string }
  | { kind: 'no_subscription' }
  | { kind: 'already_cancelling' }
> {
  const supabase = await createSupabaseServerClientUntyped();
  // RLS-respecting: the student can only see their own row.
  const { data: row, error: loadErr } = await supabase
    .from('subscriptions')
    .select('id, status, cancel_at_period_end, current_period_end, student_id')
    .eq('id', args.subscriptionId)
    .maybeSingle();
  if (loadErr) throw loadErr;
  if (!row) return { kind: 'no_subscription' };
  const sub = row as unknown as {
    student_id: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string;
  };
  if (sub.student_id !== args.studentId) return { kind: 'no_subscription' };
  if (sub.status === 'cancelled') return { kind: 'no_subscription' };
  if (sub.cancel_at_period_end) return { kind: 'already_cancelling' };

  const { error: updErr } = await supabase
    .from('subscriptions')
    .update({ cancel_at_period_end: true } as never)
    .eq('id', args.subscriptionId);
  if (updErr) throw updErr;
  return { kind: 'ok', periodEnd: sub.current_period_end };
}

// =====================================================================
// RLS-respecting reads (dashboard)
// =====================================================================

/** Read the student's current (most recent) subscription row. */
export async function getStudentSubscription(
  studentId: string,
): Promise<StudentSubscriptionView | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('subscriptions')
      .select(
        'id, student_id, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, past_due_at, grace_period_ends_at, suspended_at, stripe_subscription_id, stripe_price_id',
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as StudentSubscriptionView | null;
  } catch (e) {
    logger.error('getStudentSubscription failed', {
      studentId,
      ...describeError(e),
    });
    return null;
  }
}

/** Read the historical pool grants for this subscription
 *  (one row per period, ordered by period_start desc). */
export async function getSubscriptionPeriodHistory(
  subscriptionId: string,
  studentId: string,
): Promise<ReadonlyArray<PeriodGrantView>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sub, error: subErr } = await supabase
      .from('subscriptions')
      .select('id, student_id')
      .eq('id', subscriptionId)
      .maybeSingle();
    if (subErr) throw subErr;
    const subRow = sub as unknown as { student_id: string } | null;
    if (!subRow || subRow.student_id !== studentId) return [];

    const { data, error } = await supabase
      .from('subscription_period_grants')
      .select('subscription_id, period_start, period_end, session_grant_id, created_at')
      .eq('subscription_id', subscriptionId)
      .order('period_start', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ReadonlyArray<PeriodGrantView>;
  } catch (e) {
    logger.error('getSubscriptionPeriodHistory failed', {
      subscriptionId,
      ...describeError(e),
    });
    return [];
  }
}
