import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireAdminRoute = vi.fn();
const mockFrom = vi.fn();
vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { POST } = await import('@/app/api/chapters/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown): InstanceType<typeof NextRequestCtor> {
  return new NextRequestCtor('http://localhost/api/chapters', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/chapters', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 for anonymous', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await POST(makeReq({ course_slug: 'c', slug: 'ch', title: 'T' }) as never);
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    const res = await POST(
      makeReq({ course_slug: 'c', slug: 'NOT A SLUG', title: 'T' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the course does not exist', async () => {
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
      makeReq({ course_slug: 'missing', slug: 'ok-slug', title: 'T' }) as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 201 for an admin with a well-formed body', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: { from: mockFrom } });
    let callIdx = 0;
    mockFrom.mockImplementation(() => {
      callIdx++;
      if (callIdx === 1) {
        return {
          select() {
            const self: Record<string, unknown> = {};
            self.eq = () => self;
            self.maybeSingle = () => Promise.resolve({ data: { id: 'c1' }, error: null });
            return self;
          },
        };
      }
      return {
        insert() {
          const self: Record<string, unknown> = {};
          self.select = () => self;
          self.single = () =>
            Promise.resolve({ data: { id: 'ch1', slug: 'ch', title: 'T' }, error: null });
          return self;
        },
      };
    });
    const res = await POST(
      makeReq({ course_slug: 'c-slug', slug: 'ch', title: 'T' }) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean; data: { chapter_id: string } };
    expect(body.ok).toBe(true);
    expect(body.data.chapter_id).toBe('ch1');
  });
});
