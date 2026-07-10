import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Smoke test for `POST /api/enrollments/checkout` — the
 * end-to-end B2 integration test. The Sprint C refactor
 * changes three things vs B2:
 *
 *   1. The valid enrollment status is `pending_payment`, not
 *      `pending` (the B2 enum bug).
 *   2. The route delegates to n8n, not Stripe directly.
 *   3. The route returns 503 `checkout_unavailable` when
 *      `N8N_ENROLLMENT_WEBHOOK_URL` is unset (mock-gated
 *      execution).
 */

// Mocks must come before the route import.
const mockAuthUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(),
}));

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { POST } = await import('@/app/api/enrollments/checkout/route');
import { NextRequest as NextRequestCtor } from 'next/server';

interface Row { data: unknown; error: null }

function tableQueue(responses: Row[]) {
  let i = 0;
  return (_table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'single'];
    for (const m of methods) (chain as Record<string, unknown>)[m] = vi.fn(() => chain);
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve: (r: Row) => void) => {
          resolve(responses[i++] ?? { data: null, error: null });
        };
      },
    });
    return chain;
  };
}

const ENROLLMENT_ROW = {
  id: 'e1', student_id: 'u1', course_id: 'c1',
  status: 'pending_payment', amount_cents: 4500, currency: 'EUR',
  stripe_session_id: null,
};
const COURSE_ROW = {
  id: 'c1', title: 'Maths', slug: 'maths',
  price_cents: 4500, currency: 'EUR',
};

function makeReq(body: unknown, cookie?: string): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new NextRequestCtor('http://localhost:3000/api/enrollments/checkout', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function loadServerMockMocked(from: (table: string) => unknown) {
  const { createSupabaseServerClientUntyped } = await import('@/lib/supabase/server');
  (createSupabaseServerClientUntyped as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: mockAuthUser },
    from,
  });
}

describe('POST /api/enrollments/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.mockReset();
    mockFetch.mockReset();
  });

  it('returns 401 when the user is not signed in', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: null } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ enrollment_id: '00000000-0000-0000-0000-000000000000' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid body', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ wrong: 'field' }));
    expect(res.status).toBe(400);
  });

  it('returns 503 checkout_unavailable when N8N_ENROLLMENT_WEBHOOK_URL is unset', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: undefined,
      N8N_WEBHOOK_SECRET:         'secret',
    });
    await loadServerMockMocked(tableQueue([
      { data: ENROLLMENT_ROW, error: null },
      { data: COURSE_ROW,     error: null },
    ]));
    const res = await POST(
      makeReq({ enrollment_id: '00000000-0000-0000-0000-000000000001' }, 'NEXT_LOCALE=fr'),
    );
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('checkout_unavailable');
  });

  it('returns 200 with a checkout_url when n8n responds OK', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.example/webhook',
      N8N_WEBHOOK_SECRET:         'secret',
    });
    mockFetch.mockResolvedValue({
      ok:   true,
      json: async () => ({ checkout_url: 'https://stripe.example/c/pay/abc', stripe_session_id: 'cs_test_123' }),
    });
    await loadServerMockMocked(tableQueue([
      { data: ENROLLMENT_ROW, error: null },
      { data: COURSE_ROW,     error: null },
    ]));
    const res = await POST(
      makeReq({ enrollment_id: '00000000-0000-0000-0000-000000000001' }, 'NEXT_LOCALE=en'),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean; data: { checkout_url: string } };
    expect(body.ok).toBe(true);
    expect(body.data.checkout_url).toContain('stripe.example');
  });
});
