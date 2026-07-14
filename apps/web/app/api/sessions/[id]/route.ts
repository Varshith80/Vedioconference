import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, NotFound, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';

// =====================================================================
// Sprint 3.6 §4.5 — PATCH /api/sessions/[id] (admin edit).
//
// The single-session create is POST /api/sessions. This
// route is the edit counterpart. All fields are optional
// (PATCH semantics); the handler only writes the ones the
// caller sent.
//
// `price_cents` is special: the field is nullable. The
// schema accepts `null` (explicit price TBD), a non-negative
// integer (set/update price), or omits the key (leave the
// existing price alone). The handler does not auto-coerce
// null to undefined — the caller decides which.
// =====================================================================

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  duration_min: z.number().int().positive().nullable().optional(),
  price_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  calendly_event_uri: z.string().url().nullable().optional(),
  is_published: z.boolean().optional(),
  is_preview: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await requireAdminRoute();
    const { id } = await params;

    const raw = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      throw BadRequest('At least one field must be provided.');
    }

    const { data, error } = await supabase
      .from('sessions')
      .update(updates as never)
      .eq('id', id)
      .select('id, slug, title, price_cents, is_published, is_preview')
      .single();
    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        throw NotFound(`Session not found: ${id}`);
      }
      logger.error('Failed to update session', { error: error.message, id, updates });
      throw new ApiError(500, 'session_update_failed', 'Could not update session.', {
        reason: error.message,
      });
    }

    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}
