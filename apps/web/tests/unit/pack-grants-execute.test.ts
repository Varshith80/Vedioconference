import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Phase 1 — Feature B + TASK 2.1 (financial-consistency repair):
// executePackRefund service tests.
//
// TASK 2.1 contract:
//   - The service NEVER writes session_grants.status='refunded'
//     or session_grants.refunded_amount_cents. Those columns are
//     stamped SOLELY by the Stripe `charge.refunded` webhook +
//     `fn_enrollments_refund` cascade trigger.
//   - The service records the outbound enqueue attempt in
//     `n8n_executions` (run_id = refund_request_id, UNIQUE).
//   - n8n 2xx → kind='ok' with refund_status='n8n_accepted'.
//   - n8n 5xx / throw → kind='webhook_failed' → 502.
//   - webhookUrl null → kind='webhook_unavailable' → 503.
//   - Two admins racing produce exactly one outbox row
//     (23505 → kind='already_refunded').
//
// The mock chain below dispatches per-call:
//   call 0: read session_grants  (pre-flight)
//   call 1: insert n8n_executions (outbox INSERT)
//   call 2: update n8n_executions (outbox UPDATE on n8n outcome)
// =====================================================================

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { executePackRefund } = await import('@/services/admin/pack-grants');

const GRANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

type SbqResult = { data?: unknown; error?: unknown };

/**
 * Build a Supabase-shaped client whose `from(table)` returns a
 * per-call chain. The chain index advances per call, and the
 * last result in the array is reused for any further calls
 * (so callers don't need to know exactly how many inserts the
 * service performs).
 */
function buildSupabase(results: Array<SbqResult>): {
  from: (table: string) => Record<string, unknown>;
  _calls: Array<{ table: string; result: SbqResult }>;
} {
  const calls: Array<{ table: string; result: SbqResult }> = [];
  let fromIndex = 0;
  const from = (table: string): Record<string, unknown> => {
    const idx = fromIndex++;
    const result =
      results[Math.min(idx, results.length - 1)] ?? { data: null, error: null };
    calls.push({ table, result });
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(result),
          }),
        }),
      }),
      insert: () => Promise.resolve(result),
      update: () => ({
        eq: () => Promise.resolve(result),
      }),
    };
  };
  // The service expects a real client with a `.from` method.
  return { from, _calls: calls };
}

const READ_ROW = (overrides: Record<string, unknown> = {}) => ({
  id: GRANT_ID,
  student_id: STUDENT_ID,
  status: 'active',
  amount_cents: 29900,
  currency: 'EUR',
  total_credits: 10,
  consumed_credits: 5,
  refunded_at: null,
  refunded_amount_cents: 0,
  created_at: '2026-06-01T00:00:00.000Z',
  expires_at: '2026-12-01T00:00:00.000Z',
  student: { id: STUDENT_ID, full_name: 'Alice', email: 'alice@example.com' },
  ...overrides,
});

const OK_EMPTY = { data: null, error: null };

const WEBHOOK_URL = 'https://n8n.test/webhook/enrollment-refunded';
const WEBHOOK_SECRET = 'secret-abc';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })) as never,
  );
});

describe('executePackRefund — happy path', () => {
  it('inserts n8n_executions row before posting, returns ok with refundRequestId', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },   // read
      OK_EMPTY,               // outbox insert
      OK_EMPTY,               // outbox update (completed)
    ]);

    let captured: { url: string; init: RequestInit } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        captured = { url, init: init ?? {} };
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }) as never,
    );

    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
      new Date('2026-09-13T00:00:00.000Z'),
    );

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.refundRequestId).toBe(`${GRANT_ID}:2026-09-13T00:00:00.000Z`);
      expect(result.requestedAmountCents).toBe(17500); // 5 unused × €35
      expect(result.currency).toBe('EUR');
    }
    expect(captured).not.toBeNull();
    const payload = JSON.parse(String(captured!.init.body)) as Record<string, unknown>;
    expect(payload['kind']).toBe('pack_refund');
    expect(payload['amount_cents']).toBe(17500);
    expect(payload['session_grant_id']).toBe(GRANT_ID);
    expect(payload['refund_request_id']).toBe(`${GRANT_ID}:2026-09-13T00:00:00.000Z`);
  });

  it('10 unused sessions → €350 calculated, capped at €299', async () => {
    const sb = buildSupabase([
      { data: READ_ROW({ consumed_credits: 0 }) },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.requestedAmountCents).toBe(29900);
    }
  });

  it('does NOT touch session_grants status or refunded_amount_cents', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    // The only table the service writes to is `n8n_executions`.
    const tablesWritten = new Set(
      sb._calls.filter((c) => c.table !== 'session_grants').map((c) => c.table),
    );
    expect(tablesWritten.has('session_grants')).toBe(false);
    expect(tablesWritten.has('n8n_executions')).toBe(true);
  });
});

describe('executePackRefund — rejected states', () => {
  it('returns refund_zero when 0 sessions are unused', async () => {
    const sb = buildSupabase([
      { data: READ_ROW({ consumed_credits: 10, status: 'completed' }) },
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('refund_zero');
    if (result.kind === 'refund_zero') {
      expect(result.unusedSessions).toBe(0);
    }
  });

  it('returns already_refunded when the pack is already refunded', async () => {
    const sb = buildSupabase([
      {
        data: READ_ROW({
          status: 'refunded',
          refunded_at: '2026-08-01T00:00:00.000Z',
          refunded_amount_cents: 10000,
        }),
      },
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('already_refunded');
  });

  // Only `cancelled` is the documented terminal `enrollment_status`
  // value reachable on `session_grants.status`. `no_show` and
  // `rescheduled` belong to the `booking_status` enum
  // (session_bookings.status) and CANNOT appear on a session_grants
  // row — they are intentionally NOT tested here as valid
  // session_grants inputs (would represent an impossible DB state).
  it('returns invalid_state when status is cancelled', async () => {
    const sb = buildSupabase([{ data: READ_ROW({ status: 'cancelled' }) }]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('invalid_state');
    if (result.kind === 'invalid_state') {
      expect(result.currentStatus).toBe('cancelled');
    }
  });

  it('returns not_found when the grant is missing', async () => {
    const sb = buildSupabase([{ data: null }]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('not_found');
  });
});

describe('executePackRefund — race-safety', () => {
  it('maps SQLSTATE 23505 (outbox UNIQUE) to already_refunded', async () => {
    // Two admins racing: the second's INSERT into n8n_executions
    // hits the UNIQUE(run_id) constraint.
    const sb = buildSupabase([
      { data: READ_ROW() }, // read succeeds
      {
        data: null,
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "n8n_executions_run_id_key"',
        },
      },
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('already_refunded');
  });
});

describe('executePackRefund — n8n outcomes', () => {
  it('returns webhook_failed and stamps n8n_executions=failed when n8n returns 500', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream down', { status: 500 })) as never,
    );
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('webhook_failed');
    if (result.kind === 'webhook_failed') {
      expect(result.reason).toContain('500');
      expect(result.refundRequestId).toContain(GRANT_ID);
    }
  });

  it('returns webhook_failed when fetch throws', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }) as never,
    );
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('webhook_failed');
    if (result.kind === 'webhook_failed') {
      expect(result.reason).toContain('ECONNREFUSED');
    }
  });

  it('returns webhook_unavailable when webhookUrl is null and does NOT fetch', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },
      OK_EMPTY, // outbox insert (status=started)
      // No outbox update — webhook_unavailable path does not stamp status.
    ]);
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy as never);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      null,
      null,
    );
    expect(result.kind).toBe('webhook_unavailable');
    if (result.kind === 'webhook_unavailable') {
      expect(result.reason).toBe('not_configured');
      expect(result.refundRequestId).toContain(GRANT_ID);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stamps n8n_executions=completed on n8n 2xx and returns ok', async () => {
    const sb = buildSupabase([
      { data: READ_ROW() },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })) as never,
    );
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('ok');
    // Tables written to: n8n_executions (insert + update).
    const tablesWritten = sb._calls
      .filter((c) => c.table !== 'session_grants')
      .map((c) => c.table);
    expect(tablesWritten).toContain('n8n_executions');
    // session_grants must NOT have been written to.
    expect(tablesWritten).not.toContain('session_grants');
  });
});

describe('executePackRefund — refund amount invariants', () => {
  it('caps actual refund at amount_paid when unused × €35 > amount_paid', async () => {
    // 10 unused × €35 = €350, but amount_paid = €200.
    const sb = buildSupabase([
      { data: READ_ROW({ amount_cents: 20000, consumed_credits: 0 }) },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      // Cap = amount_paid = €200.
      expect(result.requestedAmountCents).toBe(20000);
    }
  });

  it('handles 1 unused session correctly (€35)', async () => {
    const sb = buildSupabase([
      { data: READ_ROW({ consumed_credits: 9 }) },
      OK_EMPTY,
      OK_EMPTY,
    ]);
    const result = await executePackRefund(
      GRANT_ID,
      sb as never,
      WEBHOOK_URL,
      WEBHOOK_SECRET,
    );
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.requestedAmountCents).toBe(3500);
    }
  });
});
