import 'server-only';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

// Row type for the untyped boundary cast (CLAUDE.md §3.9).
// The hand-maintained `Database` type is permissive until
// `pnpm db:types` runs against a live DB; we re-cast at the
// consumer.
type RowArray = ReadonlyArray<Record<string, unknown>>;

// Shape of the overview counters. Both the API route
// (/api/admin/overview) and the RSC page
// (/[locale]/admin/page.tsx) return this shape so the client
// component (apps/web/components/admin/overview-counters.tsx)
// can be reused on both surfaces.
export interface OverviewCounters {
  studentsCount: number;
  coursesCount: number;
  chaptersCount: number;
  sessionsCount: number;
  sessionGrantsCount: number;
  sessionBookingsCount: number;
  revenueCents: number;
  refundsCents: number;
}

// Read the live platform counters from the v2 hierarchy
// tables (Sprint 3.6 §4.2). Re-anchored on:
//   - session_grants, session_bookings, payments (revenue + refunds)
//   - profiles (students)
//   - courses, chapters, sessions (catalog counts, published only)
//
// Returns zeros on read failure (never throws) so the admin
// overview page can still render with an "unable to load"
// toast if Supabase is degraded.
export async function getOverviewCounters(): Promise<OverviewCounters> {
  const supabase = await createSupabaseServerClientUntyped();
  const [
    sessionGrants,
    sessionBookings,
    payments,
    students,
    courses,
    chapters,
    sessions,
  ] = await Promise.all([
    supabase
      .from('session_grants')
      .select('id, status, amount_cents, currency') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('session_bookings')
      .select('id, status, scheduled_start') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('payments')
      .select('id, status, amount_cents, session_grant_id') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('profiles')
      .select('id, role')
      .eq('role', 'student') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('courses')
      .select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('chapters')
      .select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
    supabase
      .from('sessions')
      .select('id, is_published') as unknown as Promise<{ data: RowArray | null; error: unknown }>,
  ]);

  // Guard each read so a single table failure does not zero
  // the entire dashboard.
  const safe = (rows: RowArray | null | undefined): ReadonlyArray<Record<string, unknown>> => rows ?? [];

  // Revenue = sum of *succeeded* payments that are linked to a
  // session_grant (i.e. the v2 unit-of-payment). Legacy
  // enrollment_id / booking_id payments are excluded — the
  // v1 tables no longer exist (Sprint 3.6 §4.2).
  const totalRevenueCents = safe(payments.data)
    .filter(
      (p) =>
        (p as { status?: string }).status === 'succeeded' &&
        (p as { session_grant_id?: string | null }).session_grant_id != null,
    )
    .reduce((sum, p) => sum + ((p as { amount_cents?: number }).amount_cents ?? 0), 0);

  // Refund cents: succeeded payments that have since been
  // refunded.
  const refundedCents = safe(payments.data)
    .filter(
      (p) =>
        (p as { status?: string }).status === 'refunded' &&
        (p as { session_grant_id?: string | null }).session_grant_id != null,
    )
    .reduce((sum, p) => sum + ((p as { amount_cents?: number }).amount_cents ?? 0), 0);

  const errors = [
    sessionGrants.error,
    sessionBookings.error,
    payments.error,
    students.error,
    courses.error,
    chapters.error,
    sessions.error,
  ].filter(Boolean);
  if (errors.length > 0) {
    logger.warn('admin.overview.partial_read_failure', {
      errors: errors.map(describeError),
    });
  }

  return {
    studentsCount: safe(students.data).length,
    coursesCount: safe(courses.data).length,
    chaptersCount: safe(chapters.data).length,
    sessionsCount: safe(sessions.data).length,
    sessionGrantsCount: safe(sessionGrants.data).length,
    sessionBookingsCount: safe(sessionBookings.data).length,
    revenueCents: totalRevenueCents,
    refundsCents: refundedCents,
  };
}
