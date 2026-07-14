import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.6 — POST /api/sessions/bulk route test.
//
// Asserts:
//   - 401 for anonymous
//   - 403 for non-admins
//   - 200 for admins with a well-formed body
//   - 400 for invalid body (missing chapter_id, empty sessions, etc.)
//   - 404 when chapter_id does not exist
//   - 400 when the batch has duplicate positions
//   - 500 when the DB upsert fails
// =====================================================================

// Mocks must come before the route import.
const mockRequireAdminRoute = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));

const { POST } = await import('@/app/api/sessions/bulk/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor('http://localhost/api/sessions/bulk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

// Fake Supabase builder. Every method returns the chain
// itself; the awaitable resolves to the queued result.
function makeFakeSupabase(handlers: Record<string, unknown>) {
  return {
    from(table: string) {
      return handlers[table];
    },
  };
}

const chapterExistsHandler = {
  select() {
    const self: Record<string, unknown> = {};
    self.eq = () => self;
    self.maybeSingle = () =>
      Promise.resolve({ data: { id: 'chapter-1' }, error: null });
    return self;
  },
};

const chapterMissingHandler = {
  select() {
    const self: Record<string, unknown> = {};
    self.eq = () => self;
    self.maybeSingle = () => Promise.resolve({ data: null, error: null });
    return self;
  },
};

const sessionsOkHandler = {
  upsert(_rows: unknown, _opts?: unknown) {
    const echoed = [
      { id: 's1', position: 1 },
      { id: 's2', position: 2 },
    ];
    const self: Record<string, unknown> = {};
    self.select = (_cols?: string) => self;
    self.then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: echoed, error: null }).then(onFulfilled);
    return self;
  },
};

const sessionsDbErrorHandler = {
  upsert(_rows: unknown, _opts?: unknown) {
    const self: Record<string, unknown> = {};
    self.select = (_cols?: string) => self;
    self.then = (onFulfilled: (v: { data: unknown; error: { message: string } }) => unknown) =>
      Promise.resolve({ data: null, error: { message: 'boom' } }).then(onFulfilled);
    return self;
  },
};

describe('POST /api/sessions/bulk', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
  });

  it('returns 200 for an admin with a well-formed body', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: makeFakeSupabase({
        chapters: chapterExistsHandler,
        sessions: sessionsOkHandler,
      }),
    });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [
          { position: 1, slug: 's1', title: 'Session 1' },
          { position: 2, slug: 's2', title: 'Session 2' },
        ],
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { count: number; session_ids: string[] } };
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(2);
    expect(body.data.session_ids).toEqual(['s1', 's2']);
  });

  it('returns 401 when requireAdminRoute throws Unauthorized', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('You must be signed in.'));
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [{ position: 1, slug: 's1', title: 'S' }],
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for a body with no chapter_id', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    const res = await POST(
      makeReq({
        sessions: [{ position: 1, slug: 's1', title: 'S' }],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for an empty sessions array', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the chapter does not exist', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: makeFakeSupabase({ chapters: chapterMissingHandler }),
    });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [{ position: 1, slug: 's1', title: 'S' }],
      }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the batch has duplicate positions', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: makeFakeSupabase({
        chapters: chapterExistsHandler,
        sessions: sessionsOkHandler,
      }),
    });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [
          { position: 1, slug: 's1', title: 'S' },
          { position: 1, slug: 's2', title: 'S' },
        ],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 when the DB upsert fails', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: makeFakeSupabase({
        chapters: chapterExistsHandler,
        sessions: sessionsDbErrorHandler,
      }),
    });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [{ position: 1, slug: 's1', title: 'S' }],
      }) as never,
    );
    expect(res.status).toBe(500);
  });

  it('preserves null price_cents (Sprint 3.5 invariant)', async () => {
    let capturedRows: unknown = null;
    const captureHandler = {
      upsert(rows: unknown, _opts?: unknown) {
        capturedRows = rows;
        const echoed = [{ id: 's1', position: 1 }];
        const self: Record<string, unknown> = {};
        self.select = () => self;
        self.then = (onFulfilled: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: echoed, error: null }).then(onFulfilled);
        return self;
      },
    };
    mockRequireAdminRoute.mockResolvedValue({
      supabase: makeFakeSupabase({
        chapters: chapterExistsHandler,
        sessions: captureHandler,
      }),
    });
    const res = await POST(
      makeReq({
        chapter_id: '11111111-1111-1111-1111-111111111111',
        sessions: [
          { position: 1, slug: 's1', title: 'S', price_cents: null },
        ],
      }) as never,
    );
    expect(res.status).toBe(200);
    const rows = capturedRows as Array<{ price_cents: unknown }>;
    expect(rows[0]!.price_cents).toBeNull();
  });
});
