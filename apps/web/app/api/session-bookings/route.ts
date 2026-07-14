import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized, NotFound } from '@/lib/utils/errors';
import { createSessionBooking } from '@/services/curriculum/session-bookings';
import { publicEnv } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/session-bookings — book a specific session.
 *
 * Architecture (Sprint 3.5)
 * -------------------------
 * The **session** is now the unit of booking (not the
 * module). A student who has paid for a session can book a
 * live slot for that session; the row is the new equivalent
 * of the v1 `module_bookings`.
 *
 * The Calendly embed (on the dashboard's session detail
 * page) is the source of truth for the chosen slot. The
 * Calendly webhook hits this route with the
 * `calendly_invitee_uri` and the parsed `scheduled_start` /
 * `scheduled_end`.
 *
 * n8n remains the only system that creates Zoom meetings
 * (CLAUDE.md §2.3). This route is read/write against the
 * `session_bookings` table; the n8n workflow
 * (Sprint 3.6 §6.4 renamed the workflow field from
 * `module_booking_id` to `session_booking_id`) fires on
 * the new id.
 */
const bodySchema = z.object({
  session_id: z.string().uuid(),
  session_grant_id: z.string().uuid(),
  scheduled_start: z.string(),
  scheduled_end: z.string(),
  calendly_invitee_uri: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to book a session.');

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Resolve the tutor for the session. The booking always
    // carries a tutor_id (denormalised for the new flow). For
    // Sprint 3.5 the first tutor linked to the parent course
    // is used; the Phase 4 tutor-picker UI will let the
    // student pick one explicitly.
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .select('id, chapter:chapters(course_id)')
      .eq('id', parsed.data.session_id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) throw NotFound('Session not found.');
    const sessRow = session as unknown as { chapter: { course_id: string } | null };

    const { data: ct, error: ctErr } = await supabase
      .from('course_tutors')
      .select('tutor_id')
      .eq('course_id', sessRow.chapter?.course_id ?? '')
      .limit(1)
      .maybeSingle();
    if (ctErr) throw ctErr;
    const tutorId = (ct as unknown as { tutor_id: string } | null)?.tutor_id;
    if (!tutorId) {
      throw new ApiError(409, 'no_tutor_for_course', 'No tutor is currently assigned to this course.');
    }

    // Create the session booking row. This is the source of
    // truth for the new booking flow.
    const result = await createSessionBooking({
      studentId: user.id,
      sessionId: parsed.data.session_id,
      sessionGrantId: parsed.data.session_grant_id,
      scheduledStart: parsed.data.scheduled_start,
      scheduledEnd: parsed.data.scheduled_end,
      calendlyInviteeUri: parsed.data.calendly_invitee_uri,
      tutorId,
    });

    if (result.kind === 'session_not_found') throw NotFound('Session not found.');
    if (result.kind === 'grant_not_active') {
      throw new ApiError(409, 'grant_inactive', 'Your session grant is not active. Please complete payment first.');
    }
    if (result.kind === 'session_not_in_grant') {
      throw new ApiError(409, 'session_grant_mismatch', 'This session does not match your grant.');
    }

    // Mock-gated n8n post: if the public n8n booking webhook
    // is configured, the route POSTs the new booking to it so
    // n8n can create the Zoom meeting as a side effect. When
    // the env var is unset (the default for local dev) we
    // skip the post — the row already exists and the
    // dashboard has something to render. The Zoom URL stays
    // NULL until n8n is wired.
    const env = publicEnv();
    if (env.NEXT_PUBLIC_N8N_BOOKING_WEBHOOK) {
      try {
        await fetch(env.NEXT_PUBLIC_N8N_BOOKING_WEBHOOK, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            session_booking_id: result.booking.id,
            student_id: result.booking.student_id,
            session_id: result.booking.session_id,
            session_grant_id: result.booking.session_grant_id,
            tutor_id: result.booking.tutor_id,
            scheduled_start: result.booking.scheduled_start,
            scheduled_end: result.booking.scheduled_end,
            kind: 'session',
          }),
        });
      } catch (e) {
        // Non-fatal: the row is created; the Zoom meeting
        // can be retried by a separate admin tool.
        logger.error('n8n booking webhook (post-create) failed', {
          session_booking_id: result.booking.id,
          error: (e as Error).message,
        });
      }
    }

    return jsonResponse(
      {
        ok: true as const,
        data: {
          session_booking_id: result.booking.id,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
