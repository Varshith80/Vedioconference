import { describe, it, expect } from 'vitest';
import {
  PACK_PER_UNUSED_REFUND_CENTS,
  PACK_TOTAL_CENTS,
  PACK_TOTAL_CREDITS,
  calculatePackRefundPreview,
  unusedCredits,
} from '@/services/admin/pack-grants';

// =====================================================================
// Phase 1 — Feature B: pure-helper tests for the Pack refund
// math.
//
//   - unusedCredits(consumed, total)  : the €35-per-unused formula
//   - calculatePackRefundPreview()    : the SOURCE-OF-TRUTH preview
//                                        for the admin UI + the
//                                        execute endpoint.
//
// The user-locked business rules (verbatim):
//
//   - 10 unused → €350 calculated but capped at €299 paid
//   - 5 unused  → €175
//   - 0 unused  → €0
//   - no refund for consumed sessions
//   - no duplicate refund (re-running on a refunded pack →
//     `already_refunded`)
//   - no refund after invalid/terminal state
//     (cancelled / no_show / rescheduled → `invalid_state`)
//
// These tests assert the formula. The DB-level CHECK and
// the race-safety story live in the migration and the
// executePackRefund test below.
// =====================================================================

describe('unusedCredits', () => {
  it('returns total when consumed is 0', () => {
    expect(unusedCredits(10, 0)).toBe(10);
  });
  it('returns 0 when consumed equals total', () => {
    expect(unusedCredits(10, 10)).toBe(0);
  });
  it('returns the difference in the middle', () => {
    expect(unusedCredits(10, 5)).toBe(5);
  });
  it('clamps to 0 when consumed > total (defensive)', () => {
    expect(unusedCredits(10, 12)).toBe(0);
  });
  it('falls back to PACK_TOTAL_CREDITS (10) when total is null', () => {
    expect(unusedCredits(null, 3)).toBe(7);
  });
  it('falls back to 0 when consumed is null', () => {
    expect(unusedCredits(10, null)).toBe(10);
  });
});

describe('calculatePackRefundPreview — user-locked examples', () => {
  it('10 unused sessions → €350 calculated, capped at €299 (amount paid)', () => {
    const out = calculatePackRefundPreview({
      totalCredits: 10,
      consumedCredits: 0,
      amountCents: PACK_TOTAL_CENTS,
      status: 'active',
    });
    expect(out).toEqual({
      kind: 'ok',
      unusedSessions: 10,
      calculatedCents: 10 * PACK_PER_UNUSED_REFUND_CENTS,
      actualCents: PACK_TOTAL_CENTS,
      capped: true,
    });
  });

  it('5 unused sessions → €175 actual (no cap)', () => {
    const out = calculatePackRefundPreview({
      totalCredits: 10,
      consumedCredits: 5,
      amountCents: PACK_TOTAL_CENTS,
      status: 'active',
    });
    expect(out).toEqual({
      kind: 'ok',
      unusedSessions: 5,
      calculatedCents: 5 * PACK_PER_UNUSED_REFUND_CENTS,
      actualCents: 5 * PACK_PER_UNUSED_REFUND_CENTS,
      capped: false,
    });
  });

  it('0 unused sessions → €0', () => {
    const out = calculatePackRefundPreview({
      totalCredits: 10,
      consumedCredits: 10,
      amountCents: PACK_TOTAL_CENTS,
      status: 'completed',
    });
    expect(out).toEqual({
      kind: 'ok',
      unusedSessions: 0,
      calculatedCents: 0,
      actualCents: 0,
      capped: false,
    });
  });

  it('partial consumption on a non-active pack (completed) is also refundable', () => {
    const out = calculatePackRefundPreview({
      totalCredits: 10,
      consumedCredits: 7,
      amountCents: PACK_TOTAL_CENTS,
      status: 'completed',
    });
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') {
      expect(out.unusedSessions).toBe(3);
      expect(out.actualCents).toBe(3 * PACK_PER_UNUSED_REFUND_CENTS);
    }
  });

  it('a pending_payment pack can also be refunded (pre-payment cancel path)', () => {
    const out = calculatePackRefundPreview({
      totalCredits: 10,
      consumedCredits: 0,
      amountCents: PACK_TOTAL_CENTS,
      status: 'pending_payment',
    });
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') {
      expect(out.actualCents).toBe(PACK_TOTAL_CENTS);
      expect(out.capped).toBe(true);
    }
  });
});

describe('calculatePackRefundPreview — terminal states', () => {
  it('returns already_refunded when status is refunded', () => {
    expect(
      calculatePackRefundPreview({
        totalCredits: 10,
        consumedCredits: 5,
        amountCents: PACK_TOTAL_CENTS,
        status: 'refunded',
      }),
    ).toEqual({ kind: 'already_refunded' });
  });

  // Only `cancelled` is the documented terminal `enrollment_status`
  // value reachable on `session_grants.status`. `no_show` and
  // `rescheduled` belong to the `booking_status` enum
  // (session_bookings.status) and CANNOT appear on a session_grants
  // row — they are intentionally NOT tested here as valid
  // session_grants inputs (would represent an impossible DB state).
  it('returns invalid_state when status is cancelled', () => {
    expect(
      calculatePackRefundPreview({
        totalCredits: 10,
        consumedCredits: 5,
        amountCents: PACK_TOTAL_CENTS,
        status: 'cancelled',
      }),
    ).toEqual({ kind: 'invalid_state', currentStatus: 'cancelled' });
  });
});

describe('calculatePackRefundPreview — invariants', () => {
  it('actual never exceeds amount_paid', () => {
    for (let consumed = 0; consumed <= 10; consumed++) {
      const out = calculatePackRefundPreview({
        totalCredits: 10,
        consumedCredits: consumed,
        amountCents: PACK_TOTAL_CENTS,
        status: 'active',
      });
      if (out.kind === 'ok') {
        expect(out.actualCents).toBeLessThanOrEqual(PACK_TOTAL_CENTS);
      }
    }
  });

  it('actual never exceeds calculated', () => {
    for (let consumed = 0; consumed <= 10; consumed++) {
      const out = calculatePackRefundPreview({
        totalCredits: 10,
        consumedCredits: consumed,
        amountCents: PACK_TOTAL_CENTS,
        status: 'active',
      });
      if (out.kind === 'ok') {
        expect(out.actualCents).toBeLessThanOrEqual(out.calculatedCents);
      }
    }
  });

  it('unused count is always within [0, total_credits]', () => {
    for (let consumed = -2; consumed <= 12; consumed++) {
      const out = calculatePackRefundPreview({
        totalCredits: 10,
        consumedCredits: consumed,
        amountCents: PACK_TOTAL_CENTS,
        status: 'active',
      });
      if (out.kind === 'ok') {
        expect(out.unusedSessions).toBeGreaterThanOrEqual(0);
        expect(out.unusedSessions).toBeLessThanOrEqual(10);
      }
    }
  });
});
