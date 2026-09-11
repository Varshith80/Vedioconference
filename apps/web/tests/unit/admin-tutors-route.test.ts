import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — GET /api/admin/tutors (admin-only).
//
// Asserts:
//   - 401 for anonymous
//   - 200 for admins
//   - 200 body includes BOTH active and inactive tutors (the admin
//     directory shows every row regardless of `status`).
//
// Tutors are now standalone reference records (no profile join,
// no headline/bio/years_experience, no is_published). The row
// shape is `{ id, full_name, email, phone, status, notes,
// created_at, updated_at }`.
// =====================================================================

// Mocks must come before the route import.
const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { GET } = await import('@/app/api/admin/tutors/route');

// ----- Helpers -----------------------------------------------------------

type Result = { data: unknown; error: unknown };

function buildTutorsChain(payload: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result: Result = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.order = () => self;
  self.then = (onFulfilled: (v: Result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

describe('GET /api/admin/tutors', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 when requireAdminRoute throws Unauthorized', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with the full tutor directory (active + inactive)', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: { from: mockFrom },
    });
    // Two tutors: one active, one inactive. The admin variant
    // returns BOTH regardless of `status`.
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'tutors') {
        throw new Error(`Unexpected table in test: ${table}`);
      }
      return buildTutorsChain({
        data: [
          {
            id: 'tutor-1',
            full_name: 'Alice Martin',
            email: 'alice@example.com',
            phone: '+33600000001',
            status: 'active',
            notes: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            id: 'tutor-2',
            full_name: 'Bob Dupont',
            email: 'bob@example.com',
            phone: null,
            status: 'inactive', // <-- the admin must see this one too
            notes: 'On leave until 2026-08.',
            created_at: '2026-02-01T00:00:00Z',
            updated_at: '2026-02-01T00:00:00Z',
          },
        ],
      });
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: ReadonlyArray<{
        id: string;
        full_name: string;
        email: string;
        status: 'active' | 'inactive';
      }>;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((t) => t.id);
    expect(ids).toEqual(['tutor-1', 'tutor-2']);
    const inactive = body.data.find((t) => t.id === 'tutor-2');
    expect(inactive?.status).toBe('inactive');
    expect(inactive?.full_name).toBe('Bob Dupont');
  });

  it('returns 200 with an empty list when the directory has no tutors', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: { from: mockFrom },
    });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'tutors') {
        throw new Error(`Unexpected table in test: ${table}`);
      }
      return buildTutorsChain({ data: [] });
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// =====================================================================
// POST /api/admin/tutors — create tutor.
//
// Three failure modes are explicitly asserted:
//   - 422 (ZodError) for an empty body
//   - 403 (RLS policy violation) for SQLSTATE 42501
//   - 409 (unique-constraint) for SQLSTATE 23505
// Plus a 201 happy path.
//
// The route now translates Postgres 42501 (row-level security)
// into a structured 403 `rls_policy_violation` so the admin UI
// can distinguish "the DB said no" from a generic 500.
// =====================================================================

function buildTutorsInsertChain(payload: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result: Result = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  self.insert = () => self;
  self.select = () => self;
  self.single = () => Promise.resolve(result);
  return self;
}

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/tutors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CREATED_TUTOR = {
  id: 'tutor-new',
  full_name: 'Alice Martin',
  email: 'alice@example.com',
  phone: '+33600000001',
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('POST /api/admin/tutors', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 201 on a successful create', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation(() =>
      buildTutorsInsertChain({ data: CREATED_TUTOR }),
    );

    const { POST } = await import('@/app/api/admin/tutors/route');
    const res = await POST(
      makePostRequest({ full_name: 'Alice Martin', email: 'alice@example.com' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { id: string; email: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('tutor-new');
    expect(body.data.email).toBe('alice@example.com');
  });

  it('returns 403 (rls_policy_violation) on a Postgres 42501 row-level security error', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation(() =>
      buildTutorsInsertChain({
        error: {
          code: '42501',
          message:
            'new row violates row-level security policy for table "tutors"',
        },
      }),
    );

    const { POST } = await import('@/app/api/admin/tutors/route');
    const res = await POST(
      makePostRequest({ full_name: 'Alice Martin', email: 'alice@example.com' }) as never,
    );
    // The bug the user reported: previously this was a 500. The
    // fix surfaces it as a 403 with a structured code so the
    // admin UI can render a meaningful message.
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      error: { code: string; message: string; details: { table: string; reason: string } };
    };
    expect(body.error.code).toBe('rls_policy_violation');
    expect(body.error.details.table).toBe('tutors');
    expect(body.error.details.reason).toMatch(/row-level security/i);
  });

  it('returns 409 (conflict) on a Postgres 23505 unique-constraint violation', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation(() =>
      buildTutorsInsertChain({
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "uq_tutors_email"',
        },
      }),
    );

    const { POST } = await import('@/app/api/admin/tutors/route');
    const res = await POST(
      makePostRequest({ full_name: 'Alice Martin', email: 'alice@example.com' }) as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toMatch(/already exists/i);
  });

  it('returns 400 (bad_request) on a Zod validation failure (empty body)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });

    const { POST } = await import('@/app/api/admin/tutors/route');
    const res = await POST(makePostRequest({}) as never);
    // The route wraps the safeParse failure in BadRequest (400),
    // not a raw ZodError. The details payload carries the
    // `issues` array for the admin UI to render field-level
    // errors. The errorResponse() helper does also handle raw
    // ZodErrors with 422 + 'validation_error', but only when
    // they escape the route (e.g. from the service layer).
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; details: { issues: unknown[] } } };
    expect(body.error.code).toBe('bad_request');
    expect(Array.isArray(body.error.details.issues)).toBe(true);
  });
});

// =====================================================================
// DELETE /api/admin/tutors — delete tutor.
//
// Six failure / success modes are explicitly asserted:
//   - 401 for anonymous (no admin session)
//   - 200 for a tutor with no dependent rows
//   - 409 (upcoming) when the tutor has future live bookings
//   - 409 (history) when the tutor only has past / terminal
//     bookings — the bug the user reported: previously this
//     crashed the actual DELETE on a Postgres 23503 because the
//     pre-flight only counted future active rows.
//   - 404 when the tutor does not exist
//   - 400 on a malformed body
//
// Sprint 8 follow-up: the pre-flight is now
// `inspectTutorDeletionBlockers(id)`, which reads every
// session_bookings row for the tutor (not just future active
// ones), categorises them by kind, and returns a structured
// `blockers[]` list inside the 409 `details`. The mock has
// to answer three queries:
//   1. `from('session_bookings').select(...).eq(...).then(...)` → row list
//   2. `from('sessions').select(..., {count}).eq(...).not(...).then(...)` → count
//   3. `from('resources').select(..., {count}).eq(...).not(...).then(...)` → count
//   4. `from('tutors').delete(...).eq(...).then(...)` → { error, count }
// All go through the shared `mockFrom`; we route by table name.
// =====================================================================

// Chain for the session_bookings row list (pre-flight):
// select().eq() → `.then` resolves to `{data, error}`.
function buildBookingsListChain(payload: {
  data?: Array<{ id: string; scheduled_start: string; status: string }>;
  error?: unknown;
}) {
  const self: Record<string, unknown> = {};
  const result = {
    data: payload.data ?? [],
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.eq = () => self;
  self.then = (onFulfilled: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

// Chain for sessions/resources count: select(...,{count}).eq().not().
// Resolves to `{count, error}`.
function buildCountChain(payload: { count?: number; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result = {
    count: payload.count ?? 0,
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.eq = () => self;
  self.not = () => self;
  self.then = (onFulfilled: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

// Chain for the actual DELETE: delete().eq() → `.then` resolves
// to `{error, count}`. The route uses `count === 0` to detect a
// 404 (no row matched).
function buildTutorsDeleteChain(payload: { error?: unknown; count?: number | null }) {
  const self: Record<string, unknown> = {};
  const result: { error: unknown; count: number | null } = {
    error: payload.error ?? null,
    count: payload.count ?? null,
  };
  self.delete = () => self;
  self.eq = () => self;
  self.then = (onFulfilled: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

function makeDeleteRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/tutors', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_TUTOR_UUID = '00000000-0000-0000-0000-000000000001';

describe('DELETE /api/admin/tutors', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 when requireAdminRoute throws Unauthorized', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 and deletes the tutor when there are no dependent rows', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsListChain({ data: [] });
      }
      if (table === 'sessions') {
        return buildCountChain({ count: 0 });
      }
      if (table === 'resources') {
        return buildCountChain({ count: 0 });
      }
      if (table === 'tutors') {
        return buildTutorsDeleteChain({ count: 1 });
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { id: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(VALID_TUTOR_UUID);
  });

  it('returns 409 with an upcoming_booking blocker when the tutor has future live bookings', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const futureIso = '2999-01-01T00:00:00Z';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsListChain({
          data: [
            { id: 'b1', scheduled_start: futureIso, status: 'scheduled' },
            { id: 'b2', scheduled_start: futureIso, status: 'scheduled' },
            { id: 'b3', scheduled_start: futureIso, status: 'scheduled' },
          ],
        });
      }
      if (table === 'sessions') return buildCountChain({ count: 0 });
      if (table === 'resources') return buildCountChain({ count: 0 });
      // Tutors table must NOT be reached when blockers exist.
      throw new Error(`Tutors table should not be touched when blockers exist (got ${table})`);
    });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details?: { code?: string; blockers?: Array<{ kind: string; count: number }> };
      };
    };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toMatch(/upcoming assigned sessions/i);
    expect(body.error.details?.code).toBe('tutor_has_dependents');
    const upcoming = body.error.details?.blockers?.find((b) => b.kind === 'upcoming_booking');
    expect(upcoming?.count).toBe(3);
  });

  // The bug the user reported: a tutor with only past / terminal
  // bookings passed the original pre-flight, then crashed on a
  // Postgres 23503 with no actionable detail. The fix makes the
  // pre-flight see historical + terminal rows too, so the API
  // now returns a structured 409 *before* the DELETE is attempted.
  it('returns 409 with a historical_booking blocker when the tutor only has past bookings (the user-reported bug)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const pastIso = '2020-01-01T00:00:00Z';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsListChain({
          data: [
            { id: 'b1', scheduled_start: pastIso, status: 'scheduled' },   // historical
            { id: 'b2', scheduled_start: pastIso, status: 'cancelled' },  // terminal
            { id: 'b3', scheduled_start: pastIso, status: 'completed' },  // terminal
          ],
        });
      }
      if (table === 'sessions') return buildCountChain({ count: 0 });
      if (table === 'resources') return buildCountChain({ count: 0 });
      throw new Error(`Tutors table should not be touched when blockers exist (got ${table})`);
    });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details?: { code?: string; blockers?: Array<{ kind: string; count: number }> };
      };
    };
    expect(body.error.code).toBe('conflict');
    expect(body.error.message).toMatch(/status.+inactive/i);
    const historical = body.error.details?.blockers?.find((b) => b.kind === 'historical_booking');
    const terminal = body.error.details?.blockers?.find((b) => b.kind === 'terminal_booking');
    const upcoming = body.error.details?.blockers?.find((b) => b.kind === 'upcoming_booking');
    expect(historical?.count).toBe(1);
    expect(terminal?.count).toBe(2);
    expect(upcoming).toBeUndefined();
  });

  it('returns 409 with a read_error blocker when the pre-flight cannot read dependents', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsListChain({
          error: { message: 'permission denied for table session_bookings', code: '42501' },
        });
      }
      if (table === 'sessions') return buildCountChain({ count: 0 });
      if (table === 'resources') return buildCountChain({ count: 0 });
      throw new Error(`Tutors table should not be touched when blockers exist (got ${table})`);
    });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details?: { code?: string; blockers?: Array<{ kind: string; count: number }> };
      };
    };
    const readErr = body.error.details?.blockers?.find((b) => b.kind === 'read_error');
    expect(readErr).toBeDefined();
    expect(body.error.message).toMatch(/retry/i);
  });

  it('returns 404 when the tutor does not exist (delete count = 0)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsListChain({ data: [] });
      if (table === 'sessions') return buildCountChain({ count: 0 });
      if (table === 'resources') return buildCountChain({ count: 0 });
      if (table === 'tutors') return buildTutorsDeleteChain({ count: 0 });
      throw new Error(`Unexpected table in test: ${table}`);
    });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: VALID_TUTOR_UUID }) as never);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 400 (bad_request) when the body is missing the id', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({}) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: { code: string; details: { issues: unknown[] } };
    };
    expect(body.error.code).toBe('bad_request');
    expect(Array.isArray(body.error.details.issues)).toBe(true);
  });

  it('returns 400 (bad_request) when the id is not a UUID', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });

    const { DELETE } = await import('@/app/api/admin/tutors/route');
    const res = await DELETE(makeDeleteRequest({ id: 'not-a-uuid' }) as never);
    expect(res.status).toBe(400);
  });
});
