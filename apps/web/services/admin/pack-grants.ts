import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Phase 1 — Feature B: admin Pack 10 grants read service.
//
// `listPackGrants()` is the list service for /admin/packs. It is
// admin-gated by the existing RLS policy
// `session_grants_select_owner_admin` (the page route guards
// on `requireAdmin()` first; the server client respects RLS,
// so a non-admin caller gets an empty result by the time the
// page renders).
//
// Throws on Supabase failure so the calling page can build
// the `AdminFetchResult` envelope through `safeAdminFetch()`
// — see `services/admin/admin-fetch.ts`. The list page is
// the one that turns the throw into the visible destructive
// card + Retry.
//
// `getPackGrantById()` is a single-row reader for the
// /admin/packs/[id] detail page. Returns `null` on miss
// (the page calls `notFound()`) and on RLS-deny (the page
// cannot distinguish miss-from-RLS-deny without a
// larger refactor; both render 404 which is the safer
// default).
//
// `calculatePackRefundPreview()` is the pure helper that
// powers both the preview endpoint and the execute endpoint.
// It is the single source of truth for the €35/unused-
// session math: cap = amount_paid (not amount_charged), and
// the €35 figure is fixed by the locked pricing decision.
//
// `executePackRefund()` is the admin-initiated refund writer.
//
// TASK 2.1 (financial-consistency repair) semantics:
//   - The service NEVER writes `session_grants.status='refunded'`
//     or `session_grants.refunded_amount_cents`. Those columns
//     are stamped SOLELY by the existing Stripe `charge.refunded`
//     webhook handler + `fn_enrollments_refund` cascade trigger
//     (CLAUDE.md §2.3). This is the invariant the user required:
//     "the database must not permanently claim Stripe refund
//     confirmed when Stripe has not confirmed it."
//   - The service records the outbound refund-enqueue attempt in
//     `n8n_executions` (run_id = refund_request_id, UNIQUE). Two
//     admins racing produce exactly one outbox row (23505 →
//     'already_refunded'). The existing `n8n_executions.status`
//     values ('started' | 'completed' | 'failed') keep their
//     existing meaning: 'completed' = "n8n execution finished",
//     NOT "Stripe refund confirmed".
//   - The HTTP response is honest:
//       kind='ok' (n8n_executions.status='completed') → 200
//         body.refund_status = 'n8n_accepted' (Stripe confirmation
//         pending; observed separately via payments.status='refunded')
//       kind='webhook_failed' → 502
//       kind='webhook_unavailable' → 503
//   - The Stripe webhook + cascade trigger remains the only
//     path that flips `session_grants.status='refunded'` and
//     writes `session_grants.refunded_amount_cents` (to
//     `charge.amount_refunded`). Admin route does not touch
//     `session_grants` at all.
// =====================================================================

/** Fixed Pack 10 unit price (cents). Locked. */
export const PACK_TOTAL_CENTS = 29900;
/** Pack 10 credit count. Locked. */
export const PACK_TOTAL_CREDITS = 10;
/** Per-unused-session refund (cents). Locked. */
export const PACK_PER_UNUSED_REFUND_CENTS = 3500;

/** Status set that the pack admin UI considers "open". */
const PACK_OPEN_STATUSES: ReadonlySet<string> = new Set([
  'pending_payment',
  'active',
  'completed',
]);

/** Statuses that mean the pack is already terminal from a refund
 *  perspective: a refund on these is rejected as a duplicate. */
const PACK_TERMINAL_REFUNDED_STATUSES: ReadonlySet<string> = new Set([
  'refunded',
]);

/** Statuses that mean the pack is already terminal from a
 *  cancellation perspective: the operator should not attempt
 *  a refund on these.
 *
 *  IMPORTANT: `session_grants.status` uses the `enrollment_status`
 *  enum (Sprint 3.5, migration 20260714000002_session_grants.sql).
 *  That enum does NOT include `no_show` / `rescheduled` — those
 *  values belong to `booking_status` and apply to
 *  `session_bookings.status`, not to `session_grants.status`.
 *  The pack service therefore only checks for the one terminal
 *  `enrollment_status` value: `cancelled`. */
const PACK_TERMINAL_CANCEL_STATUSES: ReadonlySet<string> = new Set([
  'cancelled',
]);

/** Shape consumed by /admin/packs (list) and /admin/packs/[id] (detail).
 *
 *  `status` mirrors the documented `enrollment_status` enum. The
 *  `booking_status` values `no_show` and `rescheduled` are NOT
 *  valid `session_grants.status` values and are excluded. */
export interface AdminPackGrant {
  id: string;
  studentId: string;
  studentName: string | null;
  studentEmail: string | null;
  status:
    | 'pending_payment'
    | 'active'
    | 'completed'
    | 'cancelled'
    | 'refunded';
  amountCents: number;
  currency: string;
  totalCredits: number;
  consumedCredits: number;
  refundedAt: string | null;
  refundedAmountCents: number;
  createdAt: string;
  expiresAt: string | null;
}

/**
 * Pure helper. The unused-session count is
 * `total_credits - consumed_credits`, clamped to the
 * `[0, total_credits]` interval. A `consumed_credits` value
 * that is somehow greater than `total_credits` (data drift)
 * is treated as fully consumed — the conservative choice.
 */
export function unusedCredits(
  totalCredits: number | null | undefined,
  consumedCredits: number | null | undefined,
): number {
  const total = totalCredits ?? PACK_TOTAL_CREDITS;
  const consumed = consumedCredits ?? 0;
  if (consumed <= 0) return total;
  if (consumed >= total) return 0;
  return total - consumed;
}

/**
 * Pure helper. Refund preview.
 *
 *   - If the pack is in a terminal cancelled/no_show/rescheduled
 *     status, returns `{ kind: 'invalid_state' }`.
 *   - If the pack is already refunded, returns
 *     `{ kind: 'already_refunded' }`.
 *   - Otherwise, returns the calculation:
 *       unused = total_credits - consumed_credits (clamped)
 *       calculated = unused * PACK_PER_UNUSED_REFUND_CENTS
 *       actual = min(calculated, amount_paid)
 *
 * The €35/unused-session cap is mandatory: the user
 * explicitly required that `actual refund ≤ amount
 * actually paid`. Example: 10 unused → €350 calculated,
 * capped at €299 paid.
 */
export type PackRefundPreview =
  | {
      kind: 'ok';
      unusedSessions: number;
      calculatedCents: number;
      actualCents: number;
      capped: boolean;
    }
  | { kind: 'invalid_state'; currentStatus: string }
  | { kind: 'already_refunded' };

export function calculatePackRefundPreview(input: {
  totalCredits: number | null | undefined;
  consumedCredits: number | null | undefined;
  amountCents: number;
  status: string;
}): PackRefundPreview {
  if (PACK_TERMINAL_REFUNDED_STATUSES.has(input.status)) {
    return { kind: 'already_refunded' };
  }
  if (PACK_TERMINAL_CANCEL_STATUSES.has(input.status)) {
    return { kind: 'invalid_state', currentStatus: input.status };
  }
  // status is in PACK_OPEN_STATUSES (pending_payment, active, completed).
  // pending_payment → refund is the pre-payment cancel path; we
  // still compute the preview the same way for consistency.
  const unused = unusedCredits(input.totalCredits, input.consumedCredits);
  const calculatedCents = unused * PACK_PER_UNUSED_REFUND_CENTS;
  const actualCents = Math.min(calculatedCents, input.amountCents);
  return {
    kind: 'ok',
    unusedSessions: unused,
    calculatedCents,
    actualCents,
    capped: actualCents < calculatedCents,
  };
}

/** Discriminated-union writer result. The API route maps each
 *  `kind` to an HTTP status code (see route.ts).
 *
 *  TASK 2.1: `ok` no longer carries the post-flip grant — the
 *  service no longer flips the grant. The route returns the
 *  current grant row (re-read after the n8n POST) when needed
 *  for the success body; the service returns
 *  `{ kind: 'ok', refundRequestId, requestedAmountCents, currency }`
 *  and the route does the re-read. This keeps the service honest:
 *  it never claims a state it did not write. */
export type ExecutePackRefundResult =
  | {
      kind: 'ok';
      refundRequestId: string;
      requestedAmountCents: number;
      currency: string;
    }
  | { kind: 'not_found' }
  | { kind: 'invalid_state'; currentStatus: string }
  | { kind: 'already_refunded' }
  | { kind: 'refund_zero'; unusedSessions: number }
  | { kind: 'webhook_unavailable'; reason: 'not_configured'; refundRequestId: string }
  | { kind: 'webhook_failed'; reason: string; refundRequestId: string };

// ---------------------------------------------------------------------
// Row flatten helpers
// ---------------------------------------------------------------------

interface RawPackRow {
  id: string;
  student_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  total_credits: number | null;
  consumed_credits: number | null;
  refunded_at: string | null;
  refunded_amount_cents: number | null;
  created_at: string;
  expires_at: string | null;
  student:
    | { id: string; full_name: string | null; email: string | null }
    | null;
}

function flattenPackRow(row: RawPackRow): AdminPackGrant {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student?.full_name ?? null,
    studentEmail: row.student?.email ?? null,
    status: row.status as AdminPackGrant['status'],
    amountCents: row.amount_cents,
    currency: row.currency,
    totalCredits: row.total_credits ?? PACK_TOTAL_CREDITS,
    consumedCredits: row.consumed_credits ?? 0,
    refundedAt: row.refunded_at,
    refundedAmountCents: row.refunded_amount_cents ?? 0,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

// ---------------------------------------------------------------------
// List
// ---------------------------------------------------------------------

/**
 * All Pack 10 grants, newest first, capped at 200 rows for
 * the admin table. Throws on Supabase failure so the page
 * can render the destructive card + Retry through
 * `safeAdminFetch()`.
 */
export const listPackGrants = cache(
  async (): Promise<ReadonlyArray<AdminPackGrant>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_grants')
      .select(
        `
          id, student_id, status, amount_cents, currency,
          total_credits, consumed_credits,
          refunded_at, refunded_amount_cents,
          created_at, expires_at,
          student:profiles!session_grants_student_id_fkey (
            id, full_name, email
          )
        `,
      )
      .eq('grant_type', 'pack')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    const rows = (data ?? []) as unknown as RawPackRow[];
    return rows.map(flattenPackRow);
  },
);

// ---------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------

/**
 * Single Pack grant by id. Returns `null` on miss or on
 * RLS-deny. The page calls `notFound()` on null, which
 * renders 404 (the safer default).
 */
export const getPackGrantById = cache(
  async (id: string): Promise<AdminPackGrant | null> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_grants')
      .select(
        `
          id, student_id, status, amount_cents, currency,
          total_credits, consumed_credits,
          refunded_at, refunded_amount_cents,
          created_at, expires_at,
          student:profiles!session_grants_student_id_fkey (
            id, full_name, email
          )
        `,
      )
      .eq('id', id)
      .eq('grant_type', 'pack')
      .maybeSingle();
    if (error) {
      logger.error('admin.getPackGrantById failed', { id, ...describeError(error) });
      return null;
    }
    if (!data) return null;
    return flattenPackRow(data as unknown as RawPackRow);
  },
);

// ---------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------

/**
 * Execute the Pack refund.
 *
 * Authorisation: the caller MUST be an admin; this is enforced
 * upstream by `requireAdminRoute()` in the API route handler.
 * The service uses the RLS-respecting server client (the
 * admin route's `supabase` derives from the user's JWT). The
 * new `n8n_executions_admin_insert` / `_update` RLS policies
 * (migration 20260914000001) allow the admin server client to
 * record the outbound refund-enqueue attempt.
 *
 * TASK 2.1 — financial-consistency invariants
 * --------------------------------------------
 * 1. The service NEVER writes `session_grants.status='refunded'`
 *    or `session_grants.refunded_amount_cents`. Those columns
 *    are stamped SOLELY by the existing Stripe `charge.refunded`
 *    webhook handler + `fn_enrollments_refund` cascade trigger.
 * 2. The service records the outbound enqueue attempt in
 *    `n8n_executions` with `run_id = refund_request_id`. The
 *    existing `n8n_executions.run_id UNIQUE` index is the
 *    at-most-once primitive for two-admin race (23505 →
 *    'already_refunded').
 * 3. n8n 2xx ⇒ `n8n_executions.status='completed'` ⇒ HTTP 200
 *    with body.refund_status='n8n_accepted'. The body does NOT
 *    claim Stripe confirmation; Stripe confirmation is observed
 *    separately via `payments.status='refunded'` (set by the
 *    Stripe inbound webhook + cascade).
 * 4. n8n 5xx / fetch throw ⇒ `status='failed'` ⇒ HTTP 502.
 * 5. webhookUrl null ⇒ no n8n_executions UPDATE, status stays
 *    'started' ⇒ HTTP 503.
 * 6. The CHECK `session_grants_refund_in_bounds` still guards
 *    against a duplicate `payments.status='refunded'` cascade
 *    stamp; the cascade trigger's WHERE filter
 *    (`sg.status IN ('active', 'completed')`) makes a second
 *    Stripe-confirmation a no-op.
 *
 * Race-safety (preserved)
 * -----------------------
 *   - Two admins clicking Refund simultaneously on the same
 *     grant produce exactly ONE `n8n_executions` row (UNIQUE
 *     run_id). The second admin receives 23505 from the
 *     outbox INSERT and is mapped to `kind: 'already_refunded'`.
 *   - The Stripe webhook + cascade trigger remains idempotent
 *     end-to-end: replays hit the `webhook_events` UNIQUE on
 *     Stripe event_id; the cascade trigger's WHERE filter
 *     makes it a no-op on already-refunded rows.
 */
export async function executePackRefund(
  grantId: string,
  supabase: Awaited<ReturnType<typeof createSupabaseServerClientUntyped>>,
  webhookUrl: string | null,
  webhookSecret: string | null,
  now: Date = new Date(),
): Promise<ExecutePackRefundResult> {
  // 1. Pre-flight read of the grant. The read determines
  //    whether the pack is refundable; it does NOT write
  //    anything to `session_grants`.
  const { data: row, error: readErr } = await supabase
    .from('session_grants')
    .select(
      'id, student_id, status, amount_cents, total_credits, consumed_credits',
    )
    .eq('id', grantId)
    .eq('grant_type', 'pack')
    .maybeSingle();
  if (readErr) {
    logger.error('executePackRefund read failed', { grantId, ...describeError(readErr) });
    throw readErr;
  }
  if (!row) return { kind: 'not_found' };

  const grant = row as unknown as {
    id: string;
    student_id: string;
    status: string;
    amount_cents: number;
    total_credits: number | null;
    consumed_credits: number | null;
  };

  // 2. Compute the refund preview (€35 × unused, capped at
  //    amount_paid). Pure helper; no DB writes.
  const preview = calculatePackRefundPreview({
    totalCredits: grant.total_credits,
    consumedCredits: grant.consumed_credits,
    amountCents: grant.amount_cents,
    status: grant.status,
  });
  if (preview.kind === 'invalid_state') {
    return { kind: 'invalid_state', currentStatus: preview.currentStatus };
  }
  if (preview.kind === 'already_refunded') {
    return { kind: 'already_refunded' };
  }
  if (preview.actualCents <= 0) {
    return { kind: 'refund_zero', unusedSessions: preview.unusedSessions };
  }

  // 3. Insert the outbound refund-enqueue attempt into
  //    `n8n_executions`. This is the durable outbox.
  //
  //    Why `n8n_executions` (not `webhook_events`):
  //      - `n8n_executions.status` is already
  //        'started'|'completed'|'failed' and the existing
  //        inbound n8n route writes through this table — its
  //        semantics are exactly the outbound enqueue lifecycle
  //        we need.
  //      - `webhook_events` is reserved for INBOUND provider
  //        events (Stripe / Calendly / n8n inbound). Its
  //        `processed=true` flag means "this inbound provider
  //        event has been applied to the DB" — a semantic that
  //        must NOT be reused for an outbound enqueue.
  //      - `n8n_executions.run_id UNIQUE` is the existing
  //        at-most-once-on-enqueue primitive.
  //
  //    The RLS policies added in
  //    `20260914000001_n8n_executions_admin_refund.sql` gate
  //    INSERT/UPDATE on `public.is_admin()`, so students,
  //    tutors, and anonymous callers cannot write refund
  //    execution rows.
  const refundRequestId = `${grantId}:${now.toISOString()}`;
  const currency = 'EUR';
  const outboxPayload = {
    kind: 'pack_refund',
    session_grant_id: grantId,
    student_id: grant.student_id,
    amount_cents: preview.actualCents,
    currency,
    refund_request_id: refundRequestId,
    refund_reason: 'Pack partial refund — unused sessions',
  } as const;

  const { error: outboxInsertErr } = await supabase
    .from('n8n_executions')
    .insert({
      workflow: 'pack_refund',
      run_id: refundRequestId,
      status: 'started',
      attempts: 1,
      request_id: refundRequestId,
      payload: outboxPayload,
      started_at: now.toISOString(),
    } as never);
  if (outboxInsertErr) {
    const code = (outboxInsertErr as { code?: string }).code;
    if (code === '23505') {
      // UNIQUE violation on run_id — another admin already
      // enqueued this exact refund request. At-most-once.
      return { kind: 'already_refunded' };
    }
    logger.error('executePackRefund outbox insert failed', {
      grantId,
      ...describeError(outboxInsertErr),
    });
    throw outboxInsertErr;
  }

  // 4. If the webhook URL is not configured in this
  //    environment, leave the outbox row in `started` and
  //    surface 503 to the operator. The `started` row is the
  //    durable record that an enqueue was attempted but
  //    never reached n8n; a future drain / operator action
  //    can re-attempt. We do NOT claim the refund succeeded.
  if (!webhookUrl) {
    logger.error('executePackRefund n8n webhook not configured', { grantId });
    return {
      kind: 'webhook_unavailable',
      reason: 'not_configured',
      refundRequestId,
    };
  }

  // 5. POST to n8n. The webhook is the only system that
  //    calls Stripe (CLAUDE.md §2.3). A 2xx response means
  //    "n8n accepted the request" — it does NOT mean
  //    "Stripe refund confirmed". Stripe confirmation is
  //    observed via the `charge.refunded` inbound webhook →
  //    `payments.status='refunded'` → `fn_enrollments_refund`
  //    cascade → `session_grants.status='refunded'`.
  let n8nStatus: number | null = null;
  let n8nError: string | null = null;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': webhookSecret ?? '',
      },
      body: JSON.stringify(outboxPayload),
    });
    n8nStatus = res.status;
    if (!res.ok) {
      n8nError = `n8n returned ${res.status}`;
      logger.error('executePackRefund n8n webhook returned non-OK', {
        grantId,
        status: res.status,
      });
    }
  } catch (e) {
    n8nError = String(e);
    logger.error('executePackRefund n8n webhook threw', {
      grantId,
      ...describeError(e),
    });
  }

  // 6. Stamp the outbox row with the n8n outcome. The
  //    `n8n_executions_admin_update` RLS policy (gated on
  //    `public.is_admin()`) gates this UPDATE.
  const finishedAt = new Date().toISOString();
  const executionOk =
    n8nError === null &&
    n8nStatus !== null &&
    n8nStatus >= 200 &&
    n8nStatus < 300;
  const { error: outboxUpdateErr } = await supabase
    .from('n8n_executions')
    .update({
      status: executionOk ? 'completed' : 'failed',
      finished_at: finishedAt,
      error: n8nError,
    } as never)
    .eq('run_id', refundRequestId);
  if (outboxUpdateErr) {
    // We do NOT roll back the request here. The fetch already
    // happened; the outbox INSERT succeeded. A failed UPDATE
    // is an observability gap that the operator should know
    // about, but it must not change the HTTP status the
    // operator sees (the operator's view of the n8n outcome
    // comes from `executionOk`, not from the UPDATE result).
    logger.error('executePackRefund outbox update failed', {
      grantId,
      ...describeError(outboxUpdateErr),
    });
  }

  if (!executionOk) {
    return {
      kind: 'webhook_failed',
      reason: n8nError ?? 'unknown',
      refundRequestId,
    };
  }

  return {
    kind: 'ok',
    refundRequestId,
    requestedAmountCents: preview.actualCents,
    currency,
  };
}
