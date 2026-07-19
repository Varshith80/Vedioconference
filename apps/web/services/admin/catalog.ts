import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  Chapter,
  Course,
  Grade,
  Program,
  Session,
  SessionBooking,
  SessionGrant,
} from '@/types/domain';

// Read access to the v2 catalog + ledger tables for the
// admin console. The difference vs services/curriculum/* is:
//   - admin reads return *all* rows (published + draft), so
//     an admin can see what is not yet visible to students.
//   - no business-logic joins (e.g. a session with chapter +
//     course + program). The admin pages use simpler
//     list-of-rows shapes; the curriculum services stay
//     untouched for the student-facing flows.
//
// Each helper is wrapped in cache() and returns [] or null
// on read failure (never throws) so the admin pages render
// empty states instead of a 500 if Supabase is degraded.

type RowArray = ReadonlyArray<Record<string, unknown>>;

function safe<T>(rows: RowArray | null | undefined): ReadonlyArray<T> {
  return (rows ?? []) as unknown as ReadonlyArray<T>;
}

// Programs: every row, ordered by sort_order then title.
export const getAllPrograms = cache(
  async (): Promise<ReadonlyArray<Program>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return safe<Program>(data);
    } catch (e) {
      logger.error('admin.getAllPrograms failed', describeError(e));
      return [];
    }
  },
);

// Grades: every row, ordered by sort_order.
export const getAllGrades = cache(
  async (): Promise<ReadonlyArray<Grade>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('grades')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return safe<Grade>(data);
    } catch (e) {
      logger.error('admin.getAllGrades failed', describeError(e));
      return [];
    }
  },
);

// Courses: every row, ordered by created_at desc.
export const getAllCourses = cache(
  async (): Promise<ReadonlyArray<Course>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return safe<Course>(data);
    } catch (e) {
      logger.error('admin.getAllCourses failed', describeError(e));
      return [];
    }
  },
);

// Chapters: every row, ordered by (course_id, sort_order).
export const getAllChapters = cache(
  async (): Promise<ReadonlyArray<Chapter>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .order('course_id', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return safe<Chapter>(data);
    } catch (e) {
      logger.error('admin.getAllChapters failed', describeError(e));
      return [];
    }
  },
);

// Sessions: every row, ordered by (chapter_id, position).
export const getAllSessions = cache(
  async (): Promise<ReadonlyArray<Session>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('chapter_id', { ascending: true })
        .order('position', { ascending: true });
      if (error) throw error;
      return safe<Session>(data);
    } catch (e) {
      logger.error('admin.getAllSessions failed', describeError(e));
      return [];
    }
  },
);

// Session grants (the v2 unit-of-payment). All rows.
export const getAllSessionGrants = cache(
  async (): Promise<ReadonlyArray<SessionGrant>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('session_grants')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return safe<SessionGrant>(data);
    } catch (e) {
      logger.error('admin.getAllSessionGrants failed', describeError(e));
      return [];
    }
  },
);

// Session bookings: all rows, ordered by scheduled_start desc.
export const getAllSessionBookings = cache(
  async (): Promise<ReadonlyArray<SessionBooking>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('session_bookings')
        .select('*')
        .order('scheduled_start', { ascending: false });
      if (error) throw error;
      return safe<SessionBooking>(data);
    } catch (e) {
      logger.error('admin.getAllSessionBookings failed', describeError(e));
      return [];
    }
  },
);

// Students: profiles with role='student', ordered by created_at desc.
export const getAllStudents = cache(
  async (): Promise<ReadonlyArray<Record<string, unknown>>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReadonlyArray<Record<string, unknown>>;
    } catch (e) {
      logger.error('admin.getAllStudents failed', describeError(e));
      return [];
    }
  },
);

// Single session lookup. Used by the admin "edit session"
// page (Sprint 3.6 §4.5). The boundary cast (CLAUDE.md
// §3.9) is applied here, not in the page, so the RSC gets
// a fully-typed Session row.
export const getSessionById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      logger.error('admin.getSessionById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

// =====================================================================
// Sprint 3.8 — single-row lookups for the Admin Manual CRUD plan
// (§7). Each helper is cache()-wrapped, returns null on miss or
// read failure, and is the parent-row loader for the new edit
// pages. The boundary cast is applied here, not in the RSC, so the
// page gets a strongly-typed row (CLAUDE.md §3.9).
// =====================================================================

export const getProgramById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      logger.error('admin.getProgramById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

export const getGradeById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('grades')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      logger.error('admin.getGradeById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

export const getCourseById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      logger.error('admin.getCourseById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

export const getChapterById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('chapters')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Record<string, unknown> | null;
    } catch (e) {
      logger.error('admin.getChapterById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

// Pre-fill `position` in the session-create form. Returns
// max(position)+1 for the chapter, or 1 when the chapter has no
// sessions yet. The admin can override the value; collisions
// surface as 409 from POST /api/sessions (the existing unique
// constraint on (chapter_id, position)).
export const getNextSessionPosition = cache(
  async (chapterId: string): Promise<number> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('sessions')
        .select('position')
        .eq('chapter_id', chapterId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as { position: number } | null;
      return (row?.position ?? 0) + 1;
    } catch (e) {
      logger.error('admin.getNextSessionPosition failed', {
        chapterId,
        ...describeError(e),
      });
      return 1;
    }
  },
);
