import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — Vitest for PATCH + DELETE /api/chapters/[id].
// PATCH validates the body (adminChapterEditSchema) and UPDATEs
// the row. DELETE hard-deletes; FK CASCADE drops child sessions
// automatically, so 23503 is not expected here.
// =====================================================================

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { PATCH, DELETE } = await import('@/app/api/chapters/[id]/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(url: string, body: unknown, method = 'PATCH'): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

describe('PATCH /api/chapters/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 400 for an empty patch body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(
      makeReq('http://localhost/api/chapters/abc', {}) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 on a successful title-only patch', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValueOnce({
      update(_rows: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({
            data: { id: 'ch1', slug: 'algebra', title: 'Updated', sort_order: 1, is_published: true },
            error: null,
          });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/chapters/abc', { title: 'Updated' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { title: string } };
    expect(body.data.title).toBe('Updated');
  });

  it('returns 404 when the chapter does not exist (PGRST116)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValueOnce({
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
      makeReq('http://localhost/api/chapters/abc', { title: 'New' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate slug within the same course (23505)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValueOnce({
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
      makeReq('http://localhost/api/chapters/abc', { slug: 'taken' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/chapters/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 200 on a successful delete (FK CASCADE drops sessions)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      delete() {
        const self: Record<string, unknown> = {};
        self.eq = () => Promise.resolve({ data: null, error: null });
        return self;
      },
    });
    const res = await DELETE(
      makeReq('http://localhost/api/chapters/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
  });

  it('returns 404 when the chapter does not exist (PGRST116)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      delete() {
        const self: Record<string, unknown> = {};
        self.eq = () =>
          Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
          });
        return self;
      },
    });
    const res = await DELETE(
      makeReq('http://localhost/api/chapters/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(404);
  });
});
