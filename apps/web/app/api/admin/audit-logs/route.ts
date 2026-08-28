import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { listAuditLogsQuerySchema } from '@/lib/validations/admin-audit-logs';
import { listAuditLogs } from '@/services/admin/audit-logs';
import { decodeCursor } from '@/lib/validations/cursor';

// =====================================================================
// Sprint 8 — N-3 GET /api/admin/audit-logs.
//
// Admin-only. Returns paginated audit_logs entries with the
// (ts,id) cursor scheme used elsewhere. Auth is enforced by
// `requireAdminRoute()`; the DB RLS `audit_logs_select_admin`
// policy blocks the read even if the route is somehow bypassed.
// =====================================================================

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoute();
    const sp = req.nextUrl?.searchParams ?? new URL(req.url).searchParams;
    const rawCursor = sp.get('cursor') ?? undefined;
    if (rawCursor && !decodeCursor(rawCursor)) {
      throw BadRequest('Invalid `cursor` parameter.');
    }
    const rawQuery = {
      limit: sp.get('limit') ?? undefined,
      cursor: rawCursor,
      before: sp.get('before') ?? undefined,
      table_name: sp.get('table_name') ?? undefined,
      action: sp.get('action') ?? undefined,
    };
    const parsed = listAuditLogsQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      const { ZodError } = await import('zod');
      throw new ZodError(parsed.error.issues);
    }
    const { data, nextCursor } = await listAuditLogs({
      limit: parsed.data.limit,
      cursor: parsed.data.cursor,
      before: parsed.data.before,
      tableName: parsed.data.table_name,
      action: parsed.data.action,
    });
    return jsonResponse({ ok: true as const, data, nextCursor });
  } catch (e) {
    return errorResponse(e);
  }
}