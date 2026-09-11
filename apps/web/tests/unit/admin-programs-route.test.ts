import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { PATCH, DELETE } = await import('@/app/api/programs/[id]/route');
const { POST: POST_PROGRAMS } = await import('@/app/api/programs/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(url: string, body: unknown, method = 'POST'): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

describe('POST /api/programs', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 for anonymous', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await POST_PROGRAMS(
      makeReq('http://localhost/api/programs', { slug: 'x', title: 'X' }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body (bad slug)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await POST_PROGRAMS(
      makeReq('http://localhost/api/programs', { slug: 'NOT A SLUG', title: 'X' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 201 for an admin with a well-formed body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      insert(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.select = () => self;
        self.single = () =>
          Promise.resolve({ data: { id: 'p1', slug: 'lycee', title: 'Lycée' }, error: null });
        return self;
      },
    });
    const res = await POST_PROGRAMS(
      makeReq('http://localhost/api/programs', { slug: 'lycee', title: 'Lycée' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { slug: string } };
    expect(body.ok).toBe(true);
    expect(body.data.slug).toBe('lycee');
  });

  it('returns 409 on duplicate slug (23505)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      insert(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.select = () => self;
        self.single = () =>
          Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
        return self;
      },
    });
    const res = await POST_PROGRAMS(
      makeReq('http://localhost/api/programs', { slug: 'dup', title: 'X' }) as never,
    );
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/programs/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 400 for an empty patch body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(
      makeReq('http://localhost/api/programs/abc', {}) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the program does not exist (PGRST116)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      update(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/programs/abc', { title: 'New' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 on a successful patch', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      update(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({
            data: { id: 'p1', slug: 'lycee', title: 'Updated', is_published: true },
            error: null,
          });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/programs/abc', { title: 'Updated' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { title: string } };
    expect(body.data.title).toBe('Updated');
  });

  it('returns 409 on duplicate slug (23505)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      update(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({ data: null, error: { code: '23505', message: 'dup' } });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/programs/abc', { slug: 'taken' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/programs/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 200 on a successful delete', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      delete() {
        const self: Record<string, unknown> = {};
        self.eq = () => Promise.resolve({ data: null, error: null });
        return self;
      },
    });
    const res = await DELETE(
      makeReq('http://localhost/api/programs/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
  });

  it('returns 409 when the program still has courses (23503)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      delete() {
        const self: Record<string, unknown> = {};
        self.eq = () =>
          Promise.resolve({
            data: null,
            error: { code: '23503', message: 'fk violation' },
          });
        return self;
      },
    });
    const res = await DELETE(
      makeReq('http://localhost/api/programs/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(409);
  });
});
