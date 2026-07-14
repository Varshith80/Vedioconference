import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { ModuleBooking, ModuleBookingWithDetails } from '@/types/domain';

/**
 * List the current user's module bookings with the module and
 * meeting link eagerly joined. Used by the dashboard's "my
 * bookings" page.
 */
export const getStudentModuleBookings = cache(
  async (studentId: string): Promise<ModuleBookingWithDetails[]> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('module_bookings')
        .select(
          '*, module:modules(*), meeting:meeting_links!meeting_links_module_booking_id_fkey(*)',
        )
        .eq('student_id', studentId)
        .order('scheduled_start', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ModuleBookingWithDetails[];
    } catch (e) {
      logger.error('getStudentModuleBookings failed', { studentId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Fetch a single module booking by id, with the module and
 * meeting link joined. RLS already restricts to the owner /
 * tutor / admin, so we just propagate the row.
 */
export const getModuleBooking = cache(
  async (id: string): Promise<ModuleBooking | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('module_bookings')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) throw NotFound('Module booking not found.');
      return data;
    } catch (e) {
      logger.error('getModuleBooking failed', { id, ...describeError(e) });
      return null;
    }
  },
);
