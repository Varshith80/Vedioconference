import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/sessions/bulk — admin-only bulk upsert of a
 * chapter's sessions in a single request. Used by the Sprint 3.6
 * Excel importer to push the parsed sessions of one chapter in
 * one roundtrip.
 *
 * Sprint 3.6 §5.5 (Option A): one INSERT … ON CONFLICT
 * (chapter_id, position) DO UPDATE per request. The parser
 * pre-validates every row, so a malformed row in this
 * payload is the importer's fault — we surface it via 422.
 *
 * price_cents: NULL is the "price TBD" sentinel. The endpoint
 * preserves NULL on upsert (Sprint 3.5 invariant).
 */
const bodySchema = z.object({
  chapter_id: z.string().uuid(),
  sessions: z
    .array(
      z.object({
        position: z.number().int().positive(),
        slug: z.string().min(1).max(120),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        duration_min: z.number().int().positive().nullable().optional(),
        // price_cents is the canonical "TBD" channel: null means
        // "no price yet". A non-null value must be a non-negative
        // integer.
        price_cents: z.number().int().nonnegative().nullable().optional(),
        currency: z.string().length(3).optional(),
        is_published: z.boolean().optional(),
        is_preview: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(req: NextRequest) {
  try {
    // Admin-only (Sprint 3.6 §4.1).
    const { supabase } = await requireAdminRoute();

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }
    const { chapter_id, sessions } = parsed.data;
    if (sessions.length === 0) {
      throw BadRequest('sessions must not be empty.');
    }

    // Confirm the chapter exists.
    const { data: chapter, error: cErr } = await supabase
      .from('chapters')
      .select('id')
      .eq('id', chapter_id)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!chapter) throw NotFound('Chapter not found.');

    // Defensive de-dup: the importer is the only caller, but a
    // future admin form might surface this. Two sessions with
    // the same (chapter_id, position) would crash the upsert
    // with a 23505 unique violation; the importer guarantees
    // uniqueness, but we sanity-check anyway.
    const seen = new Set<number>();
    for (const s of sessions) {
      if (seen.has(s.position)) {
        throw BadRequest(`Duplicate position ${s.position} in batch.`);
      }
      seen.add(s.position);
    }

    const rows = sessions.map((s) => ({
      chapter_id,
      position: s.position,
      slug: s.slug,
      title: s.title,
      description: s.description ?? null,
      duration_min: s.duration_min ?? null,
      price_cents: s.price_cents ?? null,
      currency: s.currency ?? 'EUR',
      is_published: s.is_published ?? false,
      is_preview: s.is_preview ?? false,
      metadata: {},
    }));

    const { data, error } = await supabase
      .from('sessions')
      .upsert(rows as never, { onConflict: 'chapter_id,position' })
      .select('id, position');
    if (error) {
      logger.error('Failed to bulk upsert sessions', {
        chapter_id,
        count: sessions.length,
        error: error.message,
      });
      throw new ApiError(500, 'session_bulk_upsert_failed', 'Could not upsert sessions.', {
        reason: error.message,
      });
    }

    // Echo the new ids in insertion order.
    const ids = ((data ?? []) as unknown as Array<{ id: string; position: number }>).map(
      (r) => r.id,
    );
    return jsonResponse(
      {
        ok: true as const,
        data: { chapter_id, session_ids: ids, count: ids.length },
      },
      { status: 200 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
