import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';

/**
 * GET /api/module-bookings — list the current user's module
 * bookings, with the module and meeting link eagerly joined.
 * Sprint B2 replaces the per-booking flow: each row here is one
 * scheduled module of a course enrollment.
 */
export async function GET(_req: NextRequest) {
  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw Unauthorized('You must be signed in to view your bookings.');

  const { data, error } = await supabase
    .from('module_bookings')
    .select(
      '*, module:modules(*), meeting:meeting_links!meeting_links_module_booking_id_fkey(*)',
    )
    .eq('student_id', user.id)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return jsonResponse({ ok: true as const, data: (data ?? []) as unknown as ReadonlyArray<Record<string, unknown>> });
}
