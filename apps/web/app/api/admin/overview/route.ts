import { type NextRequest } from 'next/server';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { jsonResponse } from '@/lib/utils/api';

// Sprint B2: the typed `@supabase/postgrest-js` chain does not
// always round-trip cleanly through our hand-maintained
// `Database` type — queries can fall through to a
// `SelectQueryError` union and `.eq` becomes untyped. We use the
// untyped server client (CLAUDE.md §3.9 — the documented boundary
// pattern) and re-cast the row at the consumer. RLS still
// enforces the read.
type RowArray = ReadonlyArray<Record<string, unknown>>;

/**
 * GET /api/admin/overview – aggregate stats for the admin
 * dashboard. Sprint 3.6: re-anchored on the v2 session hierarchy
 * (`session_grants`, `session_bookings`, `payments`, `profiles`,
 * `courses`, `chapters`, `sessions`). The v1 module-based
 * counters (`module_bookings`, `enrollments`, `module_progress`)
 * are gone — see PHASE2_SPRINT_3_6_SUMMARY.md §4.2.
 */
export async function GET(_req: NextRequest) {
  const { supabase } = await requireAdminRoute();

  const [sessionGrants, sessionBookings, payments, students, courses, chapters, sessions] = await Promise.all([
    supabase.from('session_grants').select('id, status, amount_cents, currency') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('session_bookings').select('id, status, scheduled_start') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('payments').select('id, status, amount_cents, session_grant_id') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('profiles').select('id, role').eq('role', 'student') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('courses').select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('chapters').select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('sessions').select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
  ]);

  // Revenue = sum of *succeeded* payments that are linked to a
  // session_grant (i.e. the v2 unit-of-payment). Legacy
  // enrollment_id / booking_id payments are excluded — the v1
  // tables no longer exist.
  const totalRevenueCents = (payments.data ?? [])
    .filter((p) => (p as { status?: string }).status === 'succeeded' && (p as { session_grant_id?: string | null }).session_grant_id != null)
    .reduce((sum, p) => sum + ((p as { amount_cents?: number }).amount_cents ?? 0), 0);

  // Refund cents: succeeded payments that have since been
  // refunded. The `status` is the only signal we have here; the
  // exact cents come from the linked `session_grants`.
  const refundedCents = (payments.data ?? [])
    .filter((p) => (p as { status?: string }).status === 'refunded' && (p as { session_grant_id?: string | null }).session_grant_id != null)
    .reduce((sum, p) => sum + ((p as { amount_cents?: number }).amount_cents ?? 0), 0);

  return jsonResponse({
    ok: true as const,
    data: {
      sessionGrantsCount:    sessionGrants.data?.length ?? 0,
      sessionBookingsCount:  sessionBookings.data?.length ?? 0,
      revenueCents:          totalRevenueCents,
      refundsCents:          refundedCents,
      studentsCount:         students.data?.length ?? 0,
      coursesCount:          courses.data?.length ?? 0,
      chaptersCount:         chapters.data?.length ?? 0,
      sessionsCount:         sessions.data?.length ?? 0,
    },
  });
}
