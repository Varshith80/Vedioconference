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
// Error-state contract (Sprint 9 — P3-1):
// The list-page helpers (`getAll*`) NO LONGER swallow errors.
// A Supabase failure throws so the calling page can build an
// `AdminFetchResult` envelope through `safeAdminFetch()` (see
// `services/admin/admin-fetch.ts`). That gives the operator a
// visible destructive card + Retry instead of a fake "empty"
// list that hides a degraded database.
//
// The single-row helpers (`getXxxById`) still return `null` on
// miss; their callers (`notFound()` in `/admin/[id]/page.tsx`)
// render a 404, which is the correct behaviour for an id that
// genuinely does not exist. Detangling 404-from-RLS-failure is
// a separate, larger refactor and is tracked in Phase 3 of the
// Admin Portal remediation.

type RowArray = ReadonlyArray<Record<string, unknown>>;

function safe<T>(rows: RowArray | null | undefined): ReadonlyArray<T> {
  return (rows ?? []) as unknown as ReadonlyArray<T>;
}

// Programs: every row, ordered by sort_order then title.
//
// Throws on Supabase error so the admin page can build an
// `AdminFetchResult` envelope (state: 'error'). See the file
// header for the contract.
export const getAllPrograms = cache(
  async (): Promise<ReadonlyArray<Program>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('programs')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('title', { ascending: true });
    if (error) throw error;
    return safe<Program>(data);
  },
);

// Grades: every row, ordered by sort_order.
export const getAllGrades = cache(
  async (): Promise<ReadonlyArray<Grade>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('grades')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return safe<Grade>(data);
  },
);

// Courses: every row, ordered by created_at desc.
export const getAllCourses = cache(
  async (): Promise<ReadonlyArray<Course>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('courses')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return safe<Course>(data);
  },
);

// Chapters: every row, ordered by (course_id, sort_order).
export const getAllChapters = cache(
  async (): Promise<ReadonlyArray<Chapter>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('chapters')
      .select('*')
      .order('course_id', { ascending: true })
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return safe<Chapter>(data);
  },
);

// Sessions: every row, ordered by (chapter_id, position).
export const getAllSessions = cache(
  async (): Promise<ReadonlyArray<Session>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('chapter_id', { ascending: true })
      .order('position', { ascending: true });
    if (error) throw error;
    return safe<Session>(data);
  },
);

// Session grants (the v2 unit-of-payment). All rows.
export const getAllSessionGrants = cache(
  async (): Promise<ReadonlyArray<SessionGrant>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_grants')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return safe<SessionGrant>(data);
  },
);

// ---------------------------------------------------------------------
// Payments ledger (admin-only).
//
// Sprint 9 — P1-3 reconciliation: the admin `/admin/payments`
// surface was reading `session_grants` (the entitlement shape)
// and rendering "amount / grant_type / credits / status", which
// read like a payments ledger but actually represented unit-of-
// payment entitlements. The Stripe `payments` table is the
// canonical ledger (one row per Stripe charge / refund), and the
// overview counters service already aggregates from it.
//
// This helper reads the actual ledger rows and joins the linked
// `session_grants` row so the operator can still see the unit
// type (individual / pack / subscription) and consumed credits
// at a glance. RLS still scopes every read through
// `payments_select_via_session_grant` (admin bypass), so the
// service uses the same RLS-respecting client as every other
// admin read.
//
// Throws on read failure so the calling page can build an
// `AdminFetchResult` envelope through `safeAdminFetch()`.
// ---------------------------------------------------------------------
export interface AdminPayment {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  provider: string | null;
  refunded_amount_cents: number | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
  session_grant_id: string | null;
  grant_type: string | null;
  total_credits: number | null;
  consumed_credits: number | null;
}

export const getAllPayments = cache(
  async (): Promise<ReadonlyArray<AdminPayment>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('payments')
      .select(
        `
          id, amount_cents, currency, status, provider,
          refunded_amount_cents, paid_at, refunded_at, created_at,
          session_grant_id,
          grant:session_grants!payments_session_grant_id_fkey (
            grant_type, total_credits, consumed_credits
          )
        `,
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as unknown as Array<{
      id: string;
      amount_cents: number;
      currency: string;
      status: string;
      provider: string | null;
      refunded_amount_cents: number | null;
      paid_at: string | null;
      refunded_at: string | null;
      created_at: string;
      session_grant_id: string | null;
      grant: {
        grant_type: string | null;
        total_credits: number | null;
        consumed_credits: number | null;
      } | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      amount_cents: r.amount_cents,
      currency: r.currency,
      status: r.status,
      provider: r.provider,
      refunded_amount_cents: r.refunded_amount_cents,
      paid_at: r.paid_at,
      refunded_at: r.refunded_at,
      created_at: r.created_at,
      session_grant_id: r.session_grant_id,
      grant_type: r.grant?.grant_type ?? null,
      total_credits: r.grant?.total_credits ?? null,
      consumed_credits: r.grant?.consumed_credits ?? null,
    }));
  },
);

// Session bookings: all rows, ordered by scheduled_start desc.
export const getAllSessionBookings = cache(
  async (): Promise<ReadonlyArray<SessionBooking>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('session_bookings')
      .select('*')
      .order('scheduled_start', { ascending: false });
    if (error) throw error;
    return safe<SessionBooking>(data);
  },
);

// Students: profiles with role='student', ordered by created_at desc.
export const getAllStudents = cache(
  async (): Promise<ReadonlyArray<Record<string, unknown>>> => {
    const supabase = await createSupabaseServerClientUntyped();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReadonlyArray<Record<string, unknown>>;
  },
);

// Single session lookup. Used by the admin "edit session"
// page (Sprint 3.6 §4.5). The boundary cast (CLAUDE.md
// §3.9) is applied here, not in the page, so the RSC gets
// a fully-typed Session row. See UUID_RE for why the regex
// guard at the top is required.
export const getSessionById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    if (!UUID_RE.test(id)) return null;
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

// UUID v4 shape check. Used to short-circuit admin/[id] pages
// when the URL id is not a UUID (e.g. a stale /new link, a copy-
// paste of a non-id segment, browser dev-history). Without this
// guard, Supabase throws `invalid input syntax for type uuid`
// (Postgres 22P02) which the page surfaces as a 500. The page's
// `notFound()` can then handle the case cleanly (404 instead of
// 500). Not a Zod schema (this is a server-side guard, not a
// validation contract); the regex is the same canonical UUID
// shape that Zod's `z.string().uuid()` accepts.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getProgramById = cache(
  async (id: string): Promise<Record<string, unknown> | null> => {
    if (!UUID_RE.test(id)) return null;
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
    if (!UUID_RE.test(id)) return null;
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
    if (!UUID_RE.test(id)) return null;
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
    if (!UUID_RE.test(id)) return null;
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

// Pre-fill `position` in the chapter-create form. Returns
// max(position)+1 for the course, or 1 when the course has no
// chapters yet. The v2 chapters table requires `position`
// (NOT NULL CHECK position > 0); the unique constraint is
// (course_id, position). The admin can override the value;
// collisions surface as 409 from POST /api/chapters.
//
// Mirrors getNextSessionPosition. Both helpers are the only
// places where v2 position values are generated server-side;
// the Excel importer also pre-computes the same value but
// from the workbook row order, not from the DB.
export const getNextChapterPosition = cache(
  async (courseId: string): Promise<number> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { data, error } = await supabase
        .from('chapters')
        .select('position')
        .eq('course_id', courseId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const row = data as { position: number } | null;
      return (row?.position ?? 0) + 1;
    } catch (e) {
      logger.error('admin.getNextChapterPosition failed', {
        courseId,
        ...describeError(e),
      });
      return 1;
    }
  },
);
