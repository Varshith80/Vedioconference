import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { executePackRefund, getPackGrantById } from '@/services/admin/pack-grants';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Phase 1 — Feature B + TASK 2.1 (financial-consistency repair):
// POST /api/admin/pack-grants/[id]/refund.
//
// Admin-only. Initiates the Pack refund:
//   1. Pre-flight read of the pack grant (no flip).
//   2. Compute the refund preview (€35 × unused sessions,
//      capped at amount_paid).
//   3. The service records the outbound enqueue attempt in
//      `n8n_executions` (run_id = refund_request_id, UNIQUE
//      = at-most-once primitive). Two admins racing produce
//      exactly one outbox row; the second receives
//      `kind: 'already_refunded'`.
//   4. POST to n8n. The service stamps `n8n_executions.status`
//      as `completed` (n8n 2xx) or `failed` (5xx / throw).
//   5. The route returns:
//      - 200 with refund_status='n8n_accepted' on n8n 2xx.
//        The body does NOT claim Stripe confirmation; the
//        Stripe confirmation arrives via the
//        `charge.refunded` webhook + cascade.
//      - 502 on n8n 5xx / throw (outbox status='failed',
//        row is the durable record for a future retry).
//      - 503 when `N8N_ENROLLMENT_WEBHOOK_URL` is unset
//        (outbox status stays 'started').
//   6. The Stripe inbound webhook → `payments.status='refunded'`
//      → `fn_enrollments_refund` cascade remains the SOLE
//      authoritative path that flips `session_grants.status`
//      to 'refunded' and writes `refunded_amount_cents`
//      (= `charge.amount_refunded`).
//
// HTTP shape:
//   200 → { ok, data: { refund_request_id, requested_amount_cents,
//                       currency, refund_status: 'n8n_accepted',
//                       grant } }
//   404 → no such pack grant
//   409 → invalid state (cancelled / no_show / rescheduled)
//   409 → already refunded (also fires on 23505 / 23514 race)
//   422 → refund amount is zero (all sessions consumed)
//   502 → pack_refund_webhook_failed (n8n 5xx / throw;
//          outbox row is 'failed'; operator may retry)
//   503 → pack_refund_webhook_unavailable
//          (N8N_ENROLLMENT_WEBHOOK_URL unset;
//          outbox row is 'started'; operator must
//          configure webhook or drain manually)
// =====================================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;
    if (!id) throw NotFound('Pack grant id is required.');

    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL ?? null;
    const webhookSecret = env.N8N_WEBHOOK_SECRET ?? null;

    const result = await executePackRefund(
      id,
      supabase,
      webhookUrl,
      webhookSecret,
    );
    if (result.kind === 'not_found') {
      throw NotFound('Pack grant not found.');
    }
    if (result.kind === 'invalid_state') {
      throw new ApiError(
        409,
        'pack_refund_invalid_state',
        `Cannot refund a pack in status '${result.currentStatus}'.`,
        { status: result.currentStatus },
      );
    }
    if (result.kind === 'already_refunded') {
      throw new ApiError(
        409,
        'pack_refund_already_refunded',
        'This pack has already been refunded (or a refund request is already in flight).',
      );
    }
    if (result.kind === 'refund_zero') {
      throw new ApiError(
        422,
        'pack_refund_zero',
        'No unused sessions — refund amount is €0.',
        { unused_sessions: result.unusedSessions },
      );
    }
    if (result.kind === 'webhook_failed') {
      // The outbox row is `failed`. n8n did not accept the
      // request. The admin route did NOT flip session_grants;
      // the operator may retry by re-issuing the same refund
      // request (the UNIQUE on n8n_executions.run_id makes the
      // retry a no-op for an in-flight row, or a fresh attempt
      // for a failed row).
      throw new ApiError(
        502,
        'pack_refund_webhook_failed',
        'Refund request could not be enqueued to n8n. The pack row is NOT marked refunded; an operator must retry.',
        {
          refund_request_id: result.refundRequestId,
          reason: result.reason,
        },
      );
    }
    if (result.kind === 'webhook_unavailable') {
      // The outbox row is `started` (never reached n8n). The
      // admin route did NOT flip session_grants; the operator
      // must configure N8N_ENROLLMENT_WEBHOOK_URL or drain
      // manually.
      throw new ApiError(
        503,
        'pack_refund_webhook_unavailable',
        'Refund webhook is not configured. The pack row is NOT marked refunded; an operator must configure the webhook or drain manually.',
        {
          refund_request_id: result.refundRequestId,
          reason: result.reason,
        },
      );
    }
    // result.kind === 'ok'
    // The service returned `ok` because n8n accepted the
    // request (HTTP 2xx). The body reflects:
    //   - `refund_status: 'n8n_accepted'` — the n8n
    //     execution is `completed`. This does NOT mean
    //     Stripe confirmed the refund. Stripe confirmation
    //     is observed by the application as
    //     `payments.status='refunded'`, which arrives
    //     asynchronously via the Stripe inbound webhook.
    //   - `grant` — the current grant row (re-read). It
    //     may or may not yet be `status='refunded'`,
    //     depending on whether the Stripe webhook has
    //     fired. The admin UI can poll for the
    //     Stripe-confirmed state by reading
    //     `payments.status='refunded'` for the linked
    //     payment row.
    const grant = await getPackGrantById(id);
    return jsonResponse(
      {
        ok: true as const,
        data: {
          refund_request_id: result.refundRequestId,
          requested_amount_cents: result.requestedAmountCents,
          currency: result.currency,
          refund_status: 'n8n_accepted' as const,
          grant,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    logger.error('admin pack refund failed', { error: String(e) });
    return errorResponse(e);
  }
}
