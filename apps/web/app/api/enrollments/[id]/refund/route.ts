import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/enrollments/[id]/refund — admin-only refund of a
 * course enrollment. Sprint C: refunds are course-level, not
 * per-module. The Stripe `refunds.create` call is delegated to
 * n8n (see the `module-cancellation` + n8n `enrollment_refund`
 * path in `n8n/docs/WORKFLOWS.md`); this route just records the
 * intent and asks n8n to perform the refund.
 *
 * The actual `payments` row update + the linked `enrollments`
 * row flip to `refunded` is done by:
 *   1. The `charge.refunded` Stripe webhook (updates `payments`).
 *   2. The `fn_enrollments_refund` DB trigger (cascades the
 *      flip from `payments` → `enrollments`).
 *
 * The route uses the admin client (service-role). The RLS
 * policy on `enrollments` is `is_admin()` for UPDATE; only
 * the service-role client can bypass that, and the layer rule
 * (see CLAUDE.md §2.3) restricts `createSupabaseAdminClient`
 * to webhooks + this admin route.
 */
const bodySchema = z.object({
  reason: z.string().min(3).max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: enrollmentId } = await params;
    // requireAdminRoute() is the shared admin guard (Sprint 3.6
    // §4.1). It throws Unauthorized()/Forbidden() for failures.
    const { user } = await requireAdminRoute();
    const supabase = createSupabaseAdminClient();

    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id, status, amount_cents, currency, stripe_payment_intent_id')
      .eq('id', enrollmentId)
      .single();
    const enrollmentRow = enrollment as unknown as { id: string; status: string; amount_cents: number; currency: string; stripe_payment_intent_id: string | null } | null;
    if (enrollmentError || !enrollmentRow) {
      throw NotFound('Enrollment not found.');
    }
    if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'completed') {
      throw new ApiError(409, 'enrollment_not_refundable', `Cannot refund an enrollment with status "${enrollmentRow.status}".`);
    }
    if (!enrollmentRow.stripe_payment_intent_id) {
      throw new ApiError(409, 'no_payment_intent', 'This enrollment has no Stripe payment intent to refund.');
    }

    // Delegate the Stripe call to n8n. The actual `payments` +
    // `enrollments` flips are done by the `charge.refunded`
    // webhook + the DB trigger. The route returns immediately
    // with a `pending` status; the client polls the enrollment
    // row to see when `status` flips to `refunded`.
    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new ApiError(503, 'refund_unavailable', 'Refunds are not yet configured for this environment.');
    }

    const response = await fetch(`${webhookUrl}/refund`, {
      method: 'POST',
      headers: {
        'content-type':     'application/json',
        'x-webhook-secret': env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify({
        enrollment_id:               enrollmentRow.id,
        stripe_payment_intent_id:   enrollmentRow.stripe_payment_intent_id,
        amount_cents:               enrollmentRow.amount_cents,
        reason:                     parsed.data.reason ?? null,
        admin_id:                   user.id,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      logger.error('n8n enrollment_refund webhook failed', {
        status: response.status,
        body:   text.slice(0, 500),
        enrollment_id: enrollmentId,
      });
      throw new ApiError(502, 'refund_provider_error', 'Could not initiate the refund at this time.');
    }

    logger.info('enrollment.refund.requested', { enrollment_id: enrollmentId, reason: parsed.data.reason, admin_id: user.id });

    return jsonResponse({
      ok: true as const,
      data: {
        enrollment_id: enrollmentId,
        status:        'refund_pending',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
