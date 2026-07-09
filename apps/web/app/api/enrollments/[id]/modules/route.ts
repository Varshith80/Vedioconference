import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound, Unauthorized } from '@/lib/utils/errors';

/**
 * POST /api/enrollments/[id]/modules — book a specific module of
 * an enrolled course. Sprint B2: payment is course-level (one
 * Stripe charge per enrollment); modules are booked individually
 * via Calendly. The route creates a `module_bookings` row and
 * returns the booking id. The Calendly invite is delegated to
 * n8n (see the `booking_module` workflow in `n8n/workflows/`).
 */
const bodySchema = z.object({
  module_id: z.string().uuid(),
  scheduled_start: z.string().datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(240).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: enrollmentId } = await params;

  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Unauthorized('You must be signed in to book a module.');

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
  }

  // Verify the enrollment exists and belongs to this user.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, student_id, course_id, status')
    .eq('id', enrollmentId)
    .single();
  const enrollmentRow = enrollment as unknown as { id: string; student_id: string; course_id: string; status: string } | null;
  if (enrollmentError || !enrollmentRow) {
    throw NotFound('Enrollment not found.');
  }
  if (enrollmentRow.student_id !== user.id) {
    throw new ApiError(403, 'not_owner', 'This enrollment does not belong to you.');
  }
  if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'pending') {
    throw new ApiError(409, 'enrollment_inactive', `Cannot book modules on an enrollment with status "${enrollmentRow.status}".`);
  }

  // Verify the module belongs to the course.
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, is_published, duration_min')
    .eq('id', parsed.data.module_id)
    .single();
  const moduleRow = module as unknown as { id: string; course_id: string; is_published: boolean; duration_min: number } | null;
  if (moduleError || !moduleRow) {
    throw NotFound('Module not found.');
  }
  if (moduleRow.course_id !== enrollmentRow.course_id) {
    throw new ApiError(409, 'module_course_mismatch', 'The module does not belong to the enrolled course.');
  }
  if (!moduleRow.is_published) {
    throw new ApiError(409, 'module_unpublished', 'This module is not yet available.');
  }

  const { data: booking, error: insertError } = await supabase
    .from('module_bookings')
    .insert({
      enrollment_id: enrollmentRow.id,
      student_id: enrollmentRow.student_id,
      module_id: moduleRow.id,
      scheduled_start: parsed.data.scheduled_start,
      duration_min: parsed.data.duration_min ?? moduleRow.duration_min,
      status: 'scheduled',
    } as never)
    .select('id')
    .single();
  const bookingRow = booking as unknown as { id: string } | null;
  if (insertError || !bookingRow) {
    throw new ApiError(500, 'booking_create_failed', 'Could not create module booking.', { reason: insertError?.message });
  }

  return jsonResponse(
    { ok: true as const, data: { booking_id: bookingRow.id } },
    { status: 201 },
  );
}
