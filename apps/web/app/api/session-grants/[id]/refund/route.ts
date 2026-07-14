import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/session-grants/[id]/refund — admin-only refund
 * of a v2 `session_grant`. Mirrors the v1
 * `POST /api/enrollments/[id]/refund` route.
 *
 * The Stripe `refunds.create` call is delegated to n8n (see
 * `n8n/docs/WORKFLOWS.md`); this route just records the
 * intent and asks n8n to perform the refund. The actual
 * `payments` row update + the linked `session_grants` row
 * flip to `refunded` is done by:
 *   1. The `charge.refunded` Stripe webhook (updates `payments`).
 *   2. The `fn_enrollments_refund` DB trigger (cascades
 *      the flip from `payments` → `session_grants` via
 *      the new `session_grant_id` FK — widened in
 *      `20260714000003_session_bookings_meeting_links_payments.sql`).
 */
const bodySchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: sessionGrantId } = await params;
    // requireAdminRoute() is the shared admin guard (Sprint 3.6
    // §4.1). It throws Unauthorized()/Forbidden() for failures.
    const { user } = await requireAdminRoute();
    const supabase = createSupabaseAdminClient();

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const { data: grant, error: grantError } = await supabase
      .from('session_grants')
      .select('id, status, amount_cents, currency, stripe_payment_intent_id')
      .eq('id', sessionGrantId)
      .single();
    const grantRow = grant as unknown as {
      id: string;
      status: string;
      amount_cents: number;
      currency: string;
      stripe_payment_intent_id: string | null;
    } | null;
    if (grantError || !grantRow) {
      throw NotFound('Session grant not found.');
    }
    if (grantRow.status !== 'active' && grantRow.status !== 'completed') {
      throw new ApiError(
        409,
        'grant_not_refundable',
        `Cannot refund a session grant with status "${grantRow.status}".`,
      );
    }
    if (!grantRow.stripe_payment_intent_id) {
      throw new ApiError(
        409,
        'no_payment_intent',
        'This session grant has no Stripe payment intent to refund.',
      );
    }

    // Delegate the Stripe call to n8n.
    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new ApiError(503, 'refund_unavailable', 'Refunds are not yet configured for this environment.');
    }

    const response = await fetch(`${webhookUrl}/refund`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify({
        session_grant_id: grantRow.id,
        stripe_payment_intent_id: grantRow.stripe_payment_intent_id,
        amount_cents: grantRow.amount_cents,
        reason: parsed.data.reason ?? null,
        admin_id: user.id,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      logger.error('n8n session_grant_refund webhook failed', {
        status: response.status,
        body: text.slice(0, 500),
        session_grant_id: sessionGrantId,
      });
      throw new ApiError(502, 'refund_provider_error', 'Could not initiate the refund at this time.');
    }

    logger.info('session_grant.refund.requested', {
      session_grant_id: sessionGrantId,
      reason: parsed.data.reason,
      admin_id: user.id,
    });

    return jsonResponse({
      ok: true as const,
      data: {
        session_grant_id: sessionGrantId,
        status: 'refund_pending',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
