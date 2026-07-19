import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — `createSessionBooking` tutor default.
//
// Asserts that when the caller does NOT pass `tutorId` (or passes
// `null`), the new `session_bookings.tutor_id` is taken from the
// parent session's `tutor_id` (Sprint 3.8 plan §11).
//
// We mock the untyped server client. The service runs THREE
// queries against Supabase:
//   1. SELECT * FROM sessions WHERE id = $sessionId
//   2. SELECT * FROM session_grants WHERE id = $sessionGrantId
//   3. INSERT INTO session_bookings (...) RETURNING *
//
// The mock exposes a single `mockFrom` that dispatches by table
// name. Each table returns a thenable chainable object whose
// terminal `.then(...)` resolves to whatever we queued.
// =====================================================================

// ----- Mocks ------------------------------------------------------------

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({ from: mockFrom }),
  ),
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({ from: mockFrom }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const { createSessionBooking } = await import(
  '@/services/curriculum/session-bookings'
);

// ----- Helpers -----------------------------------------------------------

type Result = { data: unknown; error: unknown };

/**
 * Build a per-table handler. The handler's terminal call
 * resolves to `result` regardless of which chain method was
 * called last. We track the most recent INSERT payload so the
 * test can assert what was actually written.
 */
function buildTableHandler(
  result: Result,
  tracker?: { lastInsert: { value: unknown } | null },
) {
  const chain: Record<string, unknown> = {};
  const self = chain;
  self.select = () => self;
  self.eq = () => self;
  self.maybeSingle = () => Promise.resolve(result);
  self.single = () => Promise.resolve(result);
  self.insert = (payload: unknown) => {
    if (tracker) tracker.lastInsert = { value: payload };
    // Make the insert thenable so `await …insert(…)` works.
    const insertChain: Record<string, unknown> = {};
    insertChain.select = () => insertChain;
    insertChain.single = () => Promise.resolve(result);
    insertChain.then = (
      onFulfilled: (v: Result) => unknown,
    ) => Promise.resolve(result).then(onFulfilled);
    return insertChain;
  };
  return self;
}

describe('createSessionBooking — tutor default from parent session', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("inherits the session's tutor_id when the caller omits tutorId", async () => {
    const insertTracker = { lastInsert: null as { value: unknown } | null };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return buildTableHandler({
          data: { id: 'sess-1', tutor_id: 'tutor-AAA' },
          error: null,
        });
      }
      if (table === 'session_grants') {
        return buildTableHandler({
          data: {
            id: 'grant-1',
            session_id: 'sess-1',
            status: 'active',
          },
          error: null,
        });
      }
      if (table === 'session_bookings') {
        return buildTableHandler(
          {
            data: {
              id: 'booking-1',
              student_id: 'student-1',
              session_id: 'sess-1',
              session_grant_id: 'grant-1',
              tutor_id: 'tutor-AAA',
              status: 'scheduled',
            },
            error: null,
          },
          insertTracker,
        );
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const result = await createSessionBooking({
      studentId: 'student-1',
      sessionId: 'sess-1',
      sessionGrantId: 'grant-1',
      scheduledStart: '2026-08-01T10:00:00Z',
      scheduledEnd: '2026-08-01T11:00:00Z',
    });

    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.booking.id).toBe('booking-1');

    // The INSERT must have used the parent session's tutor_id.
    const inserted = insertTracker.lastInsert?.value as {
      tutor_id: string | null;
      student_id: string;
      session_id: string;
    };
    expect(inserted.tutor_id).toBe('tutor-AAA');
    expect(inserted.student_id).toBe('student-1');
    expect(inserted.session_id).toBe('sess-1');
  });

  it("inherits the session's tutor_id when the caller passes tutorId=null", async () => {
    const insertTracker = { lastInsert: null as { value: unknown } | null };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return buildTableHandler({
          data: { id: 'sess-1', tutor_id: 'tutor-BBB' },
          error: null,
        });
      }
      if (table === 'session_grants') {
        return buildTableHandler({
          data: {
            id: 'grant-1',
            session_id: 'sess-1',
            status: 'active',
          },
          error: null,
        });
      }
      if (table === 'session_bookings') {
        return buildTableHandler(
          { data: { id: 'booking-1' }, error: null },
          insertTracker,
        );
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    await createSessionBooking({
      studentId: 'student-1',
      sessionId: 'sess-1',
      sessionGrantId: 'grant-1',
      scheduledStart: '2026-08-01T10:00:00Z',
      scheduledEnd: '2026-08-01T11:00:00Z',
      tutorId: null,
    });

    const inserted = insertTracker.lastInsert?.value as {
      tutor_id: string | null;
    };
    expect(inserted.tutor_id).toBe('tutor-BBB');
  });

  it('uses the caller-provided tutorId when it is non-null (explicit wins)', async () => {
    const insertTracker = { lastInsert: null as { value: unknown } | null };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return buildTableHandler({
          data: { id: 'sess-1', tutor_id: 'tutor-AAA' },
          error: null,
        });
      }
      if (table === 'session_grants') {
        return buildTableHandler({
          data: {
            id: 'grant-1',
            session_id: 'sess-1',
            status: 'active',
          },
          error: null,
        });
      }
      if (table === 'session_bookings') {
        return buildTableHandler(
          { data: { id: 'booking-1' }, error: null },
          insertTracker,
        );
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    await createSessionBooking({
      studentId: 'student-1',
      sessionId: 'sess-1',
      sessionGrantId: 'grant-1',
      scheduledStart: '2026-08-01T10:00:00Z',
      scheduledEnd: '2026-08-01T11:00:00Z',
      tutorId: 'tutor-EXPLICIT',
    });

    const inserted = insertTracker.lastInsert?.value as {
      tutor_id: string | null;
    };
    // Explicit caller value wins over parent session default.
    expect(inserted.tutor_id).toBe('tutor-EXPLICIT');
  });

  it('writes NULL when the session has no tutor and the caller omits one', async () => {
    const insertTracker = { lastInsert: null as { value: unknown } | null };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sessions') {
        return buildTableHandler({
          data: { id: 'sess-1', tutor_id: null },
          error: null,
        });
      }
      if (table === 'session_grants') {
        return buildTableHandler({
          data: {
            id: 'grant-1',
            session_id: 'sess-1',
            status: 'active',
          },
          error: null,
        });
      }
      if (table === 'session_bookings') {
        return buildTableHandler(
          { data: { id: 'booking-1' }, error: null },
          insertTracker,
        );
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    await createSessionBooking({
      studentId: 'student-1',
      sessionId: 'sess-1',
      sessionGrantId: 'grant-1',
      scheduledStart: '2026-08-01T10:00:00Z',
      scheduledEnd: '2026-08-01T11:00:00Z',
    });

    const inserted = insertTracker.lastInsert?.value as {
      tutor_id: string | null;
    };
    expect(inserted.tutor_id).toBeNull();
  });
});
