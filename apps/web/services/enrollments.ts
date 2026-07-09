import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound } from '@/lib/utils/errors';
import type { Enrollment, EnrollmentWithProgress } from '@/types/domain';

/**
 * List the current user's enrollments (active, completed, etc.)
 * with the course and per-module progress eagerly joined. Used
 * by the dashboard's "my courses" page.
 */
export const getStudentEnrollments = cache(
  async (studentId: string): Promise<EnrollmentWithProgress[]> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('enrollments')
      .select(
        '*, course:courses(*), progress:module_progress(*)',
      )
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as EnrollmentWithProgress[];
  },
);

/** Fetch a single enrollment by id. RLS scopes the read. */
export const getEnrollment = cache(async (id: string): Promise<Enrollment> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) throw NotFound('Enrollment not found.');
  return data;
});

/** List the published modules of a course. Used by
 *  /api/enrollments/[id]/modules. */
export const getEnrollmentCourseModules = cache(
  async (enrollmentId: string): Promise<ReadonlyArray<{
    module: { id: string; title: string; position: number; duration_min: number; is_published: boolean; is_preview: boolean };
    progress: { status: 'not_started' | 'in_progress' | 'completed'; started_at: string | null; completed_at: string | null } | null;
  }>> => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('module_progress')
      .select('status, started_at, completed_at, module:modules(id, title, position, duration_min, is_published, is_preview)')
      .eq('enrollment_id', enrollmentId)
      .order('module(position)', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as ReadonlyArray<{
      module: { id: string; title: string; position: number; duration_min: number; is_published: boolean; is_preview: boolean };
      progress: { status: 'not_started' | 'in_progress' | 'completed'; started_at: string | null; completed_at: string | null } | null;
    }>;
  },
);
