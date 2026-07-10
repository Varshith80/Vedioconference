import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized } from '@/lib/utils/errors';
import { publicEnv } from '@/lib/env';

/**
 * POST /api/enrollments — create a Stripe Checkout Session for
 * a course enrollment. Sprint B2 replaces the per-booking flow
 * with a course-level payment: a single Stripe charge covers
 * the entire course; the resulting `enrollments` row then allows
 * the student to book individual modules.
 */
const bodySchema = z.object({
  course_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Unauthorized('You must be signed in to enroll.');

  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
  }

  // Read the course and ensure it's enrollable.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, slug, title, is_published, price_cents')
    .eq('id', parsed.data.course_id)
    .single();
  const courseRow = course as unknown as { id: string; slug: string; title: string; is_published: boolean; price_cents: number } | null;
  if (courseError || !courseRow) {
    throw new ApiError(404, 'course_not_found', 'Course not found.');
  }
  if (!courseRow.is_published) {
    throw new ApiError(409, 'course_unavailable', 'This course is not currently available for enrollment.');
  }

  // Insert a pending enrollment row. The `student_id` is taken
  // from the authenticated user (RLS will reject any mismatch).
  // Sprint C fix: the `enrollment_status` enum value is
  // `pending_payment`, not `pending` (B2 used the legacy name).
  const { data: enrollment, error: insertError } = await supabase
    .from('enrollments')
    .insert({
      student_id: user.id,
      course_id: courseRow.id,
      status: 'pending_payment',
    } as never)
    .select('id')
    .single();
  const enrollmentRow = enrollment as unknown as { id: string } | null;
  if (insertError || !enrollmentRow) {
    throw new ApiError(500, 'enrollment_create_failed', 'Could not create enrollment.', { reason: insertError?.message });
  }

  // Stripe Checkout is normally kicked off from n8n (the locked
  // architecture has n8n as the only system that calls Stripe on
  // the booking path). For Phase 2 enrollment, the Next.js app
  // delegates to n8n via a signed webhook, which creates the
  // Checkout Session and writes it back via the n8n webhook.
  // We return the new enrollment id and let the client redirect
  // to a /checkout page that pings the n8n flow.
  const env = publicEnv();
  const checkoutUrl = `${env.NEXT_PUBLIC_SITE_URL}/checkout/enrollment/${enrollmentRow.id}`;

  return jsonResponse(
    {
      ok: true as const,
      data: {
        enrollment_id: enrollmentRow.id,
        checkout_url: checkoutUrl,
      },
    },
    { status: 201 },
  );
}
