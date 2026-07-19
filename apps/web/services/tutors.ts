import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Course } from '@/types/domain';

// =====================================================================
// Sprint 3.8 — Standalone tutor architecture.
//
// Tutors are no longer 1:1 with `auth.users` + `profiles` and no
// longer have a `course_tutors` join. They are a flat reference
// table (`public.tutors`). The marketing site no longer renders a
// public tutor directory: there is no "Meet the tutors" page in
// the MVP because tutors are operational records, not personas.
//
// This file is kept so existing imports (`listPublishedTutors`,
// `getTutorBySlug`, `getAllPublishedTutorSlugs`) still resolve
// type-wise and the marketing route falls back to "[]" without a
// 500. If a future sprint re-introduces a public tutor directory,
// it will use the standalone shape defined here.
// =====================================================================

/** RFC 4122-shaped UUID, lower-case. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Public shape of a tutor on the marketing site (standalone MVP). */
export interface PublicTutor {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
}

interface TutorRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
}

function toPublicTutor(row: TutorRow): PublicTutor {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    notes: row.notes,
  };
}

const TUTOR_SELECT = 'id, full_name, email, phone, status, notes';

/**
 * Active tutors, ordered by full_name asc.
 *
 * Returns an empty array in the MVP because tutors are operational
 * records that the Admin manages — not a marketing surface. The
 * marketing "tutors" page is removed; this function remains only
 * so any leftover call site degrades to an EmptyState.
 */
export const listPublishedTutors = cache(async (): Promise<PublicTutor[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select(TUTOR_SELECT)
      .eq('status', 'active')
      .order('full_name', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as TutorRow[]).map(toPublicTutor);
  } catch (e) {
    // Marketing lists must degrade gracefully when the database
    // is unreachable. The page renders an EmptyState; we log the
    // error so the operator still sees it.
    logger.error('listPublishedTutors failed', describeError(e));
    return [];
  }
});

/**
 * Single tutor by id. Kept for URL backwards-compat
 * (`/tutors/[uuid]` is still a valid route, but the page now
 * just returns notFound() because the marketing surface is
 * gone in the MVP).
 */
export const getTutorBySlug = cache(async (slug: string): Promise<PublicTutor | null> => {
  try {
    if (!UUID_RE.test(slug)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('tutors')
      .select(TUTOR_SELECT)
      .eq('id', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toPublicTutor(data as unknown as TutorRow);
  } catch (e) {
    logger.error('getTutorBySlug failed', { slug, ...describeError(e) });
    return null;
  }
});

/** Slug list for sitemap. Returns []. The marketing route is gone. */
export const getAllPublishedTutorSlugs = cache(async (): Promise<string[]> => {
  return [];
});

/**
 * Courses assigned to a tutor, derived from `sessions.tutor_id`.
 *
 * Sprint 3.8 — there is no longer a `course_tutors` join table.
 * A tutor is "assigned" to a course if they have at least one
 * session (chapter-level) in that course. We dedupe courses by
 * id and order by course title.
 */
export const listCoursesForTutorStandalone = cache(
  async (tutorId: string): Promise<Course[]> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('sessions')
        .select(
          'chapter:chapters!inner(course:courses!inner(id, slug, title, subtitle, description, subject, level, level_group, program_id, grade_id, price_cents, currency, duration_min, is_subscription, is_published, cover_image, metadata, created_at, updated_at))',
        )
        .eq('tutor_id', tutorId)
        .eq('chapter.course.is_published', true);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{
        chapter: {
          course: Course | Course[] | null;
        } | null;
      }>;
      const seen = new Map<string, Course>();
      for (const r of rows) {
        const raw = r.chapter?.course;
        const c = Array.isArray(raw) ? raw[0] : raw;
        if (c && !seen.has(c.id)) seen.set(c.id, c);
      }
      return Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title));
    } catch (e) {
      logger.error('listCoursesForTutorStandalone failed', {
        tutorId,
        ...describeError(e),
      });
      return [];
    }
  },
);
