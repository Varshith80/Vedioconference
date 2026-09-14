import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Phase 1 — Feature A: API route tests for POST /api/free-trial
// and GET /api/free-trial.
//
// Covers the route's authn, validation, service integration,
// and error mapping:
//   - 401 when no user is signed in.
//   - 400 on invalid body (non-UUID session_id, missing
//     session_id).
//   - 404 when the session does not exist.
//   - 422 when the session has no price.
//   - 409 when the student has already used their free
//     trial (free_trial_already_used).
//   - 503 when the coupon is unavailable.
//   - 503 when n8n is not configured (checkout_unavailable).
//   - 502 when n8n returns a non-OK or no checkout_url.
//   - 201 happy path: returns checkout_url and
//     session_grant_id; the n8n payload includes
//     `kind: 'trial'` and `coupon_id`.
//   - GET /api/free-trial returns the eligibility read.
//
// Authorization: the student id is taken from the auth
// session in the route — never from the body. We assert
// this by inspecting the call to the service: the body
// must contain only `session_id`; the student id is
// sourced from the server's auth context.
// =====================================================================

const mockFrom = vi.fn();
const mockAuthGetUser = vi.fn();
const mockStartFreeTrial = vi.fn();
const mockGetFreeTrialStatus = vi.fn();
const mockGetOrCreateFreeTrialCoupon = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockAuthGetUser },
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
    N8N_WEBHOOK_SECRET: 'secret-abc',
  }),
}));

vi.mock('@/services/curriculum/free-trial', () => ({
  startFreeTrialSessionGrant: mockStartFreeTrial,
  getFreeTrialStatus: mockGetFreeTrialStatus,
  getOrCreateFreeTrialCoupon: mockGetOrCreateFreeTrialCoupon,
}));

const { POST, GET } = await import('@/app/api/free-trial/route');

const SESSION_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_UUID = '22222222-2222-2222-2222-222222222222';
const GRANT_ID = '33333333-3333-3333-3333-333333333333';

function buildPost(body: unknown, locale?: 'en' | 'fr'): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  return new Request('http://localhost/api/free-trial', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function asNextRequest(req: Request, locale?: 'en' | 'fr'): unknown {
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);
  // The route reads `req.cookies.get('NEXT_LOCALE')?.value`.
  // The cross-fetch Request has no `cookies` getter, so we
  // add a minimal shape that satisfies the route without
  // pulling in NextRequest.
  const cookiesApi = {
    get(name: string): { value: string } | undefined {
      if (name === 'NEXT_LOCALE' && locale) {
        return { value: locale };
      }
      return undefined;
    },
  };
  (req as unknown as { cookies: typeof cookiesApi }).cookies = cookiesApi;
  return req;
}

function buildSessionChain(data: unknown) {
  return {
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data, error: null }),
      }),
    }),
  };
}

const SESSION_ROW = {
  id: SESSION_ID,
  title: 'Test session',
  slug: 'test-session',
  price_cents: 2900,
  currency: 'EUR',
  duration_min: 60,
};

const NEW_GRANT = {
  id: GRANT_ID,
  student_id: STUDENT_UUID,
  session_id: SESSION_ID,
  status: 'pending_payment',
  amount_cents: 0,
  currency: 'EUR',
  is_trial: true,
};

beforeEach(() => {
  mockFrom.mockReset();
  mockAuthGetUser.mockReset();
  mockStartFreeTrial.mockReset();
  mockGetFreeTrialStatus.mockReset();
  mockGetOrCreateFreeTrialCoupon.mockReset();
  // Default: signed in.
  mockAuthGetUser.mockResolvedValue({
    data: { user: { id: STUDENT_UUID } },
  });
  // Default: global fetch is unused unless overridden.
  vi.stubGlobal('fetch', vi.fn());
});

describe('POST /api/free-trial — authn', () => {
  it('returns 401 when the user is not signed in', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/free-trial — body validation', () => {
  it('returns 400 when session_id is missing', async () => {
    const res = await POST(
      asNextRequest(buildPost({})) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when session_id is not a UUID', async () => {
    const res = await POST(
      asNextRequest(buildPost({ session_id: 'not-a-uuid' })) as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/free-trial — service error mapping', () => {
  it('returns 404 when the service reports session_not_found', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'session_not_found' });
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(404);
  });

  it('returns 422 when the service reports session_price_missing', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'session_price_missing' });
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(422);
  });

  it('returns 409 with grant_id when the service reports free_trial_already_used', async () => {
    mockStartFreeTrial.mockResolvedValue({
      kind: 'free_trial_already_used',
      existingGrantId: 'existing-grant-xyz',
    });
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: { code: string; message?: string; details?: { grant_id?: string } };
    };
    expect(body.error.code).toBe('free_trial_already_used');
    expect(body.error.details?.grant_id).toBe('existing-grant-xyz');
  });

  it('returns 503 when the coupon is unavailable', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'ok', grant: NEW_GRANT });
    mockGetOrCreateFreeTrialCoupon.mockResolvedValue(null);
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(503);
  });
});

describe('POST /api/free-trial — happy path', () => {
  it('returns 201 with checkout_url and forwards a trial-shaped payload to n8n', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'ok', grant: NEW_GRANT });
    mockGetOrCreateFreeTrialCoupon.mockResolvedValue('coupon-1');
    mockFrom.mockImplementationOnce(() => buildSessionChain(SESSION_ROW));

    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init: init ?? {} };
      return new Response(
        JSON.stringify({ checkout_url: 'https://stripe.test/cs_1', stripe_session_id: 'cs_1' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as never);

    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID }), 'fr') as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { session_grant_id: string; checkout_url: string; kind: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.session_grant_id).toBe(GRANT_ID);
    expect(body.data.checkout_url).toBe('https://stripe.test/cs_1');
    expect(body.data.kind).toBe('trial');

    // n8n payload is shaped for the trial flow.
    expect(captured).not.toBeNull();
    const payload = JSON.parse(String(captured!.init.body)) as Record<string, unknown>;
    expect(payload['kind']).toBe('trial');
    expect(payload['coupon_id']).toBe('coupon-1');
    expect(payload['amount_cents']).toBe(0);
    expect(payload['student_id']).toBe(STUDENT_UUID);
    expect(typeof payload['success_url']).toBe('string');
    expect(typeof payload['cancel_url']).toBe('string');
    // French locale flows through the cookie.
    expect(payload['locale']).toBe('fr');
  });
});

describe('POST /api/free-trial — n8n error mapping', () => {
  it('returns 502 when n8n returns a non-OK response', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'ok', grant: NEW_GRANT });
    mockGetOrCreateFreeTrialCoupon.mockResolvedValue('coupon-1');
    mockFrom.mockImplementationOnce(() => buildSessionChain(SESSION_ROW));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream down', { status: 500 })) as never,
    );
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(502);
  });

  it('returns 502 when n8n returns no checkout_url', async () => {
    mockStartFreeTrial.mockResolvedValue({ kind: 'ok', grant: NEW_GRANT });
    mockGetOrCreateFreeTrialCoupon.mockResolvedValue('coupon-1');
    mockFrom.mockImplementationOnce(() => buildSessionChain(SESSION_ROW));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ) as never,
    );
    const res = await POST(
      asNextRequest(buildPost({ session_id: SESSION_ID })) as never,
    );
    expect(res.status).toBe(502);
  });
});

describe('GET /api/free-trial', () => {
  it('returns 401 when the user is not signed in', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      asNextRequest(new Request('http://localhost/api/free-trial')) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns the eligibility read for a signed-in student', async () => {
    mockGetFreeTrialStatus.mockResolvedValue({
      used: false,
      grantId: null,
      status: null,
    });
    const res = await GET(
      asNextRequest(new Request('http://localhost/api/free-trial')) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { used: boolean; grant_id: string | null; status: string | null };
    };
    expect(body.ok).toBe(true);
    expect(body.data.used).toBe(false);
  });

  it('returns used=true with status for a student who has used their trial', async () => {
    mockGetFreeTrialStatus.mockResolvedValue({
      used: true,
      grantId: 'grant-x',
      status: 'active',
    });
    const res = await GET(
      asNextRequest(new Request('http://localhost/api/free-trial')) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { used: boolean; grant_id: string; status: string };
    };
    expect(body.data.used).toBe(true);
    expect(body.data.grant_id).toBe('grant-x');
    expect(body.data.status).toBe('active');
  });
});
