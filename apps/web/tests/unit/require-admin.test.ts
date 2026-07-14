import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the Sprint 3.6 admin-route guards.
//
// The throwing twins (requireAdminRoute / requireSuperAdminRoute) live
// in apps/web/lib/auth/require-admin-route.ts and are used by the
// app/api/[...] route handlers. The RSC-side hooks (requireAdmin /
// requireSuperAdmin) live in apps/web/hooks/use-require-user.ts and
// call redirect() on auth failure.
//
// Both helpers call the same is_admin() / is_super_admin() DB helper
// conceptually; in these tests we exercise the client-side role
// check (the profiles.role column) which is the next line of defence
// after the DB RPC.

// ----- Mocks ------------------------------------------------------------

const mockAuthGetUser = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom,
    }),
  ),
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockAuthGetUser },
      from: mockFrom,
    }),
  ),
}));

const mockRedirect = vi.fn((url: string) => {
  // Simulate the throw that Next.js redirect() does internally.
  const err = new Error(`NEXT_REDIRECT; ${url}`);
  (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url};`;
  throw err;
});
const mockHeaders = vi.fn(() =>
  Promise.resolve({
    get: (name: string) =>
      name === 'x-next-intl-locale' ? 'en' : null,
  }),
);

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

import { ApiError } from '@/lib/utils/errors';

// ----- Helpers -----------------------------------------------------------

const ADMIN_PROFILE = {
  id: 'a1',
  email: 'admin@example.com',
  full_name: 'Admin',
  avatar_url: null,
  phone: null,
  timezone: 'Europe/Paris',
  role: 'admin' as const,
  locale: 'en',
  is_active: true,
  last_login_at: null,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const SUPER_ADMIN_PROFILE = { ...ADMIN_PROFILE, id: 'sa1', role: 'super_admin' as const };

const STUDENT_PROFILE = { ...ADMIN_PROFILE, id: 's1', role: 'student' as const };

function mockFromQueue(responses: Array<{ data: unknown; error: unknown }>) {
  let i = 0;
  mockFrom.mockImplementation(() => {
    const queue = responses[i++] ?? { data: null, error: null };
    mockSelect.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ single: mockSingle });
    mockSingle.mockResolvedValue(queue);
    return { select: mockSelect };
  });
}

// ----- Tests -------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockRedirect.mockClear();
  mockFrom.mockReset();
  mockAuthGetUser.mockReset();
});

describe('requireAdminRoute() — route-handler twin', () => {
  it('throws Unauthorized() when no user is signed in', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const { requireAdminRoute } = await import('@/lib/auth/require-admin-route');

    await expect(requireAdminRoute()).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    await expect(requireAdminRoute()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws Forbidden() when the signed-in user is a student', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 's1' } } });
    mockFromQueue([{ data: STUDENT_PROFILE, error: null }]);

    const { requireAdminRoute } = await import('@/lib/auth/require-admin-route');

    await expect(requireAdminRoute()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    await expect(requireAdminRoute()).rejects.toBeInstanceOf(ApiError);
  });

  it('returns { user, profile, supabase } for an admin', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'a1' } } });
    mockFromQueue([{ data: ADMIN_PROFILE, error: null }]);

    const { requireAdminRoute } = await import('@/lib/auth/require-admin-route');

    const ctx = await requireAdminRoute();
    expect(ctx.user.id).toBe('a1');
    expect(ctx.profile.role).toBe('admin');
    expect(ctx.supabase).toBeDefined();
  });

  it('returns { user, profile, supabase } for a super_admin', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'sa1' } } });
    mockFromQueue([{ data: SUPER_ADMIN_PROFILE, error: null }]);

    const { requireAdminRoute } = await import('@/lib/auth/require-admin-route');

    const ctx = await requireAdminRoute();
    expect(ctx.profile.role).toBe('super_admin');
  });

  it('throws Forbidden() when the profile row is missing', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'orphan' } } });
    mockFromQueue([{ data: null, error: { message: 'no row' } }]);

    const { requireAdminRoute } = await import('@/lib/auth/require-admin-route');

    await expect(requireAdminRoute()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    await expect(requireAdminRoute()).rejects.toBeInstanceOf(ApiError);
  });
});

describe('requireSuperAdminRoute() — route-handler twin', () => {
  it('throws Forbidden() for an admin (strict — not super_admin)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'a1' } } });
    mockFromQueue([{ data: ADMIN_PROFILE, error: null }]);

    const { requireSuperAdminRoute } = await import('@/lib/auth/require-admin-route');

    await expect(requireSuperAdminRoute()).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
  });

  it('returns { user, profile, supabase } for a super_admin', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'sa1' } } });
    mockFromQueue([{ data: SUPER_ADMIN_PROFILE, error: null }]);

    const { requireSuperAdminRoute } = await import('@/lib/auth/require-admin-route');

    const ctx = await requireSuperAdminRoute();
    expect(ctx.profile.role).toBe('super_admin');
  });
});

describe('requireAdmin() — RSC hook', () => {
  it('redirects anonymous users to /en/auth/login', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const { requireAdmin } = await import('@/hooks/use-require-user');

    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith('/en/auth/login');
  });

  it('redirects a student to /en/dashboard?error=forbidden', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 's1' } } });
    mockFromQueue([{ data: STUDENT_PROFILE, error: null }]);

    const { requireAdmin } = await import('@/hooks/use-require-user');

    await expect(requireAdmin()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith('/en/dashboard?error=forbidden');
  });

  it('returns the admin context for an admin', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'a1' } } });
    mockFromQueue([{ data: ADMIN_PROFILE, error: null }]);

    const { requireAdmin } = await import('@/hooks/use-require-user');

    const ctx = await requireAdmin();
    expect(ctx.profile.role).toBe('admin');
  });
});

describe('requireSuperAdmin() — RSC hook', () => {
  it('redirects an admin (not super_admin) to /en/dashboard?error=forbidden', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'a1' } } });
    mockFromQueue([{ data: ADMIN_PROFILE, error: null }]);

    const { requireSuperAdmin } = await import('@/hooks/use-require-user');

    await expect(requireSuperAdmin()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockRedirect).toHaveBeenCalledWith('/en/dashboard?error=forbidden');
  });

  it('returns the admin context for a super_admin', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'sa1' } } });
    mockFromQueue([{ data: SUPER_ADMIN_PROFILE, error: null }]);

    const { requireSuperAdmin } = await import('@/hooks/use-require-user');

    const ctx = await requireSuperAdmin();
    expect(ctx.profile.role).toBe('super_admin');
  });
});
