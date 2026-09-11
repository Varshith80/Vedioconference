import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — Vitest for PATCH + DELETE /api/courses/[id].
// PATCH validates the body (adminCourseEditSchema), resolves
// program_slug → program_id and grade_slug → grade_id, then
// UPDATEs the row. DELETE hard-deletes; FK violations on the
// chapters table map to 409.
// =====================================================================

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { PATCH, DELETE } = await import('@/app/api/admin/courses/[id]/route');
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

describe('PATCH /api/courses/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 400 for an empty patch body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(
      makeReq('http://localhost/api/courses/abc', {}) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the program_slug does not exist', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    // First call resolves program_slug; nothing is found.
    mockFrom.mockReturnValueOnce({
      select(_cols: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/courses/abc', { program_slug: 'missing' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(404);
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
            data: { id: 'c1', slug: 'math', title: 'Updated', is_published: true },
            error: null,
          });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/courses/abc', { title: 'Updated' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { title: string } };
    expect(body.data.title).toBe('Updated');
  });

  it('returns 404 when the course does not exist (PGRST116)', async () => {
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
      makeReq('http://localhost/api/courses/abc', { title: 'New' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate slug (23505)', async () => {
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
      makeReq('http://localhost/api/courses/abc', { slug: 'taken' }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(409);
  });

  it('resolves program_slug + grade_slug and updates both FKs', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    // 1st call: resolve program_slug → program_id
    mockFrom.mockReturnValueOnce({
      select(_cols: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.maybeSingle = () =>
          Promise.resolve({ data: { id: 'p1' }, error: null });
        return self;
      },
    });
    // 2nd call: resolve grade_slug (scoped to the now-known program_id)
    mockFrom.mockReturnValueOnce({
      select(_cols: unknown) {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.maybeSingle = () =>
          Promise.resolve({ data: { id: 'g1' }, error: null });
        return self;
      },
    });
    // 3rd call: the actual UPDATE
    mockFrom.mockReturnValueOnce({
      update(rows: unknown) {
        const r = rows as Record<string, unknown>;
        expect(r).toMatchObject({ program_id: 'p1', grade_id: 'g1' });
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({
            data: { id: 'c1', slug: 'math', title: 'Math', is_published: true },
            error: null,
          });
        return self;
      },
    });
    const res = await PATCH(
      makeReq('http://localhost/api/courses/abc', {
        program_slug: 'lycee',
        grade_slug: 'premiere',
      }) as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/courses/[id]', () => {
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
      makeReq('http://localhost/api/courses/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(200);
  });

  it('returns 409 when the course still has chapters (23503)', async () => {
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
      makeReq('http://localhost/api/courses/abc', {}, 'DELETE') as never,
      { params: makeParams('abc') },
    );
    expect(res.status).toBe(409);
  });
});
