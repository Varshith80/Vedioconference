import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Course } from '@/types/domain';

// =====================================================================
// Sprint 3.8 + Phase 2 marketing acceptance — Standalone tutor
// architecture, with a curated public projection.
//
// Tutors are a flat reference table (`public.tutors`) that
// carries PII (email, phone, notes). Anonymous marketing visitors
// MUST NOT be able to read that base table. The migration
// `20260910000001_public_tutors_view.sql` creates a
// `public.public_tutors` view that whitelists only the non-PII
// columns (id, full_name, subject, bio, years_experience) and
// grants `anon SELECT` on the view only.
//
// The marketing tutors page is back in scope per the editorial
// structure (`CoursEnLigne-Editorial-Structure_160826-EN.docx`).
// This service reads from the view so the marketing surface
// stays PII-free while the admin surface keeps the full record.
// =====================================================================

/** RFC 4122-shaped UUID, lower-case. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Public shape of a tutor on the marketing site. NEVER carries
 * PII: no email, no phone, no notes. Comes from the
 * `public.public_tutors` view.
 */
export interface PublicTutor {
  id: string;
  full_name: string;
  subject: string;
  bio: string | null;
  years_experience: number;
}

interface PublicTutorRow {
  id: string;
  full_name: string;
  subject: string;
  bio: string | null;
  years_experience: number;
}

function toPublicTutor(row: PublicTutorRow): PublicTutor {
  return {
    id: row.id,
    full_name: row.full_name,
    subject: row.subject,
    bio: row.bio,
    years_experience: row.years_experience,
  };
}

const PUBLIC_TUTOR_SELECT = 'id, full_name, subject, bio, years_experience';

/**
 * Active tutors for the marketing directory, ordered by
 * full_name asc. Reads from the `public.public_tutors` view,
 * which exposes only non-PII columns and filters on
 * `status = 'active'`.
 */
export const listPublishedTutors = cache(async (): Promise<PublicTutor[]> => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('public_tutors')
      .select(PUBLIC_TUTOR_SELECT)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as unknown as PublicTutorRow[]).map(toPublicTutor);
  } catch (e) {
    // Marketing lists must surface errors to the operator but
    // never leak the raw exception to the page. The page
    // renders an EmptyState; we log the full error.
    logger.error('listPublishedTutors failed', describeError(e));
    return [];
  }
});

/**
 * Single tutor by id (UUID — no slug in the standalone schema,
 * Sprint 3.8). Reads from the curated public view, not the
 * base PII table.
 */
export const getTutorBySlug = cache(async (slug: string): Promise<PublicTutor | null> => {
  try {
    if (!UUID_RE.test(slug)) return null;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('public_tutors')
      .select(PUBLIC_TUTOR_SELECT)
      .eq('id', slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return toPublicTutor(data as unknown as PublicTutorRow);
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
