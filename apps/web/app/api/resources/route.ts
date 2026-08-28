import { type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { listResourcesForCurrentUser } from '@/services/resources';

// =====================================================================
// Sprint 8 — R-1 + R-2 Resources delivery surface (student read).
//
// GET /api/resources — list the resources visible to the signed-in
// user. The RLS policy `resources_select_visible` filters out
// anything the user is not allowed to see, so we delegate the
// query to `listResourcesForCurrentUser()` (services/resources.ts).
//
// The service handles the SSR client + RLS; this route only
// checks authentication and shapes the JSON response. Auth is
// required so we never leak public-resource existence to
// anonymous users (they can hit the marketing pages for public
// material instead — out of scope for this slice).
// =====================================================================

export async function GET(_req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();
    const data = await listResourcesForCurrentUser();
    return jsonResponse({ ok: true as const, data });
  } catch (e) {
    return errorResponse(e);
  }
}