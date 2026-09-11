import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import {
  ApiError,
  Conflict,
  NotFound,
  describeError,
  notNullViolationToBadRequest,
  rlsErrorToForbidden,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { AdminTutorCreateInput } from '@/lib/validations/admin-catalog';

// Supabase client type — the untyped SSR client. Aliased here so
// the optional `supabase` parameter below has a single, locally
// visible shape. We don't import the SupabaseClient type
// directly because the untyped factory returns a structural
// type that varies by version, and we only consume `.from()`
// / `.insert()` / `.select()` / `.single()`.
type SupabaseClient = Awaited<
  ReturnType<typeof createSupabaseServerClientUntyped>
>;

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
// All helpers are cache()-wrapped. The list-page helpers
// (`getAllTutors`) NO LONGER swallow errors; they throw so the
// calling page can build an `AdminFetchResult` envelope through
// `safeAdminFetch()` (see `services/admin/admin-fetch.ts`).
// Single-row helpers (`getTutorById`, `countUpcomingBookingsForTutor`)
// return `null` / `0` on miss because their callers
// (`notFound()`, the delete-button guard) treat that as a
// legitimate signal.
//
// The boundary cast is applied at this layer (CLAUDE.md §3.9)
// so the RSC pages get strongly-typed shapes.
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
 *
 * Throws on Supabase error so the admin page can build an
 * `AdminFetchResult` envelope (state: 'error').
 */
export const getAllTutors = cache(async (): Promise<ReadonlyArray<AdminTutor>> => {
  const supabase = await createSupabaseServerClientUntyped();
  const { data, error } = await supabase
    .from('tutors')
    .select(ADMIN_TUTOR_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as TutorRow[]).map(toAdminTutor);
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
 * The optional `supabase` parameter is the same user-context
 * client returned by `requireAdminRoute()`. Passing it in
 * (instead of creating a fresh one) keeps the route-handler
 * pattern consistent with every other admin route handler
 * (`/api/admin/courses/[id]`, `/api/admin/import-excel`) and
 * guarantees the INSERT runs with the exact same session
 * cookies / Authorization header that the role check
 * approved. A fresh client is created when the parameter is
 * omitted, so existing callers (tests, server actions) are
 * not broken.
 *
 * Returns the created `AdminTutor`. Throws:
 *   - `ApiError(403)` when the RLS policy `tutors_admin_all`
 *     rejects the write (Postgres SQLSTATE 42501). This is
 *     the authoritative "you are signed in but not allowed
 *     to write to this row" signal — distinct from a generic
 *     500 so the API can surface a structured error to the
 *     admin UI.
 *   - `ApiError(409)` on a unique-constraint collision
 *     (duplicate email).
 *   - `ApiError(500)` only for unexpected non-RLS failures
 *     (network, etc.).
 */
export async function createTutor(
  input: AdminTutorCreateInput,
  supabase?: SupabaseClient,
): Promise<AdminTutor> {
  // Prefer the caller-provided client (the one the role check
  // already approved). Fall back to a fresh one for back-compat
  // with callers that haven't been refactored to pass one in
  // (notably the vitest test suite).
  const client = supabase ?? (await createSupabaseServerClientUntyped());

  const tutorInsert = {
    full_name: input.full_name,
    email: input.email,
    phone: input.phone ?? null,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
  };
  try {
    const { data: tutorRow, error: tutorErr } = await client
      .from('tutors')
      .insert(tutorInsert as never)
      .select(ADMIN_TUTOR_SELECT)
      .single();
    if (tutorErr) {
      // Postgres unique-constraint violation → 409 Conflict.
      if ((tutorErr as { code?: string }).code === '23505') {
        throw Conflict('A tutor with this email already exists.');
      }
      // Postgres not-null violation (SQLSTATE 23502) → 400 Bad
      // Request. The request payload was structurally valid but
      // omitted a column the remote schema requires. We surface
      // the column name in `details.column` so the admin UI can
      // tell the operator "Column X is required" instead of an
      // opaque 500. This is the diagnostic hook the operator
      // needs to spot when the remote `tutors` table has been
      // extended with extra NOT NULL columns that the v2 form
      // doesn't supply (the v1→v2 reshape migration only handled
      // a different v1 shape, so the operator can land here
      // legitimately).
      const notNull = notNullViolationToBadRequest(tutorErr);
      if (notNull) throw notNull;
      // Postgres row-level security violation (SQLSTATE 42501)
      // → 403 Forbidden. The caller is authenticated, but the
      // `tutors_admin_all` policy on `public.tutors` rejected
      // the write. This is distinct from a 500 because the
      // admin UI needs to be able to tell "I tried, the DB
      // said no" apart from "something went wrong on the
      // server". The underlying message is preserved in
      // `details.reason` for log/diagnostics.
      const rls = rlsErrorToForbidden(tutorErr, 'INSERT');
      if (rls) throw rls;
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

/**
 * How many future-dated bookings this tutor has, excluding the
 * terminal states (`cancelled`, `no_show`, `completed`). This is
 * the "upcoming assigned sessions" check the admin delete button
 * uses to refuse to delete a tutor who is still responsible for
 * a future live session.
 *
 * We intentionally use a future-time predicate instead of
 * `getTutorCounts(id).total > 0` so that tutors who only have
 * historical completed/cancelled bookings can be safely
 * archived (the platform should not let history block a clean
 * delete — history is immutable and the row's tutor_id is part
 * of that history).
 *
 * Returns 0 on any read error so the delete UI degrades to
 * "safe" (we'd rather let a deletion through than block a
 * legitimate admin action because a count query failed). The
 * actual delete still goes through RLS and the foreign keys
 * below, so the row cannot be removed if it really does have
 * dependents — `session_bookings.tutor_id` is `ON DELETE
 * RESTRICT`, so a hidden booking will still surface as a
 * Postgres `23503` violation.
 */
export const countUpcomingBookingsForTutor = cache(
  async (tutorId: string): Promise<number> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { count, error } = await supabase
        .from('session_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .gt('scheduled_start', new Date().toISOString())
        .not('status', 'in', '(cancelled,no_show,completed)');
      if (error) throw error;
      return count ?? 0;
    } catch (e) {
      logger.error('admin.countUpcomingBookingsForTutor failed', {
        tutorId,
        ...describeError(e),
      });
      return 0;
    }
  },
);

/**
 * Delete a tutor by id. Used by the trash icon on /admin/tutors.
 *
 * The business rule is "tutors with upcoming assigned sessions
 * cannot be deleted — they must be unassigned first". We model
 * "upcoming assigned sessions" as live bookings whose
 * `scheduled_start` is still in the future (the booking is the
 * concrete scheduled occurrence; a session with `sessions.tutor_id`
 * set but no booking yet is not "upcoming" — it's just assigned,
 * and the admin can clear that in two clicks on /admin/sessions).
 *
 * Throws:
 *   - `ApiError(404)` when the tutor does not exist (or was
 *     already deleted by another admin between the page load
 *     and the DELETE call).
 *   - `ApiError(409)` when the tutor still has at least one
 *     upcoming booking. The admin UI surfaces the message
 *     verbatim; it tells the operator to unassign the tutor
 *     from /admin/sessions first.
 *   - `ApiError(403)` on a Postgres 42501 (RLS) violation —
 *     same `rlsErrorToForbidden` translation as the other
 *     admin mutations.
 *   - `ApiError(500)` only for unexpected non-RLS failures.
 *
 * `session_bookings.tutor_id` is `ON DELETE RESTRICT`, so the
 * `session_bookings` count check is a UX guard, not a data-
 * integrity guard. The foreign key is the real safety net:
 * if the count check is bypassed (e.g. a booking is created in
 * the same instant), Postgres still refuses the DELETE and we
 * translate the `23503` into a 409.
 */
// =====================================================================
// Sprint 8 follow-up — pre-flight blocker summary.
//
// The previous pre-flight only counted FUTURE active session_bookings
// (via `countUpcomingBookingsForTutor`). That left a hole: a tutor
// with only past / terminal bookings passed the pre-flight, the actual
// DELETE then hit the `session_bookings_tutor_id_fkey` constraint
// (ON DELETE RESTRICT, regardless of status), and the operator saw a
// bare 409 with no actionable detail.
//
// `inspectTutorDeletionBlockers(id)` is the broader pre-flight. It
// returns every row that would prevent the tutor row from being
// deleted, broken down by kind + table, so the API can build a
// precise 409 response and the admin UI can render a message the
// operator can act on. SET-NULL FKs (`sessions`, `resources`) are
// reported as informational blockers — they don't stop the DELETE,
// but the operator should know "deleting will unassign N sessions".
// =====================================================================
export interface TutorDeletionBlocker {
  /** Why this row prevents (or would affect) deletion. */
  kind:
    | 'upcoming_booking'
    | 'historical_booking'
    | 'terminal_booking'
    | 'assigned_session'
    | 'uploaded_resource'
    | 'read_error';
  /** The SQL table the blocker lives in. */
  table: string;
  /** How many rows of this kind reference the tutor. */
  count: number;
}

export const inspectTutorDeletionBlockers = cache(
  async (tutorId: string): Promise<ReadonlyArray<TutorDeletionBlocker>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const nowIso = new Date().toISOString();

      // (1) session_bookings is the only live RESTRICT FK. Bucket
      //     every row by future/terminal/historical so the UI can
      //     tell the operator "1 future + 2 historical" — the
      //     future ones are still actionable, the historical ones
      //     explain why the row is genuinely locked.
      const { data: bookingRows, error: bookErr } = await supabase
        .from('session_bookings')
        .select('id, scheduled_start, status')
        .eq('tutor_id', tutorId);
      if (bookErr) throw bookErr;

      let upcoming = 0;
      let historical = 0;
      let terminal = 0;
      for (const r of (bookingRows ?? []) as Array<{
        id: unknown;
        scheduled_start: string;
        status: string;
      }>) {
        if (r.status === 'cancelled' || r.status === 'no_show' || r.status === 'completed') {
          terminal += 1;
        } else if (r.scheduled_start > nowIso) {
          upcoming += 1;
        } else {
          historical += 1;
        }
      }

      // (2) sessions.tutor_id is ON DELETE SET NULL — does not
      //     block, but reported so the operator sees the side
      //     effect of the delete.
      const { count: sessionCount, error: sessErr } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .not('tutor_id', 'is', null);
      if (sessErr) throw sessErr;

      // (3) resources.tutor_id is also SET NULL — same story.
      const { count: resourceCount, error: resErr } = await supabase
        .from('resources')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId)
        .not('tutor_id', 'is', null);
      if (resErr) throw resErr;

      const blockers: TutorDeletionBlocker[] = [];
      if (upcoming > 0) {
        blockers.push({ kind: 'upcoming_booking', table: 'session_bookings', count: upcoming });
      }
      if (historical > 0) {
        blockers.push({ kind: 'historical_booking', table: 'session_bookings', count: historical });
      }
      if (terminal > 0) {
        blockers.push({ kind: 'terminal_booking', table: 'session_bookings', count: terminal });
      }
      if ((sessionCount ?? 0) > 0) {
        blockers.push({ kind: 'assigned_session', table: 'sessions', count: sessionCount ?? 0 });
      }
      if ((resourceCount ?? 0) > 0) {
        blockers.push({ kind: 'uploaded_resource', table: 'resources', count: resourceCount ?? 0 });
      }
      return blockers;
    } catch (e) {
      // Refuse safely rather than racing the DELETE against an
      // unknown state. The operator gets a 409 with a single
      // `read_error` blocker so they know to retry, instead of
      // an opaque 500 from a 23503 that lands after the
      // pre-flight gave the all-clear.
      logger.error('admin.inspectTutorDeletionBlockers failed', {
        tutorId,
        ...describeError(e),
      });
      return [{ kind: 'read_error', table: '(preflight)', count: 0 }];
    }
  },
);

export async function deleteTutor(
  id: string,
  supabase?: SupabaseClient,
): Promise<{ id: string }> {
  const client = supabase ?? (await createSupabaseServerClientUntyped());

  // Broad pre-flight: refuse early with a structured message if
  // ANY dependent row would prevent the DELETE. The historical /
  // upcoming / terminal breakdown is what the operator needs to
  // pick the right next step (reassign the future bookings, then
  // either delete again, or set status='inactive' to keep the
  // history attributable to the tutor). The FK is still the
  // data-integrity guard; the pre-flight is the UX guard.
  const blockers = await inspectTutorDeletionBlockers(id);
  const hardBlockers = blockers.filter(
    (b) => b.kind === 'upcoming_booking'
        || b.kind === 'historical_booking'
        || b.kind === 'terminal_booking'
        || b.kind === 'read_error',
  );
  if (hardBlockers.length > 0) {
    const hasUpcoming = hardBlockers.some((b) => b.kind === 'upcoming_booking');
    const hasReadError = hardBlockers.some((b) => b.kind === 'read_error');
    // Two distinct operator paths: (a) "unassign future bookings
    // first" is the right next step when there are future live
    // bookings; (b) "use status='inactive' to keep the tutor in
    // history" is the right step when only past / terminal
    // bookings remain. The message is short and consistent so
    // the UI can render it verbatim.
    const message = hasReadError
      ? 'Could not verify the tutor’s dependent records. Please retry.'
      : hasUpcoming
        ? 'This tutor has upcoming assigned sessions. Unassign them from /admin/sessions first, or set the tutor’s status to “inactive” to keep them in the history.'
        : 'This tutor cannot be deleted because they are still referenced by one or more bookings. Set the tutor’s status to “inactive” to keep them in the history without blocking future edits.';
    throw Conflict(message, {
      code: 'tutor_has_dependents',
      blockers,
    });
  }

  try {
    const { error, count } = await client
      .from('tutors')
      .delete({ count: 'exact' })
      .eq('id', id);
    if (error) {
      // Defence in depth: the pre-flight above should have caught
      // every session_bookings reference. If we still see a 23503
      // (e.g. a booking was created in the same instant as the
      // pre-flight read, or an unrelated RESTRICT FK appears),
      // surface it as a 409 with the raw detail so the operator
      // can see what blocked them.
      if ((error as { code?: string }).code === '23503') {
        throw Conflict(
          'This tutor cannot be deleted because they are still referenced by other records. Set the tutor’s status to “inactive” to keep them in the history.',
          { code: 'tutor_has_dependents', detail: (error as { message?: string }).message },
        );
      }
      const rls = rlsErrorToForbidden(error, 'DELETE');
      if (rls) throw rls;
      throw error;
    }
    // `count` here is the number of rows the delete affected.
    // PostgREST reports `null` for some auth/RLS scenarios
    // instead of 0, so we treat null as "did not delete".
    if (count === 0) {
      throw NotFound('Tutor not found.');
    }
    return { id };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    logger.error('admin.deleteTutor: delete failed', {
      id,
      ...describeError(e),
    });
    throw new ApiError(500, 'tutor_delete_failed', 'Could not delete tutor row.', {
      reason: describeError(e).message,
    });
  }
}
