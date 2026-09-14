import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 — Feature C — Stripe webhook subscription lifecycle.
//
//   - customer.subscription.created (no existing row) →
//     handleCustomerSubscriptionEvent → provisionMonthlySubscription.
//   - customer.subscription.updated + new current_period_start →
//     handleCustomerSubscriptionEvent → refreshSubscriptionPeriod.
//   - customer.subscription.deleted →
//     handleCustomerSubscriptionDeleted → markSubscriptionSuspended.
//   - invoice.payment_failed → handleInvoicePaymentFailed →
//     markSubscriptionPastDue.
//   - invoice.payment_succeeded (TASK 3 correction v2) →
//     handleInvoicePaymentSucceeded → markSubscriptionPaymentRecovered
//     (terminal-state-guarded; cancel_at_period_end is preserved
//     on Class B "cancellation pending" rows).
//
// We exercise the route's switch (not the handlers themselves —
// those have their own service tests). The contract is:
//   - 401 on missing signature (existing).
//   - 200 on customer.subscription.created/updated/deleted
//     with valid signature.
//   - D-1 invariant: the existing session_grants pool is NOT
//     mutated on past_due / suspended webhook arrivals.
//   - D-4 invariant: the route delegates to the handlers; the
//     outbox idempotency lives in n8n_executions UNIQUE run_id
//     (not asserted here — covered in monthly-subscriptions.test.ts).
//   - D-6 invariant: the route forwards Stripe's
//     current_period_start / current_period_end verbatim to the
//     handlers; no 30-day computation happens anywhere.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

const mockConstructEvent = vi.fn();
vi.mock('@/lib/stripe/client', () => ({
  stripe: () => ({
    webhooks: { constructEvent: mockConstructEvent },
  }),
}));

const mockHandleSub = vi.fn();
const mockHandleDeleted = vi.fn();
const mockHandleInvoiceFailed = vi.fn();
const mockHandleInvoiceSucceeded = vi.fn();
vi.mock('@/lib/stripe/subscription-event-handlers', () => ({
  handleCustomerSubscriptionEvent: mockHandleSub,
  handleCustomerSubscriptionDeleted: mockHandleDeleted,
  handleInvoicePaymentFailed: mockHandleInvoiceFailed,
  handleInvoicePaymentSucceeded: mockHandleInvoiceSucceeded,
}));

interface Op { kind: 'insert' | 'update'; table: string; body: unknown; }
const ops: Op[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      insert: async (body: unknown) => {
        ops.push({ kind: 'insert', table, body });
        // webhook_events dedup: first wins, second returns 23505.
        if (table === 'webhook_events') {
          const last = ops.filter(
            (o) =>
              o.kind === 'insert' &&
              o.table === 'webhook_events' &&
              (o.body as { event_id?: string }).event_id ===
                (body as { event_id?: string }).event_id,
          );
          if (last.length > 1) {
            return {
              error: { code: '23505', message: 'duplicate' },
            };
          }
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
    method: 'POST',
    headers,
    body: rawBody,
  });
}

beforeEach(() => {
  mockServerEnv.mockReset();
  mockConstructEvent.mockReset();
  mockHandleSub.mockReset();
  mockHandleDeleted.mockReset();
  mockHandleInvoiceFailed.mockReset();
  mockHandleInvoiceSucceeded.mockReset();
  ops.length = 0;
  mockServerEnv.mockReturnValue({ STRIPE_WEBHOOK_SECRET: 'whsec_abc' });
});

describe('POST /api/webhooks/stripe — Feature C subscription lifecycle', () => {
  it('returns 200 and delegates customer.subscription.created to handleCustomerSubscriptionEvent', async () => {
    const event = {
      id: 'evt_sub_created_001',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_001',
          status: 'active',
          customer: 'cus_test_001',
          current_period_start: 1760400000,
          current_period_end: 1762992000,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_monthly' } }] },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleSub).toHaveBeenCalledTimes(1);
    expect(mockHandleSub).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub_test_001', status: 'active' }),
    );
    // D-1 / D-4: the session_grants table MUST NOT be touched
    // by the route layer for subscription lifecycle events.
    const sessionGrantsWrites = ops.filter(
      (o) => o.table === 'session_grants',
    );
    expect(sessionGrantsWrites.length, 'no session_grants writes from the route').toBe(0);
  });

  it('returns 200 and delegates customer.subscription.updated to handleCustomerSubscriptionEvent', async () => {
    const event = {
      id: 'evt_sub_updated_001',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_001',
          status: 'active',
          customer: 'cus_test_001',
          current_period_start: 1762992000, // period rollover
          current_period_end: 1765584000,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_monthly' } }] },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleSub).toHaveBeenCalledTimes(1);
  });

  it('returns 200 and delegates customer.subscription.deleted to handleCustomerSubscriptionDeleted', async () => {
    const event = {
      id: 'evt_sub_deleted_001',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test_001',
          status: 'canceled',
          customer: 'cus_test_001',
          current_period_start: 1760400000,
          current_period_end: 1762992000,
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleDeleted).toHaveBeenCalledTimes(1);
    expect(mockHandleSub).not.toHaveBeenCalled();
  });

  it('returns 200 and delegates invoice.payment_failed (with subscription) to handleInvoicePaymentFailed', async () => {
    const event = {
      id: 'evt_invoice_failed_001',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_001',
          subscription: 'sub_test_001',
          period_end: 1762992000,
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleInvoiceFailed).toHaveBeenCalledTimes(1);
  });

  it('skips invoice.payment_failed when the invoice has no subscription id', async () => {
    const event = {
      id: 'evt_invoice_failed_002',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_test_002',
          // no subscription field — PAYG one-shot invoice
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleInvoiceFailed).not.toHaveBeenCalled();
  });

  it('dedupes a replayed customer.subscription.created via webhook_events UNIQUE', async () => {
    const event = {
      id: 'evt_sub_replay_001',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_replay',
          status: 'active',
          customer: 'cus_test_replay',
          current_period_start: 1760400000,
          current_period_end: 1762992000,
          items: { data: [{ price: { id: 'price_monthly' } }] },
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const raw = JSON.stringify(event);
    const sig = 't=1700000000,v1=deadbeef';

    const res1 = await POST(makeReq(raw, sig));
    const res2 = await POST(makeReq(raw, sig));

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // The handler must be invoked exactly once (the second call
    // hits the webhook_events UNIQUE and short-circuits).
    expect(mockHandleSub).toHaveBeenCalledTimes(1);
  });

  it('does NOT mutate session_grants on any subscription-lifecycle event (D-1)', async () => {
    const types: Array<{
      type: string;
      data: { object: Record<string, unknown> };
    }> = [
      {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_d1_001',
            status: 'active',
            customer: 'cus_d1_001',
            current_period_start: 1760400000,
            current_period_end: 1762992000,
            items: { data: [{ price: { id: 'price_monthly' } }] },
          },
        },
      },
      {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_d1_002',
            status: 'canceled',
            customer: 'cus_d1_002',
            current_period_start: 1760400000,
            current_period_end: 1762992000,
          },
        },
      },
      {
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_d1_003',
            subscription: 'sub_d1_003',
            period_end: 1762992000,
          },
        },
      },
    ];

    for (const t of types) {
      ops.length = 0;
      mockConstructEvent.mockReturnValue({ id: `evt_${t.type}_${Math.random()}`, ...t });
      await POST(makeReq(JSON.stringify(t), 't=1,v1=zzz'));
      const writes = ops.filter((o) => o.table === 'session_grants');
      expect(writes.length, `${t.type}: must NOT write to session_grants`).toBe(0);
    }
  });
});

// =====================================================================
// TASK 3 correction v2 — invoice.payment_succeeded wiring.
//
// Closes the recovery-gap left by the
// customer.subscription.updated-only path. Some Stripe accounts
// emit invoice.payment_succeeded WITHOUT a paired subscription
// update that flips status back to `active`. Without this
// handler, a subscription can stay stuck in past_due even after
// Stripe charged the card successfully.
//
// The handler routes through the same terminal-state-guarded
// markSubscriptionPaymentRecovered path; see
// `monthly-subscription-recovered.test.ts` for the terminal-guard
// unit tests.
// =====================================================================

describe('POST /api/webhooks/stripe — TASK 3 correction v2: invoice.payment_succeeded', () => {
  it('returns 200 and delegates invoice.payment_succeeded to handleInvoicePaymentSucceeded', async () => {
    const event = {
      id: 'evt_invoice_succeeded_001',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_succ_001',
          subscription: 'sub_test_001',
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleInvoiceSucceeded).toHaveBeenCalledTimes(1);
    expect(mockHandleInvoiceSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'in_test_succ_001',
        subscription: 'sub_test_001',
      }),
    );
  });

  it('also handles invoice.paid (forward-compat event name)', async () => {
    const event = {
      id: 'evt_invoice_paid_001',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test_paid_001',
          subscription: 'sub_test_001',
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleInvoiceSucceeded).toHaveBeenCalledTimes(1);
  });

  it('skips invoice.payment_succeeded when the invoice has no subscription id', async () => {
    const event = {
      id: 'evt_invoice_succeeded_payg_001',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_test_succ_payg_001',
          // no subscription field — PAYG one-shot invoice
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);
    const res = await POST(makeReq(JSON.stringify(event), 't=1,v1=zzz'));
    expect(res.status).toBe(200);
    expect(mockHandleInvoiceSucceeded).not.toHaveBeenCalled();
  });
});
