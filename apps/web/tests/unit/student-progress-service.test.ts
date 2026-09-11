import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the student progress service. The service
// issues two Supabase queries (grants + bookings) and
// aggregates the results per-program with a percent
// complete. We mock the untyped server client so the
// queries return canned data; the test asserts the
// bucket shape (per program, per status) and the
// derived percent.

// ----- Mocks ------------------------------------------------------------

// `from('session_grants')` and `from('session_bookings')` are
// each called once per `getStudentProgress` invocation, in
// that order. We track which query we're handling and return
// the right canned chain.
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { getStudentProgress } from '@/services/student/progress';

// ----- Helpers -----------------------------------------------------------

/** A thenable chainable that resolves with the canned shape
 *  when the caller awaits the chain. Applies the in() and
 *  eq() filters in-memory so the test exercises the same
 *  narrowing the production Supabase wire would do. */
function buildChain(
  data: ReadonlyArray<Record<string, unknown>> | null,
  error: unknown = null,
) {
  let rows: ReadonlyArray<Record<string, unknown>> = data ?? [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: (_col: string, val: unknown) => {
      rows = rows.filter((r) => r[_col] === val);
      return chain;
    },
    in: (_col: string, allowed: ReadonlyArray<unknown>) => {
      rows = rows.filter((r) => allowed.includes(r[_col]));
      return chain;
    },
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve({ data: rows, error }),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
  mockIn.mockReset();
});

/** Helper to queue canned grant + booking responses for one
 *  `getStudentProgress` invocation. */
function queueResponses(
  grantRows: ReadonlyArray<Record<string, unknown>>,
  bookingRows: ReadonlyArray<Record<string, unknown>>,
) {
  mockFrom
    .mockReturnValueOnce(buildChain(grantRows))
    .mockReturnValueOnce(buildChain(bookingRows));
}

// ----- Tests ------------------------------------------------------------

describe('getStudentProgress', () => {
  it('returns hasAny=false and zeroed totals when the student has no grants', async () => {
    queueResponses([], []);
    const r = await getStudentProgress('student-1');
    expect(r.hasAny).toBe(false);
    expect(r.programs).toEqual([]);
    expect(r.totals).toEqual({ purchased: 0, booked: 0, completed: 0 });
  });

  it('counts purchased = active+completed grants and derives 0% when no bookings exist', async () => {
    const grants = [
      grantRow({
        id: 'g1',
        status: 'active',
        sessionId: 's1',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g2',
        status: 'completed',
        sessionId: 's2',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
    ];
    queueResponses(grants, []);
    const r = await getStudentProgress('student-1');
    expect(r.hasAny).toBe(true);
    expect(r.programs).toHaveLength(1);
    expect(r.programs[0]?.purchased).toBe(2);
    expect(r.programs[0]?.completed).toBe(0);
    expect(r.programs[0]?.booked).toBe(0);
    expect(r.programs[0]?.percent).toBe(0);
    expect(r.totals).toEqual({ purchased: 2, booked: 0, completed: 0 });
  });

  it('counts completed bookings and derives the percent correctly', async () => {
    const grants = [
      grantRow({
        id: 'g1',
        status: 'active',
        sessionId: 's1',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g2',
        status: 'active',
        sessionId: 's2',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g3',
        status: 'active',
        sessionId: 's3',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g4',
        status: 'active',
        sessionId: 's4',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
    ];
    const bookings = [
      bookingRow({ id: 'b1', status: 'completed', grantId: 'g1' }),
      bookingRow({ id: 'b2', status: 'completed', grantId: 'g2' }),
      bookingRow({ id: 'b3', status: 'scheduled', grantId: 'g3' }),
    ];
    queueResponses(grants, bookings);
    const r = await getStudentProgress('student-1');
    expect(r.programs[0]?.purchased).toBe(4);
    expect(r.programs[0]?.completed).toBe(2);
    expect(r.programs[0]?.booked).toBe(3);
    expect(r.programs[0]?.percent).toBe(50);
  });

  it('groups grants per program and sums the totals across programs', async () => {
    const grants = [
      grantRow({
        id: 'g1',
        status: 'active',
        sessionId: 's1',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g2',
        status: 'active',
        sessionId: 's2',
        chapterId: 'ch2',
        courseId: 'c2',
        programId: 'p2',
      }),
    ];
    const bookings = [
      bookingRow({ id: 'b1', status: 'completed', grantId: 'g1' }),
    ];
    queueResponses(grants, bookings);
    const r = await getStudentProgress('student-1');
    expect(r.programs).toHaveLength(2);
    const byId = new Map(r.programs.map((p) => [p.program.id, p]));
    expect(byId.get('p1')?.completed).toBe(1);
    expect(byId.get('p1')?.percent).toBe(100);
    expect(byId.get('p2')?.completed).toBe(0);
    expect(byId.get('p2')?.percent).toBe(0);
    expect(r.totals).toEqual({ purchased: 2, booked: 1, completed: 1 });
  });

  it('excludes pending_payment and cancelled grants (enforced by the in() filter)', async () => {
    // The service issues `.in('status', ['active','completed'])`
    // on the wire; the in-memory mock applies the same
    // filter so the bucket sees only the post-narrowing rows.
    const grants = [
      grantRow({
        id: 'g1',
        status: 'active',
        sessionId: 's1',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g2',
        status: 'pending_payment',
        sessionId: 's2',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
      grantRow({
        id: 'g3',
        status: 'cancelled',
        sessionId: 's3',
        chapterId: 'ch1',
        courseId: 'c1',
        programId: 'p1',
      }),
    ];
    queueResponses(grants, []);
    const r = await getStudentProgress('student-1');
    expect(r.programs[0]?.purchased).toBe(1);
  });

  it('falls back to a synthetic "Pack 10" bucket when a grant has no course', async () => {
    const grants = [
      // pack/subscription grant: no session → no chapter → no course
      {
        id: 'g1',
        student_id: 'student-1',
        status: 'active',
        session_id: null,
        grant_type: 'pack',
        session: null,
      },
    ];
    queueResponses(grants, []);
    const r = await getStudentProgress('student-1');
    expect(r.programs).toHaveLength(1);
    expect(r.programs[0]?.program.id).toBe('__pack__');
    expect(r.programs[0]?.program.title).toBe('Pack 10');
    expect(r.programs[0]?.course).toBeNull();
  });
});

// ----- Fixtures ---------------------------------------------------------

interface GrantArgs {
  id: string;
  status: 'active' | 'completed' | 'pending_payment' | 'cancelled' | 'refunded';
  sessionId: string;
  chapterId: string;
  courseId: string;
  programId: string;
}

function grantRow(args: GrantArgs) {
  return {
    id: args.id,
    student_id: 'student-1',
    status: args.status,
    session_id: args.sessionId,
    grant_type: 'individual',
    session: {
      id: args.sessionId,
      chapter: {
        id: args.chapterId,
        course: {
          id: args.courseId,
          slug: `course-${args.courseId}`,
          title: `Course ${args.courseId}`,
          program: {
            id: args.programId,
            slug: `program-${args.programId}`,
            title: `Program ${args.programId}`,
            description: null,
            metadata: {},
          },
        },
      },
    },
  };
}

interface BookingArgs {
  id: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled' | 'pending_payment';
  grantId: string;
}

function bookingRow(args: BookingArgs) {
  return {
    id: args.id,
    student_id: 'student-1',
    status: args.status,
    session_grant_id: args.grantId,
  };
}
