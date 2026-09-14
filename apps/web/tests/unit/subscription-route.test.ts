import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 — Feature C — POST /api/subscriptions route.
//
//   - 401 when not signed in.
//   - 400 on invalid body (kind missing or not 'monthly').
//   - 409 when the service reports duplicate_subscription
//     (the user already has an active Monthly Support).
//   - 500 when the service reports unknown (defensive).
//   - 503 when N8N_ENROLLMENT_WEBHOOK_URL is unset.
//   - 502 when n8n returns non-OK.
//   - 201 happy path: returns subscription_id + checkout_url +
//     stripe_session_id; the n8n payload carries kind='monthly'
//     and session_grant_id.
//
// Authorization: the student id is taken from the auth session
// in the route — never from the body.
// =====================================================================

const mockAuthGetUser = vi.fn();
const mockProvision = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockAuthGetUser },
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

vi.mock('@/services/curriculum/monthly-subscriptions', () => ({
  provisionMonthlySubscription: mockProvision,
  MONTHLY_PRICE_CENTS: 10900,
  MONTHLY_CURRENCY: 'EUR',
}));

const { POST } = await import('@/app/api/subscriptions/route');

const STUDENT_UUID = '22222222-2222-2222-2222-222222222222';

function buildPost(body: unknown): Request {
  return new Request('http://localhost/api/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function asNextRequest(req: Request): unknown {
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);
  const cookiesApi = {
    get(name: string): { value: string } | undefined {
      if (name === 'NEXT_LOCALE') return { value: 'en' };
      return undefined;
    },
  };
  (req as unknown as { cookies: typeof cookiesApi }).cookies = cookiesApi;
  return req;
}

beforeEach(() => {
  mockAuthGetUser.mockReset();
  mockProvision.mockReset();
  mockServerEnv.mockReset();
  // Default: signed in.
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: STUDENT_UUID } },
  });
  vi.stubGlobal('fetch', vi.fn());
});

describe('POST /api/subscriptions — authn', () => {
  it('returns 401 when the user is not signed in', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/subscriptions — body validation', () => {
  it('returns 400 when kind is missing', async () => {
    const res = await POST(asNextRequest(buildPost({})) as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when kind is not "monthly"', async () => {
    const res = await POST(
      asNextRequest(buildPost({ kind: 'pack' })) as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/subscriptions — service error mapping', () => {
  it('returns 409 with subscription_id when the service reports duplicate_subscription', async () => {
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
      N8N_WEBHOOK_SECRET: 'secret-abc',
    });
    mockProvision.mockResolvedValue({
      kind: 'duplicate_subscription',
      subscriptionId: 'sub_existing',
    });
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: { code: string; details?: { subscription_id?: string } };
    };
    expect(body.error.code).toBe('monthly_subscription_exists');
    expect(body.error.details?.subscription_id).toBe('sub_existing');
  });

  it('returns 500 when the service reports unknown', async () => {
    mockProvision.mockResolvedValue({ kind: 'unknown' });
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/subscriptions — mock-gated n8n call', () => {
  it('returns 503 checkout_unavailable when N8N_ENROLLMENT_WEBHOOK_URL is unset', async () => {
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: null,
      N8N_WEBHOOK_SECRET: null,
    });
    mockProvision.mockResolvedValue({
      kind: 'ok',
      subscriptionId: 'sub_new_001',
      grantId: 'grant_new_001',
      periodGrantsId: 'sub_new_001:2026-09-14T00:00:00.000Z',
    });
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('checkout_unavailable');
  });

  it('returns 502 checkout_provider_error when n8n returns non-OK', async () => {
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
      N8N_WEBHOOK_SECRET: 'secret-abc',
    });
    mockProvision.mockResolvedValue({
      kind: 'ok',
      subscriptionId: 'sub_new_001',
      grantId: 'grant_new_001',
      periodGrantsId: 'sub_new_001:2026-09-14T00:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream down', { status: 500 })) as never,
    );
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('checkout_provider_error');
  });

  it('returns 502 when n8n returns no checkout_url', async () => {
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
      N8N_WEBHOOK_SECRET: 'secret-abc',
    });
    mockProvision.mockResolvedValue({
      kind: 'ok',
      subscriptionId: 'sub_new_001',
      grantId: 'grant_new_001',
      periodGrantsId: 'sub_new_001:2026-09-14T00:00:00.000Z',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })) as never,
    );
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(502);
  });
});

describe('POST /api/subscriptions — happy path', () => {
  it('returns 201 with checkout_url + kind=monthly when n8n succeeds', async () => {
    mockServerEnv.mockReturnValue({
      N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
      N8N_WEBHOOK_SECRET: 'secret-abc',
    });
    mockProvision.mockResolvedValue({
      kind: 'ok',
      subscriptionId: 'sub_new_001',
      grantId: 'grant_new_001',
      periodGrantsId: 'sub_new_001:2026-09-14T00:00:00.000Z',
    });
    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        captured = { url, init: init ?? {} };
        return new Response(
          JSON.stringify({
            checkout_url: 'https://stripe.test/c/sess_001',
            stripe_session_id: 'cs_001',
          }),
          { status: 200 },
        );
      }) as never,
    );
    const res = await POST(asNextRequest(buildPost({ kind: 'monthly' })) as never);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: {
        subscription_id: string;
        checkout_url: string;
        stripe_session_id: string | null;
        kind: string;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.data.kind).toBe('monthly');
    expect(body.data.checkout_url).toBe('https://stripe.test/c/sess_001');
    expect(body.data.stripe_session_id).toBe('cs_001');
    expect(body.data.subscription_id).toBe('sub_new_001');

    // Verify the n8n payload carries kind='monthly' + session_grant_id.
    expect(captured).not.toBeNull();
    const n8nPayload = JSON.parse(String(captured!.init.body)) as Record<string, unknown>;
    expect(n8nPayload['kind']).toBe('monthly');
    expect(n8nPayload['session_grant_id']).toBe('grant_new_001');
    expect(n8nPayload['student_id']).toBe(STUDENT_UUID);
    expect(n8nPayload['amount_cents']).toBe(10900);
    expect(n8nPayload['currency']).toBe('EUR');
  });
});
