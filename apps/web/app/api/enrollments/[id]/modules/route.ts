import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound, Unauthorized } from '@/lib/utils/errors';
import { isModuleUnlocked } from '@/services/bookings/module-unlock';

/**
 * POST /api/enrollments/[id]/modules — book a specific module of
 * an enrolled course. Sprint C: payment is course-level (one
 * Stripe charge per enrollment); modules are booked individually
 * via Calendly. The route creates a `module_bookings` row and
 * returns the booking id. The Calendly invite is delegated to
 * n8n (see the `module-booking-to-zoom` workflow in
 * `n8n/workflows/`).
 *
 * The DB trigger `trg_module_unlock` (added in Sprint C) is the
 * source of truth for the unlock rule. We also call the
 * defensive `isModuleUnlocked` helper before the insert so the
 * client gets a friendlier `409 module_locked` response without
 * a DB round-trip.
 */
const bodySchema = z.object({
  module_id: z.string().uuid(),
  scheduled_start: z.string().datetime({ offset: true }),
  duration_min: z.number().int().min(15).max(240).optional(),
  calendly_event_uri:    z.string().url().optional(),
  calendly_invitee_uri:  z.string().url().optional(),
  notes:                 z.string().max(2000).optional(),
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
  // Sprint C fix: the B2 status literal `'pending'` is not in the
  // `enrollment_status` enum. The two valid values for booking are
  // `pending_payment` (booking before Stripe completes — we
  // allow it so the Calendly invitee.created handler can race
  // the webhook) and `active` (the post-payment steady state).
  if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'pending_payment') {
    throw new ApiError(409, 'enrollment_inactive', `Cannot book modules on an enrollment with status "${enrollmentRow.status}".`);
  }

  // Verify the module belongs to the course and is published.
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, is_published, duration_min, position, is_preview')
    .eq('id', parsed.data.module_id)
    .single();
  const moduleRow = module as unknown as { id: string; course_id: string; is_published: boolean; duration_min: number; position: number; is_preview: boolean } | null;
  if (moduleError || !moduleRow) {
    throw NotFound('Module not found.');
  }
  if (moduleRow.course_id !== enrollmentRow.course_id) {
    throw new ApiError(409, 'module_course_mismatch', 'The module does not belong to the enrolled course.');
  }
  if (!moduleRow.is_published) {
    throw new ApiError(409, 'module_unpublished', 'This module is not yet available.');
  }

  // Defensive unlock check (the DB trigger is the source of truth).
  const unlock = await isModuleUnlocked({
    enrollmentId: enrollmentRow.id,
    moduleId:     moduleRow.id,
  });
  if (!unlock.unlocked) {
    throw new ApiError(409, 'module_locked', 'This module is locked until the preceding module is completed.', {
      reason:    unlock.reason,
      blocking:  unlock.blockingModuleIds,
    });
  }

  // Resolve a tutor for the booking. The DB column `tutor_id`
  // is NOT NULL on `module_bookings`; the booking must belong
  // to a tutor. Pick the primary tutor of the course; if
  // none, 409.
  const { data: courseTutor, error: courseTutorError } = await supabase
    .from('course_tutors')
    .select('tutor_id')
    .eq('course_id', enrollmentRow.course_id)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  const courseTutorRow = courseTutor as unknown as { tutor_id: string } | null;
  if (courseTutorError || !courseTutorRow) {
    throw new ApiError(409, 'no_tutor_assigned', 'No primary tutor is assigned to this course yet.');
  }

  // Compute scheduled_end from duration_min. `module_bookings` does
  // NOT have a `duration_min` column — `scheduled_end` is the
  // authoritative end-of-session timestamp. (Sprint C fix; the
  // B2 route wrote `duration_min` to a non-existent column.)
  const start = new Date(parsed.data.scheduled_start);
  const durationMin = parsed.data.duration_min ?? moduleRow.duration_min;
  const end = new Date(start.getTime() + durationMin * 60_000);

  const { data: booking, error: insertError } = await supabase
    .from('module_bookings')
    .insert({
      enrollment_id:        enrollmentRow.id,
      student_id:           enrollmentRow.student_id,
      tutor_id:             courseTutorRow.tutor_id,
      module_id:            moduleRow.id,
      scheduled_start:      start.toISOString(),
      scheduled_end:        end.toISOString(),
      timezone:             'Europe/Paris',
      calendly_event_uri:   parsed.data.calendly_event_uri ?? null,
      calendly_invitee_uri: parsed.data.calendly_invitee_uri ?? null,
      notes:                parsed.data.notes ?? null,
      status:               'scheduled',
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
