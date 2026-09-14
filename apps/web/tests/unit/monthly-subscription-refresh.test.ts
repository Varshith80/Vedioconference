import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 — Feature C Monthly Support — refreshSubscriptionPeriod.
//
//   - Period rollover (customer.subscription.updated with a new
//     current_period_start). The PRIMARY KEY on
//     subscription_period_grants(subscription_id, period_start) is
//     the at-most-once-on-period primitive.
//   - D-1: cancelled or incomplete_expired → 'ineligible_state'
//     (no new period grant).
//   - D-2: cancel_at_period_end=true → 'period_ended_cancel',
//     status flipped to cancelled, NO new period grant.
//   - Duplicate refresh on the same period_start → 'already_refreshed'
//     (the PK catches the 23505).
//
// D-6 invariant: Stripe's current_period_start / current_period_end
// are authoritative; the refresh accepts them as Date inputs.
// =====================================================================

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

const { refreshSubscriptionPeriod } = await import(
  '@/services/curriculum/monthly-subscriptions'
);

const SUB_ID = 'sub_uuid_abc';
const STRIPE_EVT = 'evt_refresh_001';

const NEW_PERIOD_START = new Date('2026-10-14T00:00:00.000Z');
const NEW_PERIOD_END = new Date('2026-11-14T00:00:00.000Z');

interface SbqResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

function buildAdminClient(results: Array<SbqResult>): {
  from: ReturnType<typeof vi.fn>;
  _calls: Array<{ table: string; idx: number; kind: string }>;
} {
  const calls: Array<{ table: string; idx: number; kind: string }> = [];
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
          eq: () => ({ maybeSingle: () => Promise.resolve(result) }),
          maybeSingle: () => Promise.resolve(result),
        }),
        maybeSingle: () => Promise.resolve(result),
        single: () => Promise.resolve(result),
      }),
      insert: () => {
        calls.push({ table, idx, kind: 'insert' });
        return {
          select: () => ({ single: () => Promise.resolve(result) }),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
        };
      },
      update: () => {
        calls.push({ table, idx, kind: 'update' });
        return {
          eq: () => ({ eq: () => Promise.resolve(result) }),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
        };
      },
    };
    return chain;
  };
  fromMock.mockImplementation(fromFn);
  return { from: fromMock as unknown as ReturnType<typeof vi.fn>, _calls: calls };
}

const SUB_ROW_ACTIVE = {
  id: SUB_ID,
  student_id: 'student_uuid',
  status: 'active',
  cancel_at_period_end: false,
  cancelled_at: null,
  past_due_at: null,
  suspended_at: null,
  current_period_end: '2026-10-14T00:00:00.000Z',
};

const NEW_GRANT_ROW = { id: 'grant_uuid_new' };
const NEW_SPG_ROW = {
  subscription_id: SUB_ID,
  period_start: NEW_PERIOD_START.toISOString(),
};

const OK = { data: null, error: null };

beforeEach(() => {
  fromMock.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('refreshSubscriptionPeriod — happy path', () => {
  it('returns ok with grantId + periodGrantsId for an active subscription', async () => {
    buildAdminClient([
      { data: SUB_ROW_ACTIVE }, // subscription lookup
      { data: NEW_SPG_ROW }, // INSERT subscription_period_grants
      { data: NEW_GRANT_ROW }, // INSERT session_grants
      OK, // UPDATE subscription_period_grants.session_grant_id
      OK, // UPDATE subscriptions (current_period_* + status)
    ]);

    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.grantId).toBe('grant_uuid_new');
    }
  });

  it('inserts a new subscription_period_grants row (the PK race-safety primitive)', async () => {
    const { _calls } = buildAdminClient([
      { data: SUB_ROW_ACTIVE },
      { data: NEW_SPG_ROW },
      { data: NEW_GRANT_ROW },
      OK,
      OK,
    ]);

    await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });

    const spgInsert = _calls.find(
      (c) => c.table === 'subscription_period_grants' && c.kind === 'insert',
    );
    expect(spgInsert, 'subscription_period_grants insert must happen').toBeTruthy();
  });
});

describe('refreshSubscriptionPeriod — D-2 cancellation end-of-period', () => {
  it('returns period_ended_cancel when cancel_at_period_end=true', async () => {
    const { _calls } = buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          cancel_at_period_end: true,
        },
      },
      OK, // UPDATE subscriptions.status='cancelled' + cancelled_at
    ]);

    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });

    expect(result.kind).toBe('period_ended_cancel');
    // CRITICAL (D-2): no new session_grants pool row, no new period_grants.
    const grantInsert = _calls.find(
      (c) => c.table === 'session_grants' && c.kind === 'insert',
    );
    const spgInsert = _calls.find(
      (c) => c.table === 'subscription_period_grants' && c.kind === 'insert',
    );
    expect(grantInsert, 'no new pool grant (D-2)').toBeUndefined();
    expect(spgInsert, 'no new period_grants (D-2)').toBeUndefined();
  });
});

describe('refreshSubscriptionPeriod — D-1 suspended/cancelled never get new grants', () => {
  it('returns no_op_terminal when the subscription is already cancelled (correction v2: terminal guard precedes D-1)', async () => {
    // TASK 3 correction v2: a row with status='cancelled' is
    // TERMINAL. The terminal-state guard (isTerminal) runs
    // BEFORE the D-1 `incomplete_expired` branch and returns
    // 'no_op_terminal' without touching the DB.
    const { _calls } = buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          status: 'cancelled',
          cancelled_at: '2026-09-10T00:00:00.000Z',
        },
      },
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('no_op_terminal');
    // CRITICAL (correction v2): no UPDATE to subscriptions.status,
    // no INSERT into subscription_period_grants or session_grants.
    const grantInsert = _calls.find(
      (c) => c.table === 'session_grants' && c.kind === 'insert',
    );
    const spgInsert = _calls.find(
      (c) => c.table === 'subscription_period_grants' && c.kind === 'insert',
    );
    expect(grantInsert).toBeUndefined();
    expect(spgInsert).toBeUndefined();
  });

  it('returns ineligible_state when the subscription is incomplete_expired (D-1 still applies)', async () => {
    // D-1: incomplete_expired is the Stripe-side termination
    // state that we have NOT yet flipped to cancelled. The
    // terminal guard returns false (cancelled_at is null AND
    // status != 'cancelled'), so D-1 fires and returns
    // 'ineligible_state'.
    buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          status: 'incomplete_expired',
          cancelled_at: null,
        },
      },
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('ineligible_state');
    if (result.kind === 'ineligible_state') {
      expect(result.currentStatus).toBe('incomplete_expired');
    }
  });

  it('returns ineligible_state with currentStatus=not_found when the row is missing', async () => {
    buildAdminClient([{ data: null }]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('ineligible_state');
    if (result.kind === 'ineligible_state') {
      expect(result.currentStatus).toBe('not_found');
    }
  });
});

describe('refreshSubscriptionPeriod — terminal-state guard (correction v2)', () => {
  it('returns no_op_terminal when cancelled_at is set (no UPDATE to status, no new period)', async () => {
    // The terminal predicate is `cancelled_at !== null`. A row
    // that was finalised via the D-2 path (or any other path)
    // is dead — refresh must not re-grant credits.
    const { _calls } = buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          status: 'cancelled',
          cancelled_at: '2026-09-10T00:00:00.000Z',
        },
      },
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('no_op_terminal');
    const subUpdate = _calls.find(
      (c) => c.table === 'subscriptions' && c.kind === 'update',
    );
    expect(subUpdate, 'no subscriptions UPDATE on terminal').toBeUndefined();
  });

  it('returns no_op_terminal when status=cancelled even if cancelled_at is null (defence-in-depth)', async () => {
    // The terminal predicate is a logical OR. A defensive
    // `status='cancelled'` check catches the rare case where a
    // row is finalised without stamping cancelled_at (e.g. an
    // older migration path).
    const { _calls } = buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          status: 'cancelled',
          cancelled_at: null,
        },
      },
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('no_op_terminal');
    const grantInsert = _calls.find(
      (c) => c.table === 'session_grants' && c.kind === 'insert',
    );
    expect(grantInsert).toBeUndefined();
  });

  it('D-2 finalisation runs BEFORE the terminal guard (cancel_at_period_end=true + cancelled_at=null → period_ended_cancel, not no_op_terminal)', async () => {
    // The D-2 branch (cancel_at_period_end=true at current_period_end)
    // runs first because `cancel_at_period_end` is a PENDING
    // request, not a terminal state. It finalises the row to
    // cancelled and stamps cancelled_at. The next refresh on
    // the same row will then hit the terminal guard.
    buildAdminClient([
      {
        data: {
          ...SUB_ROW_ACTIVE,
          cancel_at_period_end: true,
          cancelled_at: null,
        },
      },
      OK, // UPDATE subscriptions.status='cancelled' + cancelled_at
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('period_ended_cancel');
  });
});

describe('refreshSubscriptionPeriod — race-safety (PK catches duplicates)', () => {
  it('returns already_refreshed on a duplicate period_start (23505 → mapped)', async () => {
    // The PK (subscription_id, period_start) prevents duplicate
    // refreshes for the same period. The service catches 23505
    // and returns 'already_refreshed'.
    buildAdminClient([
      { data: SUB_ROW_ACTIVE },
      {
        error: {
          code: '23505',
          message:
            'duplicate key value violates unique constraint "subscription_period_grants_pkey"',
        },
      },
    ]);
    const result = await refreshSubscriptionPeriod({
      subscriptionId: SUB_ID,
      periodStart: NEW_PERIOD_START,
      periodEnd: NEW_PERIOD_END,
      stripeEventId: STRIPE_EVT,
    });
    expect(result.kind).toBe('already_refreshed');
  });
});
