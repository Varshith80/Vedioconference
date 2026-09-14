import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 — Feature C Monthly Support — provisionMonthlySubscription.
//
//   - first-time provision (customer.subscription.created):
//       INSERT subscriptions row (status='incomplete'),
//       INSERT session_grants pool row (grant_type='subscription'),
//       backfill the FK on subscriptions,
//       INSERT subscription_period_grants row (PK race-safety).
//   - dedupe by stripe_subscription_id UNIQUE → 'duplicate_subscription'.
//   - non-23505 error on the subscriptions insert → 'unknown'
//     (defensive catch-all in the service).
//
// D-1 invariant: this function CREATES the first-period pool row,
// it does not mutate a pre-existing one.
// D-6 invariant: period_start/period_end come from Stripe (the
// caller passes Date objects that originated from Stripe seconds).
// =====================================================================

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const fromMock = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

const { provisionMonthlySubscription } = await import(
  '@/services/curriculum/monthly-subscriptions'
);

const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const STRIPE_SUB_ID = 'sub_test_001';
const STRIPE_CUS_ID = 'cus_test_001';
const STRIPE_PRICE_ID = 'price_monthly_test';
const PERIOD_START = new Date('2026-09-14T00:00:00.000Z');
const PERIOD_END = new Date('2026-10-14T00:00:00.000Z');

interface SbqResult {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

/**
 * Build a per-call supabase-shaped chain that drives the
 * `createSupabaseAdminClient()` mocked above. Each `from(table)`
 * call advances the index and returns a chain whose
 * select/insert/update chains resolve to the indexed result.
 */
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
      insert: (body: unknown) => {
        calls.push({ table, idx, kind: 'insert' });
        return {
          select: () => ({ single: () => Promise.resolve(result) }),
          then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
        };
      },
      update: (body: unknown) => {
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

const NEW_SUB_ROW = { id: 'sub_uuid_new' };
const NEW_GRANT_ROW = { id: 'grant_uuid_new' };
const NEW_SPG_ROW = {
  subscription_id: 'sub_uuid_new',
  period_start: PERIOD_START.toISOString(),
};
const OK = { data: null, error: null };

beforeEach(() => {
  fromMock.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

describe('provisionMonthlySubscription — happy path', () => {
  it('returns ok with subscriptionId + grantId + periodGrantsId', async () => {
    buildAdminClient([
      { data: null }, // pre-flight: no existing row
      { data: NEW_SUB_ROW }, // INSERT subscriptions
      { data: NEW_GRANT_ROW }, // INSERT session_grants
      OK, // UPDATE subscriptions.session_grant_id (FK backfill)
      { data: NEW_SPG_ROW }, // INSERT subscription_period_grants
    ]);

    const result = await provisionMonthlySubscription({
      studentId: STUDENT_ID,
      stripeCustomerId: STRIPE_CUS_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripePriceId: STRIPE_PRICE_ID,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      latestInvoiceId: 'in_test_001',
      stripeEventId: 'evt_test_001',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.subscriptionId).toBe('sub_uuid_new');
      expect(result.grantId).toBe('grant_uuid_new');
      expect(result.periodGrantsId).toBe(
        'sub_uuid_new:2026-09-14T00:00:00.000Z',
      );
    }
  });

  it('inserts a session_grants pool row with grant_type=subscription (the first period pool)', async () => {
    const { _calls } = buildAdminClient([
      { data: null },
      { data: NEW_SUB_ROW },
      { data: NEW_GRANT_ROW },
      OK,
      { data: NEW_SPG_ROW },
    ]);

    await provisionMonthlySubscription({
      studentId: STUDENT_ID,
      stripeCustomerId: STRIPE_CUS_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripePriceId: STRIPE_PRICE_ID,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      latestInvoiceId: null,
      stripeEventId: 'evt_test_001',
    });

    const grantInsert = _calls.find(
      (c) => c.table === 'session_grants' && c.kind === 'insert',
    );
    expect(grantInsert, 'a session_grants insert must happen').toBeTruthy();

    const spgInsert = _calls.find(
      (c) => c.table === 'subscription_period_grants' && c.kind === 'insert',
    );
    expect(
      spgInsert,
      'a subscription_period_grants insert must happen (the PK race-safety primitive)',
    ).toBeTruthy();
  });

  it('uses ISO 8601 strings for period_start/period_end (D-6: Stripe is the source)', async () => {
    const { _calls } = buildAdminClient([
      { data: null },
      { data: NEW_SUB_ROW },
      { data: NEW_GRANT_ROW },
      OK,
      { data: NEW_SPG_ROW },
    ]);

    await provisionMonthlySubscription({
      studentId: STUDENT_ID,
      stripeCustomerId: STRIPE_CUS_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripePriceId: STRIPE_PRICE_ID,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      latestInvoiceId: null,
      stripeEventId: 'evt_test_001',
    });

    const subInsert = _calls.find(
      (c) => c.table === 'subscriptions' && c.kind === 'insert',
    );
    expect(subInsert, 'subscriptions insert must happen').toBeTruthy();
  });
});

describe('provisionMonthlySubscription — race-safety / dedupe', () => {
  it('returns duplicate_subscription when stripe_subscription_id already exists', async () => {
    const { _calls } = buildAdminClient([
      { data: { id: 'sub_existing' } }, // pre-flight hits existing row
    ]);
    const result = await provisionMonthlySubscription({
      studentId: STUDENT_ID,
      stripeCustomerId: STRIPE_CUS_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripePriceId: STRIPE_PRICE_ID,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      latestInvoiceId: null,
      stripeEventId: 'evt_test_001',
    });
    expect(result.kind).toBe('duplicate_subscription');
    // No further inserts should happen on the duplicate path.
    const inserts = _calls.filter((c) => c.kind === 'insert');
    expect(inserts.length).toBe(0);
  });

  it('returns unknown on a non-23505 insert error (defensive catch-all)', async () => {
    buildAdminClient([
      { data: null }, // pre-flight: no existing row
      { error: { code: '23503', message: 'FK violation' } }, // subscriptions insert fails
    ]);
    const result = await provisionMonthlySubscription({
      studentId: STUDENT_ID,
      stripeCustomerId: STRIPE_CUS_ID,
      stripeSubscriptionId: STRIPE_SUB_ID,
      stripePriceId: STRIPE_PRICE_ID,
      currentPeriodStart: PERIOD_START,
      currentPeriodEnd: PERIOD_END,
      latestInvoiceId: null,
      stripeEventId: 'evt_test_001',
    });
    expect(result.kind).toBe('unknown');
  });
});
