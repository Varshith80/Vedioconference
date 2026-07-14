import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Session, SessionWithChapter, Chapter } from '@/types/domain';

/**
 * `services/curriculum/sessions.ts` — read access to the
 * `sessions` table. Sessions are the atomic unit of the
 * platform: one Stripe charge, one Calendly booking, one
 * Zoom meeting.
 *
 * Used by the public session detail page
 * `/[locale]/sessions/[id]` and the dashboard's
 * "My sessions" list.
 */

/**
 * Fetch a single session by its id, with its parent chapter
 * eagerly joined. Returns `null` on miss.
 */
export const getSessionWithChapter = cache(
  async (id: string): Promise<SessionWithChapter | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('*, chapter:chapters(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as SessionWithChapter;
    } catch (e) {
      logger.error('getSessionWithChapter failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/**
 * List all published sessions of a course, with their
 * chapters eagerly joined. Used by the chapter listing
 * service to render the new hierarchy.
 */
export const getPublishedSessionsByCourse = cache(
  async (courseId: string): Promise<ReadonlyArray<SessionWithChapter>> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('*, chapter:chapters!inner(*)')
        .eq('chapter.course_id', courseId)
        .eq('is_published', true)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ReadonlyArray<SessionWithChapter>;
    } catch (e) {
      logger.error('getPublishedSessionsByCourse failed', { courseId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Cheap variant that returns just a session row (no chapter
 * join) — used by the API routes where the chapter is not
 * needed in the response payload.
 */
export const getSession = cache(
  async (id: string): Promise<Session | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Session | null;
    } catch (e) {
      logger.error('getSession failed', { id, ...describeError(e) });
      return null;
    }
  },
);
