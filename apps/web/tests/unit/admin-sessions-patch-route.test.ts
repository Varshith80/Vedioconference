import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { PATCH } = await import('@/app/api/sessions/[id]/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor('http://localhost/api/sessions/sess-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'sess-1' });

describe('PATCH /api/sessions/[id]', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 for anonymous', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await PATCH(makeReq({ title: 'X' }) as never, { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty patch body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(makeReq({}) as never, { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid price (negative)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(makeReq({ price_cents: -1 }) as never, { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the session does not exist', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      update() {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } });
        return self;
      },
    });
    const res = await PATCH(makeReq({ title: 'X' }) as never, { params });
    expect(res.status).toBe(404);
  });

  it('returns 200 and updates the row (NULL price preserved)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    let captured: unknown = null;
    mockFrom.mockReturnValue({
      update(payload: unknown) {
        captured = payload;
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.select = () => self;
        self.single = () =>
          Promise.resolve({
            data: { id: 'sess-1', title: 'Updated', price_cents: null, is_published: true },
            error: null,
          });
        return self;
      },
    });
    const res = await PATCH(makeReq({ title: 'Updated', price_cents: null }) as never, {
      params,
    });
    expect(res.status).toBe(200);
    const updates = captured as { title: string; price_cents: number | null };
    expect(updates.title).toBe('Updated');
    expect(updates.price_cents).toBeNull();
  });

  it('rejects non-3-letter currency', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await PATCH(makeReq({ currency: 'EU' }) as never, { params });
    expect(res.status).toBe(400);
  });
});
