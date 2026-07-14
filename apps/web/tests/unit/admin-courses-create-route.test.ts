import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { POST } = await import('@/app/api/courses/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor('http://localhost/api/courses', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/courses', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 for anonymous', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await POST(makeReq({ slug: 'x', title: 'X', program_slug: 'p' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body (bad slug)', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await POST(
      makeReq({ slug: 'NOT A SLUG', title: 'X', program_slug: 'p' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the program does not exist', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    mockFrom.mockReturnValue({
      select() {
        const self: Record<string, unknown> = {};
        self.eq = () => self;
        self.maybeSingle = () => Promise.resolve({ data: null, error: null });
        return self;
      },
    });
    const res = await POST(
      makeReq({ slug: 'ok-slug', title: 'X', program_slug: 'missing' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 201 for an admin with a well-formed body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        // programs lookup
        return {
          select() {
            const self: Record<string, unknown> = {};
            self.eq = () => self;
            self.maybeSingle = () => Promise.resolve({ data: { id: 'p1' }, error: null });
            return self;
          },
        };
      }
      // courses insert
      return {
        insert(_rows: unknown) {
          const self: Record<string, unknown> = {};
          self.select = () => self;
          self.single = () =>
            Promise.resolve({ data: { id: 'c1', slug: 'ok-slug', title: 'X' }, error: null });
          return self;
        },
      };
    });
    const res = await POST(
      makeReq({ slug: 'ok-slug', title: 'X', program_slug: 'p1-slug' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { slug: string } };
    expect(body.ok).toBe(true);
    expect(body.data.slug).toBe('ok-slug');
  });

  it('returns 409 on duplicate slug', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        return {
          select() {
            const self: Record<string, unknown> = {};
            self.eq = () => self;
            self.maybeSingle = () => Promise.resolve({ data: { id: 'p1' }, error: null });
            return self;
          },
        };
      }
      return {
        insert() {
          const self: Record<string, unknown> = {};
          self.select = () => self;
          self.single = () =>
            Promise.resolve({
              data: null,
              error: { code: '23505', message: 'dup' },
            });
          return self;
        },
      };
    });
    const res = await POST(
      makeReq({ slug: 'dup', title: 'X', program_slug: 'p1-slug' }) as never,
    );
    expect(res.status).toBe(409);
  });
});
