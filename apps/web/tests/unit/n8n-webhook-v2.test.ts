import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/webhooks/n8n` test.
//
// Verifies the v2 inbound event types: the route is the only place
// that turns an n8n callback into a Supabase write. The new I-1
// cases (`session_booking_rescheduled`, `session_completed`) are
// the focus; the pre-existing v2 cases (`meeting_created`,
// `session_grant_checkout_created`, …) get one regression
// assertion each so the v2 handler is fully pinned.
//
// Coverage matrix:
//   - Authentication (secret unset / wrong / right).
//   - 400 on missing `type`.
//   - meeting_created → upsert meeting_links + flip booking to confirmed.
//   - session_grant_checkout_created → update session_grants.stripe_session_id.
//   - session_booking_cancelled → flip status + cancelled_at.
//   - session_booking_rescheduled → update scheduled_start/end + status.
//   - session_completed → flip status to completed (idempotent on replay).
//   - workflow_failed → insert into n8n_dead_letters.
//   - unknown type → 200 with received:true, no DB write.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

// A tiny in-memory operation recorder. Each call to
// admin.from(table).(insert|update|upsert) records an op when
// the chain "terminates" — i.e. when the caller awaits the
// returned promise OR fires a terminating chain method
// (`.in`, `.single`, `.maybeSingle`).
interface Op {
  table: string;
  kind:   'insert' | 'update' | 'upsert' | 'select';
  body:   unknown;
  eqs:    Array<{ col: string; val: unknown }>;
  ins:    Array<{ col: string; vals: unknown[] }>;
}
const ops: Op[] = [];

interface Chain {
  select: (cols?: string) => Chain;
  eq:    (col: string, val: unknown) => Chain;
  in:    (col: string, vals: unknown[]) => Promise<unknown>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  single:     () => Promise<{ data: unknown; error: null }>;
  insert:     (body: unknown) => Promise<{ error: null | { code?: string; message: string } }>;
  update:     (body: unknown) => Chain;
  upsert:     (body: unknown, opts?: unknown) => Promise<{ error: null | { code?: string; message: string } }>;
}

function makeChain(table: string): Chain {
  const eqs:    Op['eqs'] = [];
  const ins:    Op['ins'] = [];
  let pendingBody: unknown = null;
  let pendingKind: Op['kind'] | null = null;
  const flush = () => {
    if (pendingKind) {
      ops.push({ table, kind: pendingKind, body: pendingBody, eqs: [...eqs], ins: [...ins] });
      pendingBody = null;
      pendingKind = null;
      eqs.length = 0;
      ins.length = 0;
    }
  };
  // The chain is *thenable*: any `await chain` (i.e. when the
  // caller discards the returned chain object after `.eq` or
  // `.select`) flushes the pending op. supabase-js's
  // PostgrestFilterBuilder is itself a thenable Promise, so this
  // mirrors real behavior.
  const chain: Chain = Object.assign(
    (() => chain) as unknown as Chain,
    {
      select: () => chain,
      eq: (col: string, val: unknown) => { eqs.push({ col, val }); return chain; },
      in: (col: string, vals: unknown[]) => {
        ins.push({ col, vals });
        flush();
        return Promise.resolve({ error: null });
      },
      maybeSingle: async () => { flush(); return { data: null, error: null }; },
      single:     async () => { flush(); return { data: null, error: null }; },
      insert:     async (body: unknown) => { ops.push({ table, kind: 'insert', body, eqs: [...eqs], ins: [...ins] }); eqs.length = 0; ins.length = 0; return { error: null }; },
      update:     (body: unknown) => { pendingBody = body; pendingKind = 'update'; return chain; },
      upsert:     async (body: unknown) => { ops.push({ table, kind: 'upsert', body, eqs: [...eqs], ins: [...ins] }); eqs.length = 0; ins.length = 0; return { error: null }; },
      // Thenable: when the caller does `await someChain` (e.g.
      // `await admin.from('t').update({...}).eq('id', id);`)
      // and discards the result, JS will call `.then(onFulfilled)`
      // on the chain. We flush the pending op there.
      then: (onFulfilled: (v: unknown) => unknown) => {
        flush();
        return Promise.resolve({ error: null }).then(onFulfilled);
      },
    } as Chain & { then: <T>(onFulfilled: (v: unknown) => T) => Promise<T> },
  ) as unknown as Chain;
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: (table: string) => makeChain(table),
  })),
}));

const { POST } = await import('@/app/api/webhooks/n8n/route');
import { NextRequest as NextRequestCtor } from 'next/server';

function makeReq(body: unknown, secret = 'shh'): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-webhook-secret': secret,
  });
  return new NextRequestCtor('http://localhost:3000/api/webhooks/n8n', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockServerEnv.mockReset();
  ops.length = 0;
  mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
});

describe('POST /api/webhooks/n8n — auth', () => {
  it('returns 401 when N8N_WEBHOOK_SECRET is unset', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: undefined });
    const res = await POST(makeReq({ type: 'session_completed', session_booking_id: 'b1' }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the x-webhook-secret header is wrong', async () => {
    const res = await POST(makeReq({ type: 'session_completed', session_booking_id: 'b1' }, 'wrong'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on a missing `type`', async () => {
    const res = await POST(makeReq({ session_booking_id: 'b1' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/webhooks/n8n — v2 business events', () => {
  it('meeting_created: upserts meeting_links with the supplied meeting fields', async () => {
    const res = await POST(makeReq({
      type: 'meeting_created',
      session_booking_id: 'b1',
      meeting_id: '999',
      join_url: 'https://zoom.us/j/1',
      passcode: 'pw',
      start_url: 'https://zoom.us/s/1',
    }));
    expect(res.status).toBe(200);
    const upsert = ops.find((o) => o.table === 'meeting_links' && o.kind === 'upsert');
    expect(upsert).toBeTruthy();
    expect((upsert!.body as { session_booking_id: string }).session_booking_id).toBe('b1');
    expect((upsert!.body as { meeting_id: string }).meeting_id).toBe('999');
  });

  it('session_grant_checkout_created: writes stripe_session_id back to session_grants', async () => {
    const res = await POST(makeReq({
      type: 'session_grant_checkout_created',
      session_grant_id: 'g1',
      stripe_session_id: 'cs_abc',
    }));
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.table === 'session_grants' && o.kind === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as { stripe_session_id: string }).stripe_session_id).toBe('cs_abc');
  });

  it('session_booking_cancelled: flips status + cancelled_at', async () => {
    const res = await POST(makeReq({
      type: 'session_booking_cancelled',
      session_booking_id: 'b1',
    }));
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.table === 'session_bookings' && o.kind === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as { status: string }).status).toBe('cancelled');
    expect((upd!.body as Record<string, unknown>)['cancelled_at']).toBeTruthy();
  });

  it('session_booking_rescheduled: updates scheduled_start + scheduled_end and flips status to confirmed', async () => {
    const res = await POST(makeReq({
      type: 'session_booking_rescheduled',
      session_booking_id: 'b1',
      new_scheduled_start: '2026-10-01T10:00:00Z',
      new_scheduled_end:   '2026-10-01T11:00:00Z',
    }));
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.table === 'session_bookings' && o.kind === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as Record<string, unknown>)['scheduled_start']).toBe('2026-10-01T10:00:00Z');
    expect((upd!.body as Record<string, unknown>)['scheduled_end']).toBe('2026-10-01T11:00:00Z');
    expect((upd!.body as { status: string }).status).toBe('confirmed');
    // The update must be guarded by the in('status', ['scheduled', 'confirmed']) predicate.
    const inClause = upd!.ins.find((x) => x.col === 'status');
    expect(inClause).toBeTruthy();
    expect(inClause!.vals).toEqual(['scheduled', 'confirmed']);
  });

  it('session_completed: flips status to completed with the supplied completed_at', async () => {
    const res = await POST(makeReq({
      type: 'session_completed',
      session_booking_id: 'b1',
      completed_at: '2026-09-12T11:05:00Z',
    }));
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.table === 'session_bookings' && o.kind === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as { status: string }).status).toBe('completed');
    expect((upd!.body as Record<string, unknown>)['updated_at']).toBe('2026-09-12T11:05:00Z');
    // Idempotency guard.
    const inClause = upd!.ins.find((x) => x.col === 'status');
    expect(inClause).toBeTruthy();
    expect(inClause!.vals).toEqual(['scheduled', 'confirmed']);
  });

  it('session_completed: defaults completed_at to now() when missing', async () => {
    const res = await POST(makeReq({
      type: 'session_completed',
      session_booking_id: 'b1',
    }));
    expect(res.status).toBe(200);
    const upd = ops.find((o) => o.table === 'session_bookings' && o.kind === 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as { status: string }).status).toBe('completed');
    // updated_at is a parseable ISO timestamp.
    expect((upd!.body as Record<string, unknown>)['updated_at']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('workflow_failed: inserts into n8n_dead_letters', async () => {
    const res = await POST(makeReq({
      type: 'workflow_failed',
      workflow: 'enrollment-created',
      error: 'Stripe 500',
      original_event: { type: 'enrollment-created' },
    }));
    expect(res.status).toBe(200);
    const ins = ops.find((o) => o.table === 'n8n_dead_letters' && o.kind === 'insert');
    expect(ins).toBeTruthy();
    expect((ins!.body as { workflow: string }).workflow).toBe('enrollment-created');
  });

  it('unknown type: returns 200 with received:true and writes nothing', async () => {
    const res = await POST(makeReq({ type: 'something_unhandled' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    expect(ops).toHaveLength(0);
  });
});
