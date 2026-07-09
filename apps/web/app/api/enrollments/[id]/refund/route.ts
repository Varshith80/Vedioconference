import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { jsonResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/enrollments/[id]/refund — admin-only refund of a
 * course enrollment. Sprint B2: refunds are course-level, not
 * per-module. The Stripe refund is delegated to n8n (see the
 * `enrollment_refund` workflow in `n8n/workflows/`); this route
 * just updates the local enrollment + payment rows and emits the
 * n8n call.
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
  const { id: enrollmentId } = await params;
  const supabase = createSupabaseAdminClient();

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
  }

  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, status, payment_id, amount_cents, currency')
    .eq('id', enrollmentId)
    .single();
  const enrollmentRow = enrollment as unknown as { id: string; status: string; payment_id: string | null; amount_cents: number; currency: string } | null;
  if (enrollmentError || !enrollmentRow) {
    throw NotFound('Enrollment not found.');
  }
  if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'completed') {
    throw new ApiError(409, 'enrollment_not_refundable', `Cannot refund an enrollment with status "${enrollmentRow.status}".`);
  }

  // Mark the enrollment as refunded. The trigger
  // `fn_enrollments_completion` keeps `module_progress` in sync
  // (does NOT cascade-cancel scheduled module_bookings — admins
  // cancel those one by one via /api/module-bookings/[id]/cancel).
  const { error: updateError } = await supabase
    .from('enrollments')
    .update({ status: 'refunded' } as never)
    .eq('id', enrollmentId);
  if (updateError) {
    throw new ApiError(500, 'enrollment_update_failed', 'Could not update enrollment.', { reason: updateError.message });
  }

  logger.info('enrollment.refund.marked', { enrollment_id: enrollmentId, reason: parsed.data.reason });

  return jsonResponse({ ok: true as const, data: { enrollment_id: enrollmentId, status: 'refunded' } });
}
