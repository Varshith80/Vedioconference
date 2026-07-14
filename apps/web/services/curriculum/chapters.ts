import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { ChapterWithSessions, Session, Chapter } from '@/types/domain';

/**
 * `services/curriculum/chapters.ts` — read access to a single
 * chapter with its published sessions eagerly joined.
 *
 * Used by the public chapter detail page
 * `/[locale]/courses/[slug]/chapters/[chapterSlug]`.
 */

/**
 * Fetch a chapter by (courseId, slug) with its published
 * sessions. Returns `null` on miss.
 */
export const getChapterWithSessions = cache(
  async (courseId: string, slug: string): Promise<ChapterWithSessions | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: chapter, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('course_id', courseId)
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      if (!chapter) return null;

      const { data: sessions, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('chapter_id', (chapter as unknown as Chapter).id)
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (sErr) throw sErr;

      return {
        ...(chapter as unknown as ChapterWithSessions),
        sessions: (sessions ?? []) as unknown as ReadonlyArray<Session>,
      };
    } catch (e) {
      logger.error('getChapterWithSessions failed', { courseId, slug, ...describeError(e) });
      return null;
    }
  },
);
