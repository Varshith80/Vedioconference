import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 8 — R-1 + R-2 Resources delivery surface (admin).
//   GET  /api/admin/resources — list every resource (admin scope).
//   POST /api/admin/resources — create a new resource.
//
// Asserts:
//   - 401 for anonymous (auth gate)
//   - 200 with full list for admins
//   - 201 with the created row on a valid POST
//   - 400 on an invalid POST body
// =====================================================================

// Mocks must come before the route import.
const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();

function buildAdminSupabase() {
  return {
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  };
}

vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => buildAdminSupabase(),
}));

const { GET, POST } = await import('@/app/api/admin/resources/route');

// ----- Helpers -----------------------------------------------------------

type Result = { data: unknown; error: unknown };

function buildQueryChain(payload: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result: Result = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.order = () => self;
  self.insert = () => self;
  self.then = (onFulfilled: (v: Result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

function buildSingleChain(payload: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result: Result = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.insert = () => self;
  self.single = () => self;
  self.then = (onFulfilled: (v: Result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

describe('GET /api/admin/resources', () => {
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

  it('returns 200 with the full resource list for admins', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: buildAdminSupabase() });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'resources') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return buildQueryChain({
        data: [
          {
            id: 'r-1',
            course_id: null,
            created_at: '2026-01-01T00:00:00Z',
            description: null,
            file_name: 'fiche.pdf',
            file_path: 'resources/fiche.pdf',
            mime_type: 'application/pdf',
            size_bytes: 12345,
            title: 'Fiche 1',
            tutor_id: null,
            updated_at: '2026-01-01T00:00:00Z',
            uploaded_by: null,
            visibility: 'enrolled',
          },
        ],
      });
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: ReadonlyArray<{ id: string; visibility: string }> };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe('r-1');
    expect(body.data[0]?.visibility).toBe('enrolled');
  });
});

describe('POST /api/admin/resources', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
    mockAuthGetUser.mockReset();
  });

  it('returns 401 when requireAdminRoute throws Unauthorized', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', file_name: 'a.pdf', file_path: 'a/a.pdf' }),
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid body (missing file_name)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: buildAdminSupabase() });
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'no file name' }),
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
  });

  it('returns 201 with the created row on a valid payload', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: buildAdminSupabase() });
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'resources') throw new Error(`Unexpected table: ${table}`);
      return buildSingleChain({
        data: {
          id: 'r-new',
          course_id: null,
          created_at: '2026-02-01T00:00:00Z',
          description: null,
          file_name: 'fiche.pdf',
          file_path: 'resources/fiche.pdf',
          mime_type: 'application/pdf',
          size_bytes: 1234,
          title: 'New fiche',
          tutor_id: null,
          updated_at: '2026-02-01T00:00:00Z',
          uploaded_by: 'u-1',
          visibility: 'enrolled',
        },
      });
    });
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'New fiche',
        file_name: 'fiche.pdf',
        file_path: 'resources/fiche.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1234,
        visibility: 'enrolled',
      }),
    });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { id: string; uploadedBy: string } };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('r-new');
    expect(body.data.uploadedBy).toBe('u-1');
  });
});