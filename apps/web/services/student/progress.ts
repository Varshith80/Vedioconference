import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type {
  Program,
  SessionGrant,
  SessionBooking,
} from '@/types/domain';

/**
 * `services/student/progress.ts` — real learning progress for
 * the student dashboard.
 *
 * Per the Sprint 3.5 curriculum model:
 *   - A student buys access to a session by creating an
 *     `active` `session_grant` (PAYG, pack, or subscription).
 *   - The student then books the session at a specific slot,
 *     which produces a `session_bookings` row whose
 *     `session_grant_id` points back at the grant.
 *   - A booking is `completed` once the tutor marks the
 *     session as done.
 *
 * The progress for a program/course is therefore:
 *
 *     purchased  = count(session_grants where status='active')
 *     booked     = count(session_bookings where status in
 *                    ('confirmed', 'scheduled', 'completed'))
 *     completed  = count(session_bookings where status='completed')
 *     percent    = purchased === 0 ? 0 :
 *                  round(100 * completed / purchased)
 *
 * Pure read; no mutations; RLS-respecting server client.
 */

export interface ProgramProgress {
  program: Program;
  course: { id: string; title: string; slug: string } | null;
  purchased: number;
  booked: number;
  completed: number;
  /** 0..100, integer. 0 when purchased === 0. */
  percent: number;
}

export interface StudentProgressSummary {
  programs: ReadonlyArray<ProgramProgress>;
  totals: {
    purchased: number;
    booked: number;
    completed: number;
  };
  hasAny: boolean;
}

interface RawGrantRow {
  id: string;
  status: SessionGrant['status'];
  session_id: string | null;
  grant_type: SessionGrant['grant_type'];
}

interface RawBookingRow {
  id: string;
  status: SessionBooking['status'];
  session_grant_id: string;
}

/**
 * Fetch the current student's real progress, grouped by
 * program. Returns a flat list (one entry per program the
 * student has any grant for) plus aggregate totals. RLS
 * scopes the read to `auth.uid() = student_id`.
 */
export const getStudentProgress = cache(
  async (studentId: string): Promise<StudentProgressSummary> => {
    try {
      const supabase = await createSupabaseServerClient();

      // 1. Pull the student's grants with the joined
      //    session → chapter → course → program chain.
      //    `session_grants.course_id` does NOT exist in the
      //    schema — courses are reached via
      //    `sessions.chapter_id → chapters.course_id`. Pack
      //    and subscription grants have `session_id = NULL`
      //    and therefore no course (they're bucketed under
      //    a synthetic "Pack 10" program below).
      const { data: grantRows, error: gErr } = await supabase
        .from('session_grants')
        .select(
          'id, status, session_id, grant_type, session:sessions(id, chapter:chapters(id, course:courses(id, slug, title, program_id, grade_id, program:programs(id, slug, title, description, metadata))))',
        )
        .eq('student_id', studentId)
        .in('status', ['active', 'completed']);
      if (gErr) throw gErr;

      const grants = (grantRows ?? []) as unknown as ReadonlyArray<
        RawGrantRow & {
          session: {
            id: string;
            chapter: {
              id: string;
              course: {
                id: string;
                slug: string;
                title: string;
                program: Program | null;
              } | null;
            } | null;
          } | null;
        }
      >;

      if (grants.length === 0) {
        return {
          programs: [],
          totals: { purchased: 0, booked: 0, completed: 0 },
          hasAny: false,
        };
      }

      // 2. Pull the student's bookings, scoped to the grants
      //    we just fetched. We restrict to `student_id =
      //    auth.uid()` so RLS also enforces it; the
      //    `in('session_grant_id', ...)` filter just trims
      //    bytes.
      const grantIds = grants.map((g) => g.id);
      const { data: bookingRows, error: bErr } = await supabase
        .from('session_bookings')
        .select('id, status, session_grant_id')
        .eq('student_id', studentId)
        .in('session_grant_id', grantIds);
      if (bErr) throw bErr;

      const bookings = (bookingRows ?? []) as unknown as ReadonlyArray<RawBookingRow>;

      // 3. Bucket per-program. A grant without a course
      //    (e.g. a pack pool) is grouped under a synthetic
      //    "__pack__" key so it still shows on the dashboard.
      const byProgram = new Map<
        string,
        {
          program: Program;
          course: { id: string; title: string; slug: string } | null;
          purchased: number;
          bookedSet: Set<string>;
          completedSet: Set<string>;
        }
      >();

      const upsertBucket = (
        program: Program,
        course: { id: string; title: string; slug: string } | null,
      ): {
        program: Program;
        course: { id: string; title: string; slug: string } | null;
        purchased: number;
        bookedSet: Set<string>;
        completedSet: Set<string>;
      } => {
        const key = program.id;
        const existing = byProgram.get(key);
        if (existing) {
          return existing;
        }
        const bucket = {
          program,
          course,
          purchased: 0,
          bookedSet: new Set<string>(),
          completedSet: new Set<string>(),
        };
        byProgram.set(key, bucket);
        return bucket;
      };

      // Bucket index by grant id for O(1) booking lookup.
      const grantBucket = new Map<string, ReturnType<typeof upsertBucket>>();

      for (const g of grants) {
        const courseFull = g.session?.chapter?.course ?? null;
        const course: { id: string; title: string; slug: string } | null =
          courseFull
            ? {
                id: courseFull.id,
                title: courseFull.title,
                slug: courseFull.slug,
              }
            : null;
        const program: Program = courseFull?.program ?? syntheticPackProgram();
        const bucket = upsertBucket(program, course);
        bucket.purchased += 1;
        grantBucket.set(g.id, bucket);
      }

      for (const b of bookings) {
        const bucket = grantBucket.get(b.session_grant_id);
        if (!bucket) continue;
        if (b.status === 'completed') {
          bucket.completedSet.add(b.id);
          bucket.bookedSet.add(b.id);
        } else if (b.status === 'confirmed' || b.status === 'scheduled' || b.status === 'pending_payment') {
          bucket.bookedSet.add(b.id);
        }
      }

      const programs: ProgramProgress[] = Array.from(byProgram.values()).map((b) => {
        const purchased = b.purchased;
        const completed = b.completedSet.size;
        const booked = b.bookedSet.size;
        const percent =
          purchased === 0
            ? 0
            : Math.max(0, Math.min(100, Math.round((100 * completed) / purchased)));
        return {
          program: b.program,
          course: b.course,
          purchased,
          booked,
          completed,
          percent,
        };
      });

      // Sort: most progress first, then by purchased desc.
      programs.sort((a, b) => {
        if (b.percent !== a.percent) return b.percent - a.percent;
        if (b.purchased !== a.purchased) return b.purchased - a.purchased;
        return a.program.title.localeCompare(b.program.title);
      });

      const totals = programs.reduce(
        (acc, p) => ({
          purchased: acc.purchased + p.purchased,
          booked: acc.booked + p.booked,
          completed: acc.completed + p.completed,
        }),
        { purchased: 0, booked: 0, completed: 0 },
      );

      return { programs, totals, hasAny: totals.purchased > 0 };
    } catch (e) {
      logger.error('getStudentProgress failed', { studentId, ...describeError(e) });
      return {
        programs: [],
        totals: { purchased: 0, booked: 0, completed: 0 },
        hasAny: false,
      };
    }
  },
);

/**
 * Synthetic program for pack/subscription grants that
 * aren't yet attached to a course. Keeps the bucket
 * shape uniform and renders as a single "Pack 10" row
 * on the dashboard.
 */
function syntheticPackProgram(): Program {
  return {
    id: '__pack__',
    slug: 'pack',
    title: 'Pack 10',
    description: null,
    metadata: {},
  } as unknown as Program;
}
