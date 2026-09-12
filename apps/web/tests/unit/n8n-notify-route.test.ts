import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/n8n/notify` test suite.
//
// Verifies the new email renderer route end-to-end without hitting
// the real Resend API or Supabase. The route is the only entry
// point that turns a `template` enum + `props` into an outbound
// email; every booking-path workflow depends on it.
//
// Coverage matrix:
//   - Authentication (secret unset / wrong / right).
//   - Body validation (discriminated union `type` + template enum).
//   - Recipient safety (admin_* templates ignore the body `to`).
//   - Skip-with-200 path (RESEND_API_KEY unset, RESEND_FROM_EMAIL unset).
//   - Upstream-error path (Resend 4xx/5xx → 502).
//   - Happy path (valid template, Resend called with the right body).
//   - The v1 `module_booking_*` aliases still work for one release.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { POST } = await import('@/app/api/n8n/notify/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown, secret = 'shh'): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-webhook-secret': secret,
  });
  return new NextRequestCtor('http://localhost:3000/api/n8n/notify', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/n8n/notify — auth', () => {
  beforeEach(() => {
    mockServerEnv.mockReset();
    mockFetch.mockReset();
  });

  it('returns 401 when N8N_WEBHOOK_SECRET is unset (refuse to disclose)', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: undefined, RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@x' });
    const res = await POST(makeReq({ type: 'email', template: 'session_booking_confirmed' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the x-webhook-secret header is missing', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@x' });
    const headers = new Headers({ 'content-type': 'application/json' });
    const req = new NextRequestCtor('http://localhost:3000/api/n8n/notify', {
      method: 'POST', headers, body: JSON.stringify({ type: 'email', template: 'session_booking_confirmed' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the x-webhook-secret header does not match', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@x' });
    const res = await POST(makeReq({ type: 'email', template: 'session_booking_confirmed' }, 'wrong'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/n8n/notify — body validation', () => {
  beforeEach(() => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@x' });
    mockFetch.mockReset();
  });

  it('returns 400 on a missing `type` discriminator', async () => {
    const res = await POST(makeReq({ template: 'session_booking_confirmed', to: 'a@b.c' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on an unknown template enum value', async () => {
    const res = await POST(makeReq({ type: 'email', template: 'NOT_A_TEMPLATE' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on an email_tutor missing subject', async () => {
    const res = await POST(makeReq({ type: 'email_tutor', to: 'a@b.c', body: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on a non-admin email template missing `to`', async () => {
    // session_booking_confirmed is non-admin; without `to` we 400.
    const res = await POST(makeReq({ type: 'email', template: 'session_booking_confirmed', props: {} }));
    expect(res.status).toBe(400);
  });

  it('accepts the v1 alias `module_booking_confirmed` for one release', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });
    const res = await POST(makeReq({
      type: 'email',
      template: 'module_booking_confirmed',
      to: 'student@example.org',
      locale: 'fr',
      workflow: 'module-confirmation-email',
      props: { studentName: 'S', moduleTitle: 'Algèbre', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/n8n/notify — recipient safety', () => {
  beforeEach(() => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@x' });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });
  });

  it('hard-codes the recipient for admin_dead_letter (body `to` is ignored)', async () => {
    const res = await POST(makeReq({
      type: 'email',
      template: 'admin_dead_letter',
      to: 'attacker@evil.example',
      locale: 'en',
      workflow: 'enrollment-created',
      props: { workflow: 'enrollment-created', errorMessage: 'oops' },
    }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as { to: string[] };
    expect(body.to).toEqual(['admin@coursenligne.fr']);
  });

  it('hard-codes the recipient for admin_booking_confirmed too', async () => {
    const res = await POST(makeReq({
      type: 'email',
      template: 'admin_booking_confirmed',
      to: 'attacker@evil.example',
      locale: 'en',
      workflow: 'module-booking-to-zoom',
      props: { workflow: 'module-booking-to-zoom' },
    }));
    expect(res.status).toBe(200);
    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as { to: string[] };
    expect(body.to).toEqual(['admin@coursenligne.fr']);
  });

  it('uses the body `to` for non-admin templates (session_booking_confirmed)', async () => {
    const res = await POST(makeReq({
      type: 'email',
      template: 'session_booking_confirmed',
      to: 'student@example.org',
      locale: 'fr',
      workflow: 'module-booking-to-zoom',
      props: { studentName: 'Élise', sessionTitle: 'Algèbre', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(200);
    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as { to: string[] };
    expect(body.to).toEqual(['student@example.org']);
  });

  it('uses the body `to` for email_tutor (always comes from n8n, not Calendly)', async () => {
    const res = await POST(makeReq({
      type: 'email_tutor',
      to: 'tutor@example.org',
      subject: 'Nouvelle session',
      body: 'Bonjour,',
    }));
    expect(res.status).toBe(200);
    const call = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(call[1].body as string) as { to: string[] };
    expect(body.to).toEqual(['tutor@example.org']);
  });
});

describe('POST /api/n8n/notify — Resend configuration', () => {
  beforeEach(() => {
    mockServerEnv.mockReset();
    mockFetch.mockReset();
  });

  it('returns 200 with skipped:resend_unset when RESEND_API_KEY is unset (no throw on replay)', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: undefined, RESEND_FROM_EMAIL: 'noreply@example.com' });
    const res = await POST(makeReq({
      type: 'email',
      template: 'session_booking_confirmed',
      to: 'student@example.org',
      props: { studentName: 'S', sessionTitle: 'T', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped: string };
    expect(body.ok).toBe(true);
    expect(body.skipped).toBe('resend_unset');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 200 with skipped:resend_from_unset when RESEND_FROM_EMAIL is unset', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: undefined });
    const res = await POST(makeReq({
      type: 'email',
      template: 'session_booking_confirmed',
      to: 'student@example.org',
      props: { studentName: 'S', sessionTitle: 'T', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; skipped: string };
    expect(body.skipped).toBe('resend_from_unset');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns 502 upstream_error when Resend returns 4xx/5xx', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@example.com' });
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: async () => 'invalid recipient' });
    const res = await POST(makeReq({
      type: 'email',
      template: 'session_booking_confirmed',
      to: 'student@example.org',
      props: { studentName: 'S', sessionTitle: 'T', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('upstream_error');
  });

  it('happy path: calls Resend with the rendered subject/html/text', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh', RESEND_API_KEY: 'r', RESEND_FROM_EMAIL: 'noreply@example.com' });
    mockFetch.mockResolvedValue({ ok: true, text: async () => '' });
    const res = await POST(makeReq({
      type: 'email',
      template: 'session_booking_confirmed',
      to: 'student@example.org',
      locale: 'fr',
      workflow: 'module-booking-to-zoom',
      props: { studentName: 'Élise', sessionTitle: 'Algèbre', scheduledStartIso: '2026-09-12T10:00:00Z', joinUrl: 'https://zoom.us/j/1' },
    }));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer r');
    const body = JSON.parse(init.body as string) as { from: string; to: string[]; subject: string; html: string; text: string };
    expect(body.from).toBe('noreply@example.com');
    expect(body.to).toEqual(['student@example.org']);
    expect(body.subject).toMatch(/confirmée/i);
    expect(body.html).toContain('Élise');
    expect(body.html).toContain('Algèbre');
    expect(body.text).toContain('Élise');
  });
});
