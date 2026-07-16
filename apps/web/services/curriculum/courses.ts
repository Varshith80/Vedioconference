import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  Course,
  CourseWithChapters,
  ChapterWithSessions,
  Session,
  Program,
  Grade,
} from '@/types/domain';

/**
 * `services/curriculum/courses.ts` — read access to the
 * `courses` table, now with its new `program_id` / `grade_id`
 * FKs and its chapters + sessions eagerly joined.
 *
 * This is the v2 read path. The v1 `services/courses.ts`
 * is kept (and marked @deprecated) for one sprint to keep
 * the B2/C-phase route handlers compiling.
 */

interface CourseListItem extends Course {
  program: Program;
  grade: Grade | null;
}

/**
 * List all published courses, optionally filtered by
 * program (and optionally by grade within that program).
 * Used by the `/[locale]/levels/[levelSlug]` page and
 * `/[locale]/levels/[levelSlug]/grades/[gradeSlug]`.
 */
export const getCoursesByProgram = cache(
  async (
    programId: string,
    options: { gradeId?: string | null } = {},
  ): Promise<ReadonlyArray<CourseListItem>> => {
    try {
      const supabase = await createSupabaseServerClient();
      // The v2 `courses` table does NOT have a `sort_order`
      // column (the v1 schema never had one). We order by
      // `title` only — same pattern the v1 `services/courses.ts
      // :getPublishedCourses` already uses (line 15). This
      // matches the documented `mark-issue: courses.sort_order
      // 42703` fix: do not invent a `position` column here, as
      // adding a column would be a schema change.
      let query = supabase
        .from('courses')
        .select('*, program:programs(*), grade:grades(*)')
        .eq('program_id', programId)
        .eq('is_published', true)
        .order('title', { ascending: true });

      if (options.gradeId !== undefined) {
        // null gradeId means "courses without a grade" (e.g.
        // preparatory-level courses). A missing key means
        // "all courses in the program".
        if (options.gradeId === null) {
          query = query.is('grade_id', null);
        } else {
          query = query.eq('grade_id', options.gradeId);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ReadonlyArray<CourseListItem>;
    } catch (e) {
      logger.error('getCoursesByProgram failed', { programId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Fetch a single course by id. Returns `null` on miss.
 * Used by the public session detail page to resolve the
 * course slug for the breadcrumb back-link.
 */
export const getCourseById = cache(
  async (id: string): Promise<Course | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Course | null;
    } catch (e) {
      logger.error('getCourseById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Fetch a single course by its slug with its program, grade,
 * and chapters (each with its sessions) eagerly joined.
 * Used by the marketing course detail page.
 */
export const getCourseWithChapters = cache(
  async (slug: string): Promise<CourseWithChapters | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      // First fetch the course + program + grade.
      const { data: course, error } = await supabase
        .from('courses')
        .select('*, program:programs(*), grade:grades(*)')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      if (!course) return null;

      const courseRow = course as unknown as Course & {
        program: Program;
        grade: Grade | null;
      };

      // Then fetch the published chapters for the course.
      const { data: chaptersRaw, error: chErr } = await supabase
        .from('chapters')
        .select('*')
        .eq('course_id', courseRow.id)
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (chErr) throw chErr;

      const chaptersList = (chaptersRaw ?? []) as unknown as ChapterWithSessions[];

      // Then fetch the published sessions for those chapters.
      const chapterIds = chaptersList.map((c) => c.id);
      let sessionsByChapter: Record<string, ReadonlyArray<Session>> = {};
      if (chapterIds.length > 0) {
        const { data: sessions, error: sErr } = await supabase
          .from('sessions')
          .select('*')
          .in('chapter_id', chapterIds)
          .eq('is_published', true)
          .order('position', { ascending: true });
        if (sErr) throw sErr;
        for (const s of (sessions ?? []) as unknown as Session[]) {
          const arr = sessionsByChapter[s.chapter_id] ?? [];
          sessionsByChapter[s.chapter_id] = [...arr, s];
        }
      }

      const chapters: ChapterWithSessions[] = chaptersList.map((c) => ({
        ...c,
        sessions: (sessionsByChapter[c.id] ?? []) as ReadonlyArray<Session>,
      }));

      return {
        ...(courseRow as unknown as CourseWithChapters),
        chapters,
      };
    } catch (e) {
      logger.error('getCourseWithChapters failed', { slug, ...describeError(e) });
      return null;
    }
  },
);
