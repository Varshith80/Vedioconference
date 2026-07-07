import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { Forbidden, Unauthorized } from '@/lib/utils/errors';

/** Lightweight admin guard helper. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw Unauthorized();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  // The Database type is permissive (Record<string, unknown>) until
  // `pnpm db:types` runs; assert the public columns we need.
  const role = (profile as { role?: string } | null)?.role;
  if (!profile || (role !== 'admin' && role !== 'super_admin')) {
    throw Forbidden();
  }
  return { user, supabase };
}

/** GET /api/admin/overview – aggregate stats for the admin dashboard. */
export async function GET(_req: NextRequest) {
  try {
    const { supabase } = await requireAdmin();

    const [bookings, payments, students, courses] = await Promise.all([
      supabase.from('bookings').select('id, status, amount_cents, scheduled_start'),
      supabase.from('payments').select('id, status, amount_cents'),
      supabase.from('profiles').select('id, role').eq('role', 'student'),
      supabase.from('courses').select('id, is_published'),
    ]);

    const totalRevenueCents = (payments.data ?? [])
      .filter((p: { status: string }) => p.status === 'succeeded')
      .reduce((sum: number, p: { amount_cents: number }) => sum + p.amount_cents, 0);

    return NextResponse.json({
      bookingsCount: bookings.data?.length ?? 0,
      revenueCents:  totalRevenueCents,
      studentsCount: students.data?.length ?? 0,
      coursesCount:  courses.data?.length ?? 0,
    });
  } catch (e) { return errorResponse(e); }
}
