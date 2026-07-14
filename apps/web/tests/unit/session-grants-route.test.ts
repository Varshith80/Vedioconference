import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 3.5 smoke test for `POST /api/session-grants` —
 * the v2 unit-of-payment endpoint. Mirrors the B2
 * `enrollments-checkout-route.test.ts` shape.
 */

// Mocks must come before the route import.
const mockAuthUser = vi.fn();
const mockCreatePending = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(),
}));

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/services/curriculum/session-grants', () => ({
  createPendingSessionGrant: mockCreatePending,
}));

const { POST } = await import('@/app/api/session-grants/route');
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

const SESSION_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Algebra — Session 1',
  slug: 'algebra-session-1',
  price_cents: 4500,
  currency: 'EUR',
};
const GRANT_ROW = {
  id: '22222222-2222-2222-2222-222222222222',
  student_id: 'u1',
  session_id: SESSION_ROW.id,
  status: 'pending_payment',
  amount_cents: 4500,
  currency: 'EUR',
};

function makeReq(body: unknown, cookie?: string): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  return new NextRequestCtor('http://localhost:3000/api/session-grants', {
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

describe('POST /api/session-grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.mockReset();
    mockCreatePending.mockReset();
    mockFetch.mockReset();
  });

  it('returns 401 when the user is not signed in', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: null } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ session_id: SESSION_ROW.id }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid body (missing session_id)', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ wrong: 'field' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the service reports session_not_found', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreatePending.mockResolvedValue({ kind: 'session_not_found' });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ session_id: SESSION_ROW.id }));
    expect(res.status).toBe(404);
  });

  it('returns 422 session_price_missing when the price is NULL', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreatePending.mockResolvedValue({ kind: 'session_price_missing' });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ session_id: SESSION_ROW.id }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('session_price_missing');
  });

  it('returns 409 session_grant_exists when a duplicate active grant is reported', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreatePending.mockResolvedValue({
      kind: 'duplicate_active_grant',
      grant: GRANT_ROW,
    });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ session_id: SESSION_ROW.id }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('session_grant_exists');
  });

  it('returns 503 checkout_unavailable when N8N_ENROLLMENT_WEBHOOK_URL is unset', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreatePending.mockResolvedValue({ kind: 'ok', grant: GRANT_ROW });
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: undefined,
      N8N_WEBHOOK_SECRET: 'secret',
    });
    await loadServerMockMocked(
      tableQueue([{ data: SESSION_ROW, error: null }]),
    );
    const res = await POST(
      makeReq({ session_id: SESSION_ROW.id }, 'NEXT_LOCALE=fr'),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('checkout_unavailable');
  });

  it('returns 201 with a checkout_url when n8n responds OK', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreatePending.mockResolvedValue({ kind: 'ok', grant: GRANT_ROW });
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.example/webhook',
      N8N_WEBHOOK_SECRET: 'secret',
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        checkout_url: 'https://stripe.example/c/pay/abc',
        stripe_session_id: 'cs_test_123',
      }),
    });
    await loadServerMockMocked(
      tableQueue([{ data: SESSION_ROW, error: null }]),
    );
    const res = await POST(
      makeReq({ session_id: SESSION_ROW.id }, 'NEXT_LOCALE=en'),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { checkout_url: string; session_grant_id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.checkout_url).toContain('stripe.example');
    expect(body.data.session_grant_id).toBe(GRANT_ROW.id);
  });
});
