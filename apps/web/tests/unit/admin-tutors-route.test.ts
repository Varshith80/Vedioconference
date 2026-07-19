import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — GET /api/admin/tutors (admin-only).
//
// Asserts:
//   - 401 for anonymous
//   - 200 for admins
//   - 200 body includes tutors that are NOT published (the admin
//     variant of `getAllTutors()` returns every tutor including
//     unpublished / archived — the directory surface in
//     /admin/tutors must see them all).
//
// The route delegates entirely to `getAllTutors()` from
// `services/admin/tutors.ts`. The mock for that call is the
// `from('tutors').select(…).order(…)` chain.
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

  it('returns 200 with the full tutor directory (including unpublished)', async () => {
    mockRequireAdminRoute.mockResolvedValue({
      supabase: { from: mockFrom },
    });
    // Two tutors: one published, one NOT published. The admin
    // variant must return BOTH.
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'tutors') {
        throw new Error(`Unexpected table in test: ${table}`);
      }
      return buildTutorsChain({
        data: [
          {
            id: 'tutor-1',
            headline: 'Maths',
            bio: null,
            years_experience: 5,
            rating_avg: 4.5,
            is_published: true,
            created_at: '2026-01-01T00:00:00Z',
            profile: {
              id: 'profile-1',
              full_name: 'Alice Martin',
              email: 'alice@example.com',
              avatar_url: null,
            },
          },
          {
            id: 'tutor-2',
            headline: 'Physique',
            bio: null,
            years_experience: 2,
            rating_avg: null,
            is_published: false, // <-- the admin must see this one too
            created_at: '2026-02-01T00:00:00Z',
            profile: {
              id: 'profile-2',
              full_name: 'Bob Dupont',
              email: 'bob@example.com',
              avatar_url: null,
            },
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
        email: string | null;
        is_published: boolean;
      }>;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((t) => t.id);
    expect(ids).toEqual(['tutor-1', 'tutor-2']);
    const unpublished = body.data.find((t) => t.id === 'tutor-2');
    expect(unpublished?.is_published).toBe(false);
    expect(unpublished?.full_name).toBe('Bob Dupont');
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
