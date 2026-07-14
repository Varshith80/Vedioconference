import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/sessions — admin-only create. Used by Sprint 5
 * (Excel curriculum import) to bulk-insert sessions under a
 * chapter.
 *
 * Sprint 3.5 keeps the API surface narrow: one session per
 * request, all fields required, no upsert. The Excel import
 * is responsible for chunking + retries.
 *
 * The new session is created with `is_published = false` by
 * default (the admin must explicitly publish it after review).
 * `price_cents` is nullable: the Excel import supplies the
 * real price; an admin can leave it NULL for "price TBD".
 */
const bodySchema = z.object({
  chapter_id: z.string().uuid(),
  position: z.number().int().positive(),
  slug: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration_min: z.number().int().positive().nullable().optional(),
  price_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  calendly_event_uri: z.string().url().optional(),
  is_published: z.boolean().optional(),
  is_preview: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Admin-only (Sprint 3.6 §4.1). requireAdminRoute() is the
    // shared admin guard; it throws Unauthorized()/Forbidden()
    // for failures.
    const { supabase } = await requireAdminRoute();

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Confirm the chapter exists.
    const { data: chapter, error: cErr } = await supabase
      .from('chapters')
      .select('id, course_id')
      .eq('id', parsed.data.chapter_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!chapter) throw NotFound('Chapter not found.');

    const insertPayload = {
      chapter_id: parsed.data.chapter_id,
      position: parsed.data.position,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      duration_min: parsed.data.duration_min ?? null,
      price_cents: parsed.data.price_cents ?? null,
      currency: parsed.data.currency ?? 'EUR',
      calendly_event_uri: parsed.data.calendly_event_uri ?? null,
      is_published: parsed.data.is_published ?? false,
      is_preview: parsed.data.is_preview ?? false,
      metadata: {},
    };

    const { data, error } = await supabase
      .from('sessions')
      .insert(insertPayload as never)
      .select('*')
      .single();
    if (error) {
      logger.error('Failed to create session', { error: error.message, payload: insertPayload });
      throw new ApiError(500, 'session_create_failed', 'Could not create session.', { reason: error.message });
    }
    const row = data as unknown as { id: string };

    return jsonResponse(
      {
        ok: true as const,
        data: { session_id: row.id },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
