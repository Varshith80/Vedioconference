import { describe, it, expect } from 'vitest';
import * as monthlyMod from '@/services/curriculum/monthly-subscriptions';
import {
  MONTHLY_TOTAL_CREDITS,
  MONTHLY_PRICE_CENTS,
  MONTHLY_CURRENCY,
  resolveCurrentPeriod,
  buildOutboxRunId,
} from '@/services/curriculum/monthly-subscriptions';

// =====================================================================
// TASK 3 — Feature C Monthly Support — pure-helper tests.
//
//   - MONTHLY_* constants: locked business rules (€109 / 4 credits / EUR).
//   - resolveCurrentPeriod: is `now` within [periodStart, periodEnd)?
//   - buildOutboxRunId: the canonical outbox run_id shape for the
//     lifecycle events (matches the Pack-refund pattern).
//
// D-6 invariant pinned: MONTHLY_PERIOD_DAYS is NOT exported.
// The application NEVER computes a 30-day period locally.
// =====================================================================

describe('MONTHLY_* constants — locked business rules', () => {
  it('MONTHLY_TOTAL_CREDITS is 4 (4 × 60-min sessions per period)', () => {
    expect(MONTHLY_TOTAL_CREDITS).toBe(4);
  });
  it('MONTHLY_PRICE_CENTS is 10900 (€109 TTC)', () => {
    expect(MONTHLY_PRICE_CENTS).toBe(10900);
  });
  it('MONTHLY_CURRENCY is EUR', () => {
    expect(MONTHLY_CURRENCY).toBe('EUR');
  });
  it('does NOT export MONTHLY_PERIOD_DAYS (D-6: Stripe is authoritative)', () => {
    // The module object must not carry a MONTHLY_PERIOD_DAYS export.
    // This is a regression guard against a future PR that tries to
    // reintroduce a 30-day constant.
    const exports = monthlyMod as unknown as Record<string, unknown>;
    expect(exports.MONTHLY_PERIOD_DAYS).toBeUndefined();
  });
});

describe('resolveCurrentPeriod', () => {
  it('returns isCurrentPeriod=true when now is inside [start, end)', () => {
    const r = resolveCurrentPeriod({
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      now: new Date('2026-09-15T12:00:00.000Z'),
    });
    expect(r.isCurrentPeriod).toBe(true);
    expect(r.periodStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(r.periodEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('returns isCurrentPeriod=false when now is before periodStart', () => {
    const r = resolveCurrentPeriod({
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      now: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(r.isCurrentPeriod).toBe(false);
  });

  it('returns isCurrentPeriod=false when now equals periodEnd (half-open)', () => {
    const r = resolveCurrentPeriod({
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      now: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(r.isCurrentPeriod).toBe(false);
  });

  it('returns isCurrentPeriod=true when now equals periodStart (inclusive)', () => {
    const r = resolveCurrentPeriod({
      periodStart: new Date('2026-09-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-01T00:00:00.000Z'),
      now: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(r.isCurrentPeriod).toBe(true);
  });

  it('accepts string ISO inputs as well as Date', () => {
    const r = resolveCurrentPeriod({
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-10-01T00:00:00.000Z',
      now: new Date('2026-09-15T00:00:00.000Z'),
    });
    expect(r.isCurrentPeriod).toBe(true);
    expect(r.periodStart).toBeInstanceOf(Date);
    expect(r.periodEnd).toBeInstanceOf(Date);
  });

  it('defaults now to the current time when omitted', () => {
    const r = resolveCurrentPeriod({
      periodStart: new Date(Date.now() - 60_000),
      periodEnd: new Date(Date.now() + 60_000),
    });
    expect(r.isCurrentPeriod).toBe(true);
  });
});

describe('buildOutboxRunId — canonical shape', () => {
  const SUB_ID = 'sub_abc';
  const EVT_ID = 'evt_123';

  it('uses the monthly_<event_kind>:<sub>:<evt>:<iso> shape', () => {
    const id = buildOutboxRunId({
      eventKind: 'monthly_past_due',
      subscriptionId: SUB_ID,
      stripeEventId: EVT_ID,
      now: new Date('2026-09-14T00:00:00.000Z'),
    });
    expect(id).toBe(`monthly_past_due:${SUB_ID}:${EVT_ID}:2026-09-14T00:00:00.000Z`);
  });

  it('supports each documented event kind', () => {
    const kinds = [
      'monthly_past_due',
      'monthly_recovered',
      'monthly_suspended',
      'monthly_provision',
      'monthly_period_refresh',
    ] as const;
    for (const k of kinds) {
      const id = buildOutboxRunId({
        eventKind: k,
        subscriptionId: SUB_ID,
        stripeEventId: EVT_ID,
        now: new Date('2026-09-14T00:00:00.000Z'),
      });
      expect(id.startsWith(`${k}:`)).toBe(true);
    }
  });

  it('changes when `now` differs — ensures each retry gets a unique run_id', () => {
    const id1 = buildOutboxRunId({
      eventKind: 'monthly_past_due',
      subscriptionId: SUB_ID,
      stripeEventId: EVT_ID,
      now: new Date('2026-09-14T00:00:00.000Z'),
    });
    const id2 = buildOutboxRunId({
      eventKind: 'monthly_past_due',
      subscriptionId: SUB_ID,
      stripeEventId: EVT_ID,
      now: new Date('2026-09-14T00:00:01.000Z'),
    });
    expect(id1).not.toBe(id2);
  });
});
