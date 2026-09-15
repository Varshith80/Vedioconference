import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/webhooks/calendly` smoke test.
//
// The route is the v2 Calendly inbound: HMAC-verified, deduped via
// `webhook_events`, then fire-and-forwarded to the n8n booking
// webhook. The test pins:
//   - 401 on missing signature.
//   - 401 on signature verification failure (wrong t=, v1=).
//   - 200 on a valid signature with the right env vars.
//   - 200 with the forwarded body to n8n
//     ({ type: 'invitee.created', event_id, payload }).
//   - When N8N_ENROLLMENT_WEBHOOK_URL is unset, the route still
//     200s (the calendly-only path completes the dedup; the
//     forward is logged but not fetched).
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      insert: async () => ({ error: null }),
      update: () => ({ eq: () => ({ eq: () => undefined }) }),
    }),
  })),
}));

const { POST } = await import('@/app/api/webhooks/calendly/route');
import { NextRequest as NextRequestCtor } from 'next/server';
import { createHmac } from 'node:crypto';

function signCalendly(payload: string, secret: string, t = '1700000000'): string {
  // Calendly format: t=<unix>,v1=<hex hmac sha256 of "<t>.<raw>">
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

function makeReq(rawBody: string, signature: string | null): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature !== null) headers.set('calendly-webhook-signature', signature);
  return new NextRequestCtor('http://localhost:3000/api/webhooks/calendly', {
    method: 'POST', headers, body: rawBody,
  });
}

beforeEach(() => {
  mockServerEnv.mockReset();
  mockFetch.mockReset();
  mockServerEnv.mockReturnValue({
    CALENDLY_WEBHOOK_SIGNING_KEY: 'cal_shh',
    N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.example/webhook',
    N8N_WEBHOOK_SECRET: 'n8n_shh',
  });
});

describe('POST /api/webhooks/calendly — auth / signature', () => {
  it('returns 401 when the signature header is missing', async () => {
    const res = await POST(makeReq('{"event":"invitee.created"}', null));
    expect(res.status).toBe(401);
  });

  it('returns 401 on a signature that does not verify', async () => {
    const res = await POST(makeReq('{"event":"invitee.created"}', 't=1,v1=deadbeef'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when CALENDLY_WEBHOOK_SIGNING_KEY is unset', async () => {
    mockServerEnv.mockReturnValue({ CALENDLY_WEBHOOK_SIGNING_KEY: undefined });
    const payload = '{"event":"invitee.created"}';
    const res = await POST(makeReq(payload, signCalendly(payload, 'whatever')));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhooks/calendly — happy path', () => {
  it('returns 200 and forwards the payload to n8n (type=invitee.created) when N8N_ENROLLMENT_WEBHOOK_URL is set', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });

    const payload = JSON.stringify({
      event: 'invitee.created',
      payload: {
        uri: 'https://api.calendly.com/scheduled_events/abc/invitees/xyz',
        event: 'https://api.calendly.com/scheduled_events/abc',
      },
    });
    const res = await POST(makeReq(payload, signCalendly(payload, 'cal_shh')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    // The forwarded body must include type: 'invitee.created', an
    // event_id, and the original payload.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://n8n.example/webhook/calendly');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-webhook-secret']).toBe('n8n_shh');
    const bodyOut = JSON.parse(init.body as string) as { type: string; event_id: string; payload: { uri: string } };
    expect(bodyOut.type).toBe('invitee.created');
    expect(bodyOut.event_id).toBeTruthy();
    expect(bodyOut.payload.uri).toBe('https://api.calendly.com/scheduled_events/abc/invitees/xyz');
  });

  it('returns 200 and does NOT forward when N8N_ENROLLMENT_WEBHOOK_URL is unset (mock mode)', async () => {
    mockServerEnv.mockReturnValue({
      CALENDLY_WEBHOOK_SIGNING_KEY: 'cal_shh',
      N8N_ENROLLMENT_WEBHOOK_URL: undefined,
      N8N_WEBHOOK_SECRET: 'n8n_shh',
    });
    const payload = JSON.stringify({ event: 'invitee.created', payload: { uri: 'x' } });
    const res = await POST(makeReq(payload, signCalendly(payload, 'cal_shh')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// =====================================================================
// TASK 21 — GAP 2 — Calendly invites relay coverage.
//
// The booking-path pipeline expects three Calendly events on the
// n8n enrolment webhook:
//   - invitee.created  → module-booking-to-zoom
//   - invitee.updated  → module-reschedule
//   - invitee.canceled → module-cancellation
//
// The route forwards all three to the same `${WEBHOOK}/calendly`
// path with the same `x-webhook-secret` header; the downstream
// `type` discriminator tells n8n which child workflow to dispatch.
// Each event carries its own webhook_events id, so the
// `webhook_events.UNIQUE (provider, event_id)` idempotency rule
// applies independently to each event.
//
// Three contract assertions:
//   1. invitee.updated is forwarded with type=invitee.updated
//      (no longer dropped silently).
//   2. invitee.canceled is forwarded with type=invitee.canceled
//      (no longer dropped silently).
//   3. The original invitee.created path is unchanged
//      (regression pin).
//
// Both new cases assert:
//   - HTTP 200,
//   - mockFetch called exactly once,
//   - URL = `${WEBHOOK}/calendly`,
//   - header `x-webhook-secret` echoes the env secret,
//   - forwarded body `type` mirrors `body.event` exactly,
//   - forwarded body `payload.uri` mirrors the original payload.
// =====================================================================

describe('POST /api/webhooks/calendly — TASK 21 GAP 2 (invitee.updated + invitee.canceled)', () => {
  it('returns 200 and forwards invitee.updated to n8n with type=invitee.updated', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });

    const payload = JSON.stringify({
      event: 'invitee.updated',
      payload: {
        uri: 'https://api.calendly.com/scheduled_events/abc/invitees/xyz',
        event: 'https://api.calendly.com/scheduled_events/abc',
      },
    });
    const res = await POST(makeReq(payload, signCalendly(payload, 'cal_shh')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://n8n.example/webhook/calendly');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-webhook-secret']).toBe('n8n_shh');
    const bodyOut = JSON.parse(init.body as string) as { type: string; event_id: string; payload: { uri: string } };
    // The type discriminator must mirror body.event — the test
    // name says updated, the wire says updated, not a stringified
    // literal and not the old hardcoded 'invitee.created'.
    expect(bodyOut.type).toBe('invitee.updated');
    expect(bodyOut.type).not.toBe('invitee.created');
    expect(bodyOut.event_id).toBeTruthy();
    expect(bodyOut.event_id).toContain('invitee.updated-');
    expect(bodyOut.payload.uri).toBe('https://api.calendly.com/scheduled_events/abc/invitees/xyz');
  });

  it('returns 200 and forwards invitee.canceled to n8n with type=invitee.canceled', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });

    const payload = JSON.stringify({
      event: 'invitee.canceled',
      payload: {
        uri: 'https://api.calendly.com/scheduled_events/abc/invitees/xyz',
        event: 'https://api.calendly.com/scheduled_events/abc',
      },
    });
    const res = await POST(makeReq(payload, signCalendly(payload, 'cal_shh')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://n8n.example/webhook/calendly');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-webhook-secret']).toBe('n8n_shh');
    const bodyOut = JSON.parse(init.body as string) as { type: string; event_id: string; payload: { uri: string } };
    expect(bodyOut.type).toBe('invitee.canceled');
    expect(bodyOut.type).not.toBe('invitee.created');
    expect(bodyOut.event_id).toBeTruthy();
    expect(bodyOut.event_id).toContain('invitee.canceled-');
    expect(bodyOut.payload.uri).toBe('https://api.calendly.com/scheduled_events/abc/invitees/xyz');
  });

  it('invitee.created regression: the original invited.created forward path is unchanged', async () => {
    // Pin: TASK 21 GAP 2 only widens the forward branch — it does
    // NOT change the wire shape of invitee.created. This regression
    // test exists so a future refactor that narrows the condition
    // back to a single equality would still see the canonical case
    // pinning `type: 'invitee.created'` against the env echo.
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });

    const payload = JSON.stringify({
      event: 'invitee.created',
      payload: {
        uri: 'https://api.calendly.com/scheduled_events/abc/invitees/xyz',
        event: 'https://api.calendly.com/scheduled_events/abc',
      },
    });
    const res = await POST(makeReq(payload, signCalendly(payload, 'cal_shh')));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://n8n.example/webhook/calendly');
    const bodyOut = JSON.parse(init.body as string) as { type: string };
    expect(bodyOut.type).toBe('invitee.created');
  });
});
