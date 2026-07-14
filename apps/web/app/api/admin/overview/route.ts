import { type NextRequest } from 'next/server';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { jsonResponse } from '@/lib/utils/api';
import { getOverviewCounters } from '@/services/admin/overview';

// GET /api/admin/overview - aggregate stats for the admin
// dashboard. The query and shape are owned by
// services/admin/overview.ts so the same counters back the
// RSC page (/[locale]/admin/page.tsx). The API route is the
// JSON surface for client-side refresh / polling use cases.
export async function GET(_req: NextRequest) {
  await requireAdminRoute();
  const counters = await getOverviewCounters();
  return jsonResponse({
    ok: true as const,
    data: counters,
  });
}
