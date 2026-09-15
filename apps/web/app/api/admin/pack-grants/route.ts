import { type NextRequest } from 'next/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { listPackGrants } from '@/services/admin/pack-grants';

// =====================================================================
// Phase 1 — Feature B: GET /api/admin/pack-grants.
//
// Admin-only. Lists every Pack 10 grant, newest first, capped
// at 200 rows. The service is admin-gated by RLS
// (`session_grants_select_owner_admin` + `is_admin()` guard at
// the route level); a non-admin caller receives 403.
//
// This route is the JSON twin of /admin/packs (which renders
// the table via the RSC). Future operator tooling (CLI scripts,
// Slack integrations) reads through this endpoint.
// =====================================================================

export async function GET(_req: NextRequest) {
  try {
    await requireAdminRoute();
    const rows = await listPackGrants();
    return jsonResponse({ ok: true as const, data: rows });
  } catch (e) {
    return errorResponse(e);
  }
}
