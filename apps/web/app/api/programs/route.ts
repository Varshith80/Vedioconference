import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest, ApiError } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { logger } from '@/lib/utils/logger';
import { adminProgramCreateSchema } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — POST /api/programs (admin create).
//
// Manual creation of a Program (Level). The Excel importer does
// NOT use this route (it upserts programs directly via the
// ON CONFLICT path in lib/excel/import.ts). This route exists
// for the Admin Manual CRUD plan §6.
//
// On a 23505 unique_violation (programs.slug is UNIQUE) we map
// to 409 with a friendly message.
// =====================================================================

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await requireAdminRoute();

    const raw = await req.json().catch(() => null);
    const parsed = adminProgramCreateSchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const insertPayload = {
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      sort_order: parsed.data.sort_order ?? 0,
      is_published: parsed.data.is_published ?? false,
    };

    const { data, error } = await supabase
      .from('programs')
      .insert(insertPayload as never)
      .select('id, slug, title')
      .single();
    if (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(
          409,
          'program_slug_conflict',
          'A program with this slug already exists.',
        );
      }
      logger.error('Failed to create program', { error: error.message, payload: insertPayload });
      throw new ApiError(500, 'program_create_failed', 'Could not create program.', {
        reason: error.message,
      });
    }
    const row = data as unknown as { id: string; slug: string; title: string };

    return jsonResponse(
      { ok: true as const, data: { program_id: row.id, slug: row.slug, title: row.title } },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
