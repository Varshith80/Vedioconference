import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import {
  ApiError,
  Unauthorized,
  describeError,
  normaliseError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { createTutorChangeRequestSchema } from '@/lib/validations/tutor-change';
import {
  createRequest,
  getMyRequests,
} from '@/services/student/tutor-change';
import type { TutorChangeCooldownActiveError } from '@/services/student/tutor-change-cooldown';

// =====================================================================
// Sprint 6 — Student tutor-change-request API surface.
//
// POST /api/student/tutor-change-requests
//   Body: { session_booking_id: uuid; student_reason?: string }
//   Auth: signed-in student (REQUIRED).
//   Returns: { ok: true, data: TutorChangeRequest }
//
// GET  /api/student/tutor-change-requests
//   Auth: signed-in student.
//   Returns: { ok: true, data: TutorChangeRequest[] } (own only)
//
// We pick the right Supabase client inside the service layer
// (student SSR client for SELECTs; admin client only for the
// re-point write on selection — see selectAlternative in
// services/student/tutor-change.ts). The route is intentionally
// thin: auth + Zod + service call + response.
// =====================================================================

export async function GET() {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');
    const data = await getMyRequests();
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('Sign in required.');

    const body = await req.json().catch(() => null);
    const input = createTutorChangeRequestSchema.parse(body);
    const created = await createRequest(input);
    return jsonResponse({ ok: true as const, data: created }, { status: 201 });
  } catch (e) {
    // Sprint 6.5 — translate the cooldown gate's discriminated
    // error into the 409 envelope. `assertNoCooldown` throws an
    // error with `code === 'tutor_change_cooldown_active'` and a
    // `details` payload carrying `next_eligible_at`, `remaining_ms`,
    // and `last_changed_at`. The BEFORE INSERT trigger raises
    // SQLSTATE P0001 with message `tutor_change_cooldown_active:
    // <remaining_ms>`; we catch that here too as a belt-and-braces
    // backstop in case the service-layer gate is ever bypassed.
    if (isCooldownError(e)) {
      return errorResponse(
        new ApiError(
          409,
          'tutor_change_cooldown_active',
          'You can request another tutor change after the cooldown period.',
          e.details,
        ),
      );
    }
    if (isCooldownTriggerError(e)) {
      return errorResponse(
        new ApiError(
          409,
          'tutor_change_cooldown_active',
          'You can request another tutor change after the cooldown period.',
          parseTriggerCooldownDetails(e),
        ),
      );
    }
    return errorResponse(e);
  }
}

function isCooldownError(e: unknown): e is TutorChangeCooldownActiveError {
  return (
    typeof e === 'object' &&
    e !== null &&
    (e as { code?: string }).code === 'tutor_change_cooldown_active' &&
    typeof (e as { details?: unknown }).details === 'object' &&
    (e as { details?: unknown }).details !== null
  );
}

function isCooldownTriggerError(e: unknown): boolean {
  // Supabase / PostgREST surfaces the SQLSTATE `P0001` either
  // as `e.code === 'P0001'` (typed insert error) or inside the
  // canonical message text. We normalise first, then match.
  const norm = normaliseError(e);
  if (norm.code === 'P0001') {
    return /tutor_change_cooldown_active/.test(norm.message);
  }
  return (
    /tutor_change_cooldown_active/.test(norm.message) &&
    /P0001/.test(norm.message)
  );
}

function parseTriggerCooldownDetails(e: unknown): {
  next_eligible_at: string;
  remaining_ms: number;
  last_changed_at: string | null;
} {
  const norm = normaliseError(e);
  const match = norm.message.match(/tutor_change_cooldown_active:(\d+)/);
  const remainingMs = match && match[1] ? Number.parseInt(match[1], 10) : 0;
  const nextEligibleAt = new Date(Date.now() + remainingMs).toISOString();
  logger.warn('cooldown triggered by SQL trigger (service gate bypassed)', {
    remainingMs,
    raw: describeError(e),
  });
  return {
    next_eligible_at: nextEligibleAt,
    remaining_ms: remainingMs,
    last_changed_at: null,
  };
}
