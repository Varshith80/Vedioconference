import { type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { Forbidden, Unauthorized } from '@/lib/utils/errors';

// Sprint B2: the typed `@supabase/postgrest-js` chain does not
// always round-trip cleanly through our hand-maintained
// `Database` type — queries can fall through to a
// `SelectQueryError` union and `.eq` becomes untyped. We use the
// untyped server client (CLAUDE.md §3.9 — the documented boundary
// pattern) and re-cast the row at the consumer. RLS still
// enforces the read.
type RowArray = ReadonlyArray<Record<string, unknown>>;

/** Lightweight admin guard helper. */
async function requireAdmin(): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; supabase: Awaited<ReturnType<typeof createSupabaseServerClientUntyped>> }> {
  const user = await getCurrentUser();
  if (!user) throw Unauthorized();
  const supabase = await createSupabaseServerClientUntyped();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  const role = (profile as { role?: string } | null)?.role;
  if (!profile || (role !== 'admin' && role !== 'super_admin')) {
    throw Forbidden();
  }
  return { user, supabase };
}

/**
 * GET /api/admin/overview – aggregate stats for the admin
 * dashboard. Sprint B2: the model is module-based, so we
 * aggregate on `module_bookings` (the per-module scheduled
 * sessions) and `enrollments` (the per-course paid
 * enrollments). The legacy `bookings` table is renamed to
 * `_bookings_legacy` and is excluded from these numbers.
 */
export async function GET(_req: NextRequest) {
  const { supabase } = await requireAdmin();

  const [moduleBookings, enrollments, payments, students, courses] = await Promise.all([
    supabase.from('module_bookings').select('id, status, scheduled_start') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('enrollments').select('id, status, amount_cents')     as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('payments').select('id, status, amount_cents, enrollment_id, module_booking_id, booking_id') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('profiles').select('id, role') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase.from('courses').select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
  ]);

  // Revenue = sum of *enrollment-level* succeeded payments.
  // Per-module payments are zero-cost (covered by the course
  // enrollment), so we count only `enrollment_id`-bearing
  // payments. Legacy `booking_id` payments are excluded.
  const totalRevenueCents = (payments.data ?? [])
    .filter((p) => (p as { status?: string }).status === 'succeeded' && (p as { enrollment_id?: string | null }).enrollment_id != null)
    .reduce((sum, p) => sum + ((p as { amount_cents?: number }).amount_cents ?? 0), 0);

  return jsonResponse({
    ok: true as const,
    data: {
      moduleBookingsCount: moduleBookings.data?.length ?? 0,
      enrollmentsCount:    enrollments.data?.length ?? 0,
      revenueCents:        totalRevenueCents,
      studentsCount:       students.data?.length ?? 0,
      coursesCount:        courses.data?.length ?? 0,
    },
  });
}
