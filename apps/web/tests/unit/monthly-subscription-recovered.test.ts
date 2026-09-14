import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 correction v2 — Feature C Monthly Support —
// markSubscriptionPaymentRecovered.
//
// The terminal-state guard (user-approved correction v2) protects
// against a stale Stripe `active` webhook (or `invoice.payment_succeeded`)
// re-activating a row that has been finalised. The four cases:
//
//   1. cancelled_at IS NOT NULL → no_op_terminal (skip outbox, email,
//      and the subscriptions UPDATE).
//   2. status='cancelled' (defence-in-depth, even if cancelled_at is
//      null) → no_op_terminal.
//   3. cancel_at_period_end=true + cancelled_at IS NULL + past_due
//      → recovery fires, cancel_at_period_end IS PRESERVED (NOT
//      cleared by the UPDATE).
//   4. past_due + cancel_at_period_end=false → normal recovery,
//      past_due_at + grace_period_ends_at cleared, status='active'.
//
// The terminal-state guard is the SOLE gate; it is the same
// predicate as `refreshSubscriptionPeriod` (`isTerminal`). One
// source of truth.
// =====================================================================

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mock serverEnv so dispatchMonthlyEmail (called inside
// markSubscriptionPaymentRecovered) does not fail env validation.
vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    N8N_WEBHOOK_SECRET: 'secret-test',
    N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-created',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  }),
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

const { markSubscriptionPaymentRecovered } = await import(
  '@/services/curriculum/monthly-subscriptions'
);

const SUB_ID = 'sub_uuid_recover_001';
const STRIPE_EVT = 'evt_recover_001';

interface SbqResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface Op { kind: 'insert' | 'update'; table: string; body: unknown; }

function buildAdminClient(results: Array<SbqResult>): {
  from: ReturnType<typeof vi.fn>;
  _ops: Op[];
} {
  const ops: Op[] = [];
  let fromIndex = 0;
  const fromFn = (table: string): Record<string, unknown> => {
    const idx = fromIndex++;
    const result = results[Math.min(idx, results.length - 1)] ?? {
      data: null,
      error: null,
    };
    const chain: Record<string, unknown> = {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(result),
        }),
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
      }),
      insert: (body: unknown) => {
        ops.push({ kind: 'insert', table, body });
        return {
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ error: null }).then(onFulfilled),
        };
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
    };
    return chain;
  };
  fromMock.mockImplementation(fromFn);
  return { from: fromMock as unknown as ReturnType<typeof vi.fn>, _ops: ops };
}

const OK = { data: null, error: null };

beforeEach(() => {
  fromMock.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('markSubscriptionPaymentRecovered — terminal-state guard (correction v2)', () => {
  it('returns no_op_terminal when cancelled_at IS NOT NULL (skip outbox, email, UPDATE)', async () => {
    // The single source of truth for terminal: cancelled_at !== null.
    // A stale Stripe `active` (or invoice.payment_succeeded) on a
    // finalised row is a NO-OP.
    const { _ops } = buildAdminClient([
      {
        data: {
          id: SUB_ID,
          student_id: 'student_uuid',
          status: 'cancelled',
          cancel_at_period_end: false,
          cancelled_at: '2026-09-10T00:00:00.000Z',
          past_due_at: null,
          suspended_at: null,
          current_period_end: '2026-10-14T00:00:00.000Z',
        },
      },
    ]);

    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: SUB_ID,
      stripeEventId: STRIPE_EVT,
      studentEmail: 'student@example.com',
      studentName: 'Student Name',
      locale: 'en',
    });

    expect(result.kind).toBe('no_op_terminal');
    // No outbox INSERT, no subscriptions UPDATE, no email dispatch.
    const outboxInserts = _ops.filter(
      (o) => o.table === 'n8n_executions' && o.kind === 'insert',
    );
    const subUpdates = _ops.filter(
      (o) => o.table === 'subscriptions' && o.kind === 'update',
    );
    expect(outboxInserts.length, 'no outbox INSERT on terminal').toBe(0);
    expect(subUpdates.length, 'no subscriptions UPDATE on terminal').toBe(0);
  });

  it('returns no_op_terminal when status=cancelled even if cancelled_at is null (defence-in-depth)', async () => {
    // The terminal predicate is `cancelled_at !== null OR status='cancelled'`.
    // The status check is the defence-in-depth backstop.
    const { _ops } = buildAdminClient([
      {
        data: {
          id: SUB_ID,
          student_id: 'student_uuid',
          status: 'cancelled',
          cancel_at_period_end: false,
          cancelled_at: null,
          past_due_at: null,
          suspended_at: null,
          current_period_end: '2026-10-14T00:00:00.000Z',
        },
      },
    ]);

    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: SUB_ID,
      stripeEventId: STRIPE_EVT,
      studentEmail: 'student@example.com',
      studentName: 'Student Name',
      locale: 'en',
    });

    expect(result.kind).toBe('no_op_terminal');
    const outboxInserts = _ops.filter(
      (o) => o.table === 'n8n_executions' && o.kind === 'insert',
    );
    expect(outboxInserts.length).toBe(0);
  });

  it('returns no_subscription when the row does not exist', async () => {
    buildAdminClient([{ data: null }]);
    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: SUB_ID,
      stripeEventId: STRIPE_EVT,
      studentEmail: 'student@example.com',
      studentName: 'Student Name',
      locale: 'en',
    });
    expect(result.kind).toBe('no_subscription');
  });
});

describe('markSubscriptionPaymentRecovered — recovery preserves cancel_at_period_end (Class B)', () => {
  it('restores status=active and PRESERVES cancel_at_period_end=true on past_due recovery', async () => {
    // Class B: cancellation pending. The recovery MUST NOT clear
    // cancel_at_period_end. The UPDATE payload is verified to NOT
    // include that column.
    const { _ops } = buildAdminClient([
      {
        data: {
          id: SUB_ID,
          student_id: 'student_uuid',
          status: 'past_due',
          cancel_at_period_end: true,
          cancelled_at: null,
          past_due_at: '2026-09-12T00:00:00.000Z',
          suspended_at: null,
          current_period_end: '2026-10-14T00:00:00.000Z',
        },
      },
      OK, // INSERT n8n_executions (outbox row)
      OK, // UPDATE subscriptions (recovery)
      OK, // UPDATE n8n_executions (stamp outcome)
    ]);

    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: SUB_ID,
      stripeEventId: STRIPE_EVT,
      studentEmail: 'student@example.com',
      studentName: 'Student Name',
      locale: 'en',
    });

    expect(result.kind).toBe('ok');
    const subUpdate = _ops.find(
      (o) => o.table === 'subscriptions' && o.kind === 'update',
    );
    expect(subUpdate, 'a subscriptions UPDATE must happen on recovery').toBeTruthy();
    const updateBody = subUpdate!.body as Record<string, unknown>;
    // Class B invariant: cancel_at_period_end MUST NOT be in the
    // recovery UPDATE payload (so it survives the transition).
    expect(
      'cancel_at_period_end' in updateBody,
      'cancel_at_period_end must NOT be touched by recovery (Class B invariant)',
    ).toBe(false);
    expect(updateBody['status']).toBe('active');
    expect(updateBody['past_due_at']).toBeNull();
    expect(updateBody['grace_period_ends_at']).toBeNull();
  });

  it('restores status=active and clears past_due_at on normal recovery (Class C)', async () => {
    // Class C: ordinary active (cancel_at_period_end=false).
    // past_due_at + grace_period_ends_at are cleared.
    const { _ops } = buildAdminClient([
      {
        data: {
          id: SUB_ID,
          student_id: 'student_uuid',
          status: 'past_due',
          cancel_at_period_end: false,
          cancelled_at: null,
          past_due_at: '2026-09-12T00:00:00.000Z',
          suspended_at: null,
          current_period_end: '2026-10-14T00:00:00.000Z',
        },
      },
      OK,
      OK,
      OK,
    ]);

    const result = await markSubscriptionPaymentRecovered({
      subscriptionId: SUB_ID,
      stripeEventId: STRIPE_EVT,
      studentEmail: 'student@example.com',
      studentName: 'Student Name',
      locale: 'en',
    });

    expect(result.kind).toBe('ok');
    const subUpdate = _ops.find(
      (o) => o.table === 'subscriptions' && o.kind === 'update',
    );
    const updateBody = subUpdate!.body as Record<string, unknown>;
    expect(updateBody['status']).toBe('active');
    expect(updateBody['past_due_at']).toBeNull();
    expect(updateBody['grace_period_ends_at']).toBeNull();
    expect('cancel_at_period_end' in updateBody).toBe(false);
  });
});
