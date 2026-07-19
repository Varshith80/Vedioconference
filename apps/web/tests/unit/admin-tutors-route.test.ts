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
