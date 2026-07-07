import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound } from '@/lib/utils/errors';
import type { Booking } from '@/types/domain';

export const getStudentBookings = cache(async (studentId: string): Promise<Booking[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, meeting_links(*)), course:courses(*), tutor:tutors(*, profile:profiles(*))')
    .eq('student_id', studentId)
    .order('scheduled_start', { ascending: false });
  if (error) throw error;
  return data ?? [];
});

export const getBooking = cache(async (id: string): Promise<Booking> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*, meeting_links(*), course:courses(*), tutor:tutors(*, profile:profiles(*))')
    .eq('id', id)
    .single();
  if (error || !data) throw NotFound('Réservation introuvable.');
  return data;
});
