import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound } from '@/lib/utils/errors';
import type { Course } from '@/types/domain';

export const getPublishedCourses = cache(async (): Promise<Course[]> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('is_published', true)
    .order('title');
  if (error) throw error;
  return data ?? [];
});

export const getCourseBySlug = cache(async (slug: string): Promise<Course> => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error || !data) throw NotFound(`Cours introuvable : ${slug}`);
  return data;
});
