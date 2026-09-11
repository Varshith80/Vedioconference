import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 5 Slice E — Auth-only test for the cron route.
//
// We stub the service so this file only exercises the
// `x-webhook-secret` check, the env-var-missing guard, and the
// aggregation of the two windows. The service logic itself lives
// in `reminders-service.test.ts` in its own file (with its own
// module registry), so the two surfaces don't fight over
// `vi.resetModules()`.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockRun24h = vi.fn();
const mockRun1h  = vi.fn();
vi.mock('@/services/admin/reminders', () => ({
  runReminderWindow: (window: '24h' | '1h', opts: unknown) =>
    window === '24h' ? mockRun24h(opts) : mockRun1h(opts),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ __admin: true })),
}));

const { POST } = await import('@/app/api/cron/send-reminders/route');
import { NextRequest as NextRequestCtor } from 'next/server';

describe('POST /api/cron/send-reminders — auth', () => {
  beforeEach(() => {
    mockServerEnv.mockReset();
    mockRun24h.mockReset();
    mockRun1h.mockReset();
    mockRun24h.mockResolvedValue({
      window: '24h', considered: 0, dispatched: 0, duplicate: 0,
      skipped: 0, failed: 0, details: [],
    });
    mockRun1h .mockResolvedValue({
      window: '1h', considered: 0, dispatched: 0, duplicate: 0,
      skipped: 0, failed: 0, details: [],
    });
  });

  function makeReq(headers: Record<string, string> = {}) {
    return new NextRequestCtor('http://localhost:3000/api/cron/send-reminders', {
      method: 'POST',
      headers,
    });
  }

  it('returns 401 when N8N_WEBHOOK_SECRET is unset (refuse to disclose route)', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: undefined });
    const res = await POST(makeReq({ 'x-webhook-secret': 'anything' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when x-webhook-secret header is missing', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it('returns 401 when x-webhook-secret header does not match', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    const res = await POST(makeReq({ 'x-webhook-secret': 'wrong' }));
    expect(res.status).toBe(401);
  });

  it('returns 200 with both windows aggregated when the secret matches', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    mockRun24h.mockResolvedValue({
      window: '24h', considered: 5, dispatched: 3, duplicate: 0,
      skipped: 2, failed: 0, details: [],
    });
    mockRun1h .mockResolvedValue({
      window: '1h', considered: 1, dispatched: 1, duplicate: 0,
      skipped: 0, failed: 0, details: [],
    });
    const res = await POST(makeReq({ 'x-webhook-secret': 'shh' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      twentyFourHour: { dispatched: number };
      oneHour: { dispatched: number };
      total: { considered: number; dispatched: number; duplicate: number; skipped: number; failed: number };
      ran_at: string;
    };
    expect(body.ok).toBe(true);
    expect(body.twentyFourHour.dispatched).toBe(3);
    expect(body.oneHour.dispatched).toBe(1);
    expect(body.total).toEqual({ considered: 6, dispatched: 4, duplicate: 0, skipped: 2, failed: 0 });
    expect(typeof body.ran_at).toBe('string');
  });
});
