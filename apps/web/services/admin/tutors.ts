import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { ApiError, Conflict, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { AdminTutorCreateInput } from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — Standalone tutor architecture.
//
// Tutors are now standalone reference records in `public.tutors`.
// They are NOT users, do NOT have a `profile_id`, do NOT have an
// auth account, and the service does NOT call any auth.admin API.
//
// The admin tutor CRUD surface reads + writes this table directly
// (RLS is admin-only on `public.tutors` — see migration
// 20260707000006 §tutors).
//
// All helpers are cache()-wrapped, return [] / null on read
// failure (never throw), and apply the boundary cast at this
// layer (CLAUDE.md §3.9) so the RSC pages get strongly-typed
// shapes.
// =====================================================================

/** Row shape returned by the standalone-tutor select. */
interface TutorRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const ADMIN_TUTOR_SELECT =
  'id, full_name, email, phone, status, notes, created_at, updated_at';

/** Admin-shaped tutor. The page consumes this. */
export interface AdminTutor {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function toAdminTutor(row: TutorRow): AdminTutor {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone ?? null,
    status: row.status,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Every tutor (active + inactive), ordered by created_at desc.
 * Used by /admin/tutors.
 */
export const getAllTutors = cache(async (): Promise<ReadonlyArray<AdminTutor>> => {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('tutors')
      .select(ADMIN_TUTOR_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as TutorRow[]).map(toAdminTutor);
  } catch (e) {
    logger.error('admin.getAllTutors failed', describeError(e));
    return [];
  }
});

/** Single tutor (admin variant). Used by /admin/tutors/[id]. */
export const getTutorById = cache(
  async (id: string): Promise<AdminTutor | null> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('tutors')
        .select(ADMIN_TUTOR_SELECT)
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return toAdminTutor(data as unknown as TutorRow);
    } catch (e) {
      logger.error('admin.getTutorById failed', { id, ...describeError(e) });
      return null;
    }
  },
);

/** Per-tutor booking counts. `active` excludes cancelled / no_show. */
export interface TutorCounts {
  active: number;
  total: number;
}

export const getTutorCounts = cache(
  async (tutorId: string): Promise<TutorCounts> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      // Two cheap counts on the session_bookings.tutor_id FK
      // index. We avoid a single grouped query so the response
      // shape stays a stable {active,total} object.
      const { count: total, error: e1 } = await supabase
        .from('session_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId);
      if (e1) throw e1;
      const { count: active, error: e2 } = await supabase
        .from('session_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .not('status', 'in', '(cancelled,no_show)');
      if (e2) throw e2;
      return { active: active ?? 0, total: total ?? 0 };
    } catch (e) {
      logger.error('admin.getTutorCounts failed', { tutorId, ...describeError(e) });
      return { active: 0, total: 0 };
    }
  },
);

/** Sessions assigned to a tutor, joined with the full curriculum chain. */
export interface AssignedSession {
  id: string;
  title: string;
  slug: string;
  position: number;
  is_published: boolean;
  chapter: { id: string; title: string; slug: string };
  course: { id: string; title: string; slug: string };
  program: { id: string; title: string; slug: string } | null;
  grade: { id: string; title: string; slug: string } | null;
}

export const getSessionsForTutor = cache(
  async (tutorId: string): Promise<ReadonlyArray<AssignedSession>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('sessions')
        .select(
          'id, title, slug, position, is_published, chapter:chapters!inner(id, title, slug, course:courses!inner(id, title, slug, program:programs(id, title, slug), grade:grades(id, title, slug)))',
        )
        .eq('tutor_id', tutorId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      return rows.map((r) => {
        const chapterRaw = r['chapter'] as Record<string, unknown> | Record<string, unknown>[] | null;
        const chapter = Array.isArray(chapterRaw) ? (chapterRaw[0] ?? null) : chapterRaw;
        const courseRaw = (chapter?.['course'] ?? null) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
        const course = Array.isArray(courseRaw) ? (courseRaw[0] ?? null) : courseRaw;
        const programRaw = (course?.['program'] ?? null) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
        const program = Array.isArray(programRaw) ? (programRaw[0] ?? null) : programRaw;
        const gradeRaw = (course?.['grade'] ?? null) as
          | Record<string, unknown>
          | Record<string, unknown>[]
          | null;
        const grade = Array.isArray(gradeRaw) ? (gradeRaw[0] ?? null) : gradeRaw;
        return {
          id: r['id'] as string,
          title: r['title'] as string,
          slug: r['slug'] as string,
          position: r['position'] as number,
          is_published: r['is_published'] as boolean,
          chapter: {
            id: chapter?.['id'] as string,
            title: chapter?.['title'] as string,
            slug: chapter?.['slug'] as string,
          },
          course: {
            id: course?.['id'] as string,
            title: course?.['title'] as string,
            slug: course?.['slug'] as string,
          },
          program: program
            ? {
                id: program['id'] as string,
                title: program['title'] as string,
                slug: program['slug'] as string,
              }
            : null,
          grade: grade
            ? {
                id: grade['id'] as string,
                title: grade['title'] as string,
                slug: grade['slug'] as string,
              }
            : null,
        } satisfies AssignedSession;
      });
    } catch (e) {
      logger.error('admin.getSessionsForTutor failed', { tutorId, ...describeError(e) });
      return [];
    }
  },
);

/**
 * Create a tutor. The tutors table is a standalone reference
 * table (no auth.users, no profiles). The admin tutor-create
 * form supplies the standalone fields (full_name, email,
 * phone, status, notes). There is NO password, NO auth login,
 * NO tutor-side UI.
 *
 * Returns the created `AdminTutor`. Throws `ApiError(409)` on a
 * unique-constraint collision (e.g. duplicate email) and
 * propagates lower-level errors as `ApiError(500)`.
 */
export async function createTutor(input: AdminTutorCreateInput): Promise<AdminTutor> {
  const supabase = await createSupabaseServerClientUntyped();

  const tutorInsert = {
    full_name: input.full_name,
    email: input.email,
    phone: input.phone ?? null,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
  };
  try {
    const { data: tutorRow, error: tutorErr } = await supabase
      .from('tutors')
      .insert(tutorInsert as never)
      .select(ADMIN_TUTOR_SELECT)
      .single();
    if (tutorErr) {
      if ((tutorErr as { code?: string }).code === '23505') {
        throw Conflict('A tutor with this email already exists.');
      }
      throw tutorErr;
    }
    return toAdminTutor(tutorRow as unknown as TutorRow);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    logger.error('admin.createTutor: insert failed', describeError(e));
    throw new ApiError(500, 'tutor_create_failed', 'Could not create tutor row.', {
      reason: describeError(e).message,
    });
  }
}
