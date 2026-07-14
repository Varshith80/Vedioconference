import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Course } from '@/types/domain';

/** RFC 4122-shaped UUID, lower-case. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Public shape of a tutor on the marketing site. */
export interface PublicTutor {
  id: string;
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
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  rating_avg: number | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | {
    full_name: string | null;
    avatar_url: string | null;
  }[] | null;
}

function toPublicTutor(row: TutorJoinRow): PublicTutor {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  return {
    id: row.id,
    full_name: profile?.full_name ?? 'Tuteur',
    bio: row.bio ?? '',
    headline: row.headline ?? '',
    years_experience: row.years_experience ?? 0,
    rating: row.rating_avg ?? 0,
    avatar_url: profile?.avatar_url ?? null,
  };
}

const TUTOR_SELECT = 'id, headline, bio, years_experience, rating_avg, profile:profiles!inner(full_name, avatar_url)';

export const listPublishedTutors = cache(async (): Promise<PublicTutor[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select(TUTOR_SELECT)
      .eq('is_published', true);
    if (error) throw error;
    return ((data ?? []) as unknown as TutorJoinRow[]).map(toPublicTutor);
  } catch (e) {
    // Marketing lists must degrade gracefully when the database
    // is unreachable. The page renders an EmptyState; we log the
    // error so the operator still sees it.
    logger.error('listPublishedTutors failed', describeError(e));
    return [];
  }
});

export const getTutorBySlug = cache(async (slug: string): Promise<PublicTutor | null> => {
  try {
    // The route param is named `[slug]` for URL backwards-compatibility
    // but the database key is the tutor uuid. Validating the shape
    // here avoids a noisy 22P02 log line on every non-uuid input
    // (e.g. when a user types `/tutors/abc` into the URL bar).
    if (!UUID_RE.test(slug)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select(TUTOR_SELECT)
      .eq('id', slug)
      .eq('is_published', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toPublicTutor(data as unknown as TutorJoinRow);
  } catch (e) {
    // Returns null on DB failure so the page can render its
    // not-found UI instead of crashing the request. The notFound()
    // call is reserved for the "row genuinely does not exist"
    // case, which we still get when the DB is up.
    logger.error('getTutorBySlug failed', { slug, ...describeError(e) });
    return null;
  }
});

export const getAllPublishedTutorSlugs = cache(async (): Promise<string[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select('id')
      .eq('is_published', true);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { id: string }).id);
  } catch {
    // Build-time safe: see getAllPublishedCourseSlugs.
    return [];
  }
});

/** Courses taught by a given tutor (via the course_tutors join table). */
export const listCoursesForTutor = cache(async (tutorId: string): Promise<Course[]> => {
  try {
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
  } catch (e) {
    logger.error('listCoursesForTutor failed', { tutorId, ...describeError(e) });
    return [];
  }
});
