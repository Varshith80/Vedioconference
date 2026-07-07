import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NotFound } from '@/lib/utils/errors';
import type { Course } from '@/types/domain';

/** Public shape of a tutor on the marketing site. */
export interface PublicTutor {
  id: string;
  slug: string;
  full_name: string;
  bio: string;
  headline: string;
  years_experience: number;
  rating: number;
  avatar_url: string | null;
}

/** Row shape returned by the joined select below. */
interface TutorJoinRow {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  rating: number | null;
  avatar_url: string | null;
  profile: { full_name: string | null; is_published: boolean | null } | { full_name: string | null; is_published: boolean | null }[] | null;
}

function toPublicTutor(row: TutorJoinRow): PublicTutor {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  return {
    id: row.id,
    slug: row.slug,
    full_name: profile?.full_name ?? 'Tuteur',
    bio: row.bio ?? '',
    headline: row.headline ?? '',
    years_experience: row.years_experience ?? 0,
    rating: row.rating ?? 0,
    avatar_url: row.avatar_url ?? null,
  };
}

const TUTOR_SELECT = 'id, slug, headline, bio, years_experience, rating, avatar_url, profile:profiles!inner(full_name, is_published)';

export const listPublishedTutors = cache(async (): Promise<PublicTutor[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tutors')
    .select(TUTOR_SELECT)
    .eq('is_published', true);
  if (error) throw error;
  return ((data ?? []) as unknown as TutorJoinRow[]).map(toPublicTutor);
});

export const getTutorBySlug = cache(async (slug: string): Promise<PublicTutor> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tutors')
    .select(TUTOR_SELECT)
    .eq('slug', slug)
    .eq('is_published', true)
    .single();
  if (error || !data) throw NotFound(`Tuteur introuvable : ${slug}`);
  return toPublicTutor(data as unknown as TutorJoinRow);
});

export const getAllPublishedTutorSlugs = cache(async (): Promise<string[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select('slug')
      .eq('is_published', true);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { slug: string }).slug);
  } catch {
    // Build-time safe: see getAllPublishedCourseSlugs.
    return [];
  }
});

/** Courses taught by a given tutor (via the course_tutors join table). */
export const listCoursesForTutor = cache(async (tutorId: string): Promise<Course[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('course_tutors')
    .select('course:courses!inner(*)')
    .eq('tutor_id', tutorId)
    .eq('course.is_published', true);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ course: Course | Course[] | null }>)
    .map((r) => (Array.isArray(r.course) ? r.course[0] : r.course))
    .filter((c): c is Course => Boolean(c));
});
