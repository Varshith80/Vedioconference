import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Course, Tutor } from '@/types/domain';

export const getPublishedCourses = cache(async (): Promise<Course[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('is_published', true)
      .order('title');
    if (error) throw error;
    // The select chain can't be fully inferred without a generated
    // Database type (run `pnpm db:types` to replace this cast).
    return (data ?? []) as unknown as Course[];
  } catch (e) {
    logger.error('getPublishedCourses failed', describeError(e));
    return [];
  }
});

export const getCourseBySlug = cache(async (slug: string): Promise<Course | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();
    if (error || !data) throw NotFound(`Cours introuvable : ${slug}`);
    return data as unknown as Course;
  } catch (e) {
    logger.error('getCourseBySlug failed', { slug, ...describeError(e) });
    return null;
  }
});

export const getAllPublishedCourseSlugs = cache(async (): Promise<string[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('courses')
      .select('slug')
      .eq('is_published', true);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { slug: string }).slug);
  } catch {
    // Build-time safe: if Supabase is unreachable during
    // `generateStaticParams` (no env, offline CI, etc.) return
    // an empty list so the page falls back to dynamic rendering
    // rather than failing the build.
    return [];
  }
});

// Reference Tutor in this file so the import isn't tree-shaken
// when we add tutor-coupled queries in later sprints.
export type { Tutor };
