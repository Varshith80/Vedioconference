import { describe, it, expect } from 'vitest';

// =====================================================================
// Phase 1 — Feature A: pure helper tests.
//
// Covers:
//   - `hasUsedFreeTrial` recognises active/completed/
//     pending_payment trials and ignores cancelled/refunded.
//   - `FREE_TRIAL_DURATION_MIN === 60` (locked by Pricing Q6).
//
// The service-layer race-safety and the API route are
// covered by separate files.
// =====================================================================

const { hasUsedFreeTrial, FREE_TRIAL_DURATION_MIN } = await import(
  '@/services/curriculum/free-trial'
);

describe('hasUsedFreeTrial', () => {
  it('returns false for an empty grant list', () => {
    expect(hasUsedFreeTrial([])).toBe(false);
  });

  it('returns false when no grant has is_trial = true', () => {
    const grants = [
      { is_trial: false, status: 'active' },
      { is_trial: null, status: 'active' },
      { is_trial: false, status: 'completed' },
    ];
    expect(hasUsedFreeTrial(grants)).toBe(false);
  });

  it('returns true for an active trial', () => {
    const grants = [{ is_trial: true, status: 'active' }];
    expect(hasUsedFreeTrial(grants)).toBe(true);
  });

  it('returns true for a completed trial', () => {
    const grants = [{ is_trial: true, status: 'completed' }];
    expect(hasUsedFreeTrial(grants)).toBe(true);
  });

  it('returns true for a pending_payment trial', () => {
    const grants = [{ is_trial: true, status: 'pending_payment' }];
    expect(hasUsedFreeTrial(grants)).toBe(true);
  });

  it('returns false for a cancelled trial (re-attempt allowed)', () => {
    const grants = [{ is_trial: true, status: 'cancelled' }];
    expect(hasUsedFreeTrial(grants)).toBe(false);
  });

  it('returns false for a refunded trial (re-attempt allowed)', () => {
    const grants = [{ is_trial: true, status: 'refunded' }];
    expect(hasUsedFreeTrial(grants)).toBe(false);
  });

  it('returns true when at least one trial grant is in a counting state', () => {
    const grants = [
      { is_trial: true, status: 'cancelled' },
      { is_trial: true, status: 'completed' },
      { is_trial: false, status: 'active' },
    ];
    expect(hasUsedFreeTrial(grants)).toBe(true);
  });

  it('ignores is_trial = null rows even when they are active', () => {
    const grants = [
      { is_trial: null, status: 'active' },
      { is_trial: null, status: 'completed' },
    ];
    expect(hasUsedFreeTrial(grants)).toBe(false);
  });
});

describe('FREE_TRIAL_DURATION_MIN', () => {
  it('is locked at 60 minutes (Pricing Q6)', () => {
    expect(FREE_TRIAL_DURATION_MIN).toBe(60);
  });
});
