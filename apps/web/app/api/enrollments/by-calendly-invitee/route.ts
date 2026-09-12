import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Conflict, NotFound, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/enrollments/by-calendly-invitee`.
//
// Booking-context resolver. Called by the v2
// `module-booking-to-zoom` n8n workflow after it receives
// the Calendly `invitee.created` webhook (forwarded by
// `app/api/webhooks/calendly/route.ts`). The workflow needs
// the full booking context (session_booking_id, student, tutor,
// session title, scheduled start, duration, etc.) to create
// the Zoom meeting and to render the confirmation email.
//
// Why this is its own route
// -------------------------
// Calendly's `invitee.created` payload only carries the
// `calendly_invitee_uri` and the `calendly_event_uri`. The
// rest of the context is in Supabase. n8n is the
// orchestrator but it does NOT carry a Supabase service-role
// key for booking reads; it has to ask Next.js. Centralising
// the resolution here means (a) the workflow is portable
// (no inline SQL / no Postgres credentials in the n8n env),
// (b) the resolution logic is testable in isolation, and
// (c) the response shape is locked.
//
// Authentication
// --------------
// `x-webhook-secret` must match `N8N_WEBHOOK_SECRET`. The
// secret is the same shared secret used by the other n8n
// webhooks.
//
// Privacy
// -------
// The route uses the service-role admin client because the
// caller is n8n, a trusted system, not a student. (This is
// the same trust model as `webhooks/stripe` and
// `webhooks/n8n`.) The route does NOT accept a
// student_id / tutor_id from the body — it only resolves
// by the Calendly invitee URI. The response includes the
// student and tutor identifiers that n8n needs to create
// the meeting; it does NOT include the student's email
// address (which the v1 placeholder included and which
// n8n does not need to create a meeting).
//
// Idempotency
// -----------
// The route is a read against the `session_bookings` table
// keyed on `calendly_invitee_uri` (UNIQUE). A replay returns
// the same row; the workflow's downstream Zoom create
// dedupes on `meeting_links.session_booking_id` (also
// UNIQUE), so the meeting is not created twice.
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  calendly_invitee_uri: z.string().url(),
  calendly_event_uri:   z.string().url().optional(),
});

interface BookingContext {
  session_booking_id: string;
  session_id:         string;
  session_grant_id:   string;
  student_id:         string;
  tutor_id:           string | null;
  session_title:      string;
  course_title:       string;
  student_name:       string;
  tutor_name:         string | null;
  scheduled_start:    string;
  scheduled_end:      string;
  timezone:           string;
  duration_min:       number;
  join_url:           string | null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ---- Auth: shared secret --------------------------------------
    const expected = serverEnv().N8N_WEBHOOK_SECRET;
    if (!expected) {
      logger.warn('by-calendly-invitee called but N8N_WEBHOOK_SECRET is unset');
      throw Unauthorized('Resolver is not configured.');
    }
    const provided = req.headers.get('x-webhook-secret');
    if (provided !== expected) {
      throw Unauthorized('Invalid resolver secret.');
    }

    // ---- Body validation ------------------------------------------
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid resolver payload.', parsed.error.flatten());
    }
    const { calendly_invitee_uri, calendly_event_uri } = parsed.data;

    // ---- Resolve the booking row ----------------------------------
    // The admin client bypasses RLS because the caller is n8n
    // (a trusted system, not a student). The query is keyed on
    // the UNIQUE `calendly_invitee_uri` column, so a replay
    // returns the same row.
    const admin = createSupabaseAdminClient();

    const { data: booking, error: bErr } = await admin
      .from('session_bookings')
      .select(`
        id,
        session_id,
        session_grant_id,
        student_id,
        tutor_id,
        scheduled_start,
        scheduled_end,
        timezone,
        calendly_event_uri,
        session:sessions!inner (
          id,
          title,
          duration_min,
          chapter:chapters!inner (
            id,
            title,
            course:courses!inner (
              id,
              title
            )
          )
        )
      `)
      .eq('calendly_invitee_uri', calendly_invitee_uri)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!booking) {
      // The Calendly invitee has not created a `session_bookings`
      // row yet. This is the normal case for a brand-new invitee
      // (the Calendly embed has not been wired to
      // `POST /api/session-bookings` yet). 404 is the right
      // answer — the workflow short-circuits.
      throw NotFound(
        'No session_bookings row matches this Calendly invitee. ' +
        'The booking must be created via POST /api/session-bookings first.',
      );
    }

    // Optional secondary check: if the workflow also supplied
    // `calendly_event_uri`, make sure the row's `calendly_event_uri`
    // matches. This is a defence-in-depth against a workflow
    // bug that resolves to the wrong event.
    if (calendly_event_uri) {
      const rowEventUri = (booking as unknown as { calendly_event_uri: string | null }).calendly_event_uri;
      if (rowEventUri && rowEventUri !== calendly_event_uri) {
        logger.warn('calendly event URI mismatch on resolver', {
          calendly_invitee_uri,
          supplied_event_uri: calendly_event_uri,
          row_event_uri: rowEventUri,
        });
        throw Conflict('Calendly event URI does not match the booking row.');
      }
    }

    // ---- Resolve the student + tutor display names ---------------
    const studentId = (booking as unknown as { student_id: string }).student_id;
    const tutorId   = (booking as unknown as { tutor_id:   string | null }).tutor_id;
    const sessionRaw = (booking as unknown as {
      session: {
        title: string;
        duration_min: number;
        chapter: {
          title: string;
          course: { title: string };
        };
      };
    }).session;

    const { data: studentProfile, error: spErr } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', studentId)
      .maybeSingle();
    if (spErr) throw spErr;

    let tutorName: string | null = null;
    if (tutorId) {
      // The `tutors` table does not carry `full_name`; the
      // name lives on the linked `profiles` row. The `tutors`
      // table has `profile_id` (per the v2 schema; see the
      // memory note about the v1 → v2 split).
      const { data: tutorRow, error: tErr } = await admin
        .from('tutors')
        .select('profile_id')
        .eq('id', tutorId)
        .maybeSingle();
      if (tErr) throw tErr;
      const profileId = (tutorRow as unknown as { profile_id: string } | null)?.profile_id;
      if (profileId) {
        const { data: tutorProfile, error: tpErr } = await admin
          .from('profiles')
          .select('full_name')
          .eq('id', profileId)
          .maybeSingle();
        if (tpErr) throw tpErr;
        tutorName = (tutorProfile as unknown as { full_name: string | null } | null)?.full_name ?? null;
      }
    }

    // ---- Look up the existing meeting_link (if any) --------------
    // The workflow uses `join_url` to render the confirmation
    // email. If the meeting has already been created, the URL
    // is here. If the URL is null, the workflow creates a new
    // meeting and the `meeting_created` case on the n8n
    // webhook will backfill the row.
    const { data: meeting, error: mErr } = await admin
      .from('meeting_links')
      .select('join_url')
      .eq('session_booking_id', (booking as unknown as { id: string }).id)
      .maybeSingle();
    if (mErr) throw mErr;

    // ---- Compose the response -------------------------------------
    const out: BookingContext = {
      session_booking_id: (booking as unknown as { id: string }).id,
      session_id:         (booking as unknown as { session_id: string }).session_id,
      session_grant_id:   (booking as unknown as { session_grant_id: string }).session_grant_id,
      student_id:         studentId,
      tutor_id:           tutorId,
      session_title:      sessionRaw.title,
      course_title:       sessionRaw.chapter.course.title,
      student_name:       (studentProfile as unknown as { full_name: string | null } | null)?.full_name ?? '',
      tutor_name:         tutorName,
      scheduled_start:    (booking as unknown as { scheduled_start: string }).scheduled_start,
      scheduled_end:      (booking as unknown as { scheduled_end:   string }).scheduled_end,
      timezone:           (booking as unknown as { timezone:        string }).timezone,
      duration_min:       sessionRaw.duration_min,
      join_url:           (meeting as unknown as { join_url: string | null } | null)?.join_url ?? null,
    };

    return NextResponse.json({ ok: true, data: out });
  } catch (e) {
    return errorResponse(e);
  }
}
