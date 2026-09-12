import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/webhooks/stripe` v2 regression test.
//
// The route is the v2 Stripe webhook handler. It is the v1
// `enrollment_id`-shaped handler is REMOVED; the v2 route keys
// on `session_grant_id` and delegates to `markSessionGrantPaid`.
// This test is a thin smoke covering:
//   - 401 on missing signature.
//   - 401 on invalid signature.
//   - 200 on dedup (replay of an event_id already in webhook_events).
//   - 200 on a fresh `checkout.session.completed` carrying
//     session_grant_id in metadata.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockMarkPaid = vi.fn();
vi.mock('@/services/curriculum/session-grants', () => ({
  markSessionGrantPaid: mockMarkPaid,
}));

// The Stripe client is needed by the route to verify the signature.
// We stub the bare minimum: the `webhooks.constructEvent` method,
// which throws on a bad signature.
const mockConstructEvent = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  stripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

interface Op { kind: 'insert' | 'update'; table: string; body: unknown; }
const ops: Op[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      insert: async (body: unknown) => {
        ops.push({ kind: 'insert', table, body });
        // The webhook_events dedup is the only one we care about.
        if (table === 'webhook_events') {
          // The first insert succeeds; the second returns a 23505
          // collision. The test can opt-in to this behavior by
          // calling `setDedup()` before the replay.
          const last = ops.filter((o) => o.kind === 'insert' && o.table === 'webhook_events' && (o.body as { event_id?: string }).event_id === (body as { event_id?: string }).event_id);
          if (last.length > 1) return { error: { code: '23505', message: 'duplicate' } };
        }
        return { error: null };
      },
      update: (body: unknown) => {
        const thenable = {
          eq: () => thenable,
          then: (onFulfilled: (v: unknown) => unknown) => {
            ops.push({ kind: 'update', table, body });
            return Promise.resolve({ error: null }).then(onFulfilled);
          },
        };
        return thenable;
      },
    }),
  })),
}));

const { POST } = await import('@/app/api/webhooks/stripe/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(rawBody: string, signature: string | null): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('stripe-signature', signature);
  return new NextRequestCtor('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST', headers, body: rawBody,
  });
}

beforeEach(() => {
  mockServerEnv.mockReset();
  mockMarkPaid.mockReset();
  mockConstructEvent.mockReset();
  ops.length = 0;
  mockServerEnv.mockReturnValue({ STRIPE_WEBHOOK_SECRET: 'whsec_abc' });
});

describe('POST /api/webhooks/stripe — auth / signature', () => {
  it('returns 401 when the stripe-signature header is missing', async () => {
    const res = await POST(makeReq('{"id":"evt_1","type":"checkout.session.completed"}', null));
    expect(res.status).toBe(401);
  });

  it('returns 401 when signature verification fails (Stripe throws)', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload.');
    });
    const res = await POST(makeReq('{"id":"evt_1","type":"checkout.session.completed"}', 'bogus'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when STRIPE_WEBHOOK_SECRET is unset (refuse to disclose)', async () => {
    mockServerEnv.mockReturnValue({ STRIPE_WEBHOOK_SECRET: undefined });
    mockConstructEvent.mockReset();
    const res = await POST(makeReq('{}', 't=1,v1=0'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhooks/stripe — happy path (v2 session_grant_id)', () => {
  it('returns 200 and dedups a replayed event_id (no markSessionGrantPaid call)', async () => {
    const event = {
      id: 'evt_1', type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { session_grant_id: 'g1' } } },
    };
    // First constructEvent: fresh event.
    // Second constructEvent: same event_id, the table returns 23505.
    mockConstructEvent.mockReturnValue(event);
    const raw = JSON.stringify(event);
    const sig = 't=1700000000,v1=deadbeef';
    const res1 = await POST(makeReq(raw, sig));
    const res2 = await POST(makeReq(raw, sig));
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const body1 = (await res1.json()) as { received: boolean; duplicate?: boolean };
    const body2 = (await res2.json()) as { received: boolean; duplicate?: boolean };
    expect(body1.received).toBe(true);
    expect(body1.duplicate).toBeFalsy();
    expect(body2.received).toBe(true);
    expect(body2.duplicate).toBe(true);
    // markSessionGrantPaid must be called exactly once (on the fresh
    // event). The dedup replay does NOT trigger it.
    expect(mockMarkPaid).toHaveBeenCalledTimes(1);
    expect(mockMarkPaid).toHaveBeenCalledWith('g1', 'cs_1', undefined);
  });
});
