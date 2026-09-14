import { describe, it, expect } from 'vitest';
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';

// =====================================================================
// Phase 1 — Feature A: EN/FR i18n presence test.
//
// Asserts that the keys required by the free-trial surface
// exist in both locales. This prevents a future regression
// where the EN copy is updated but the FR copy is missed.
// =====================================================================

const REQUIRED_KEYS: string[] = [
  'FreeTrial.title',
  'FreeTrial.eligible.title',
  'FreeTrial.eligible.description',
  'FreeTrial.eligible.cta',
  'FreeTrial.eligible.duration',
  'FreeTrial.eligible.notice',
  'FreeTrial.ineligible.title',
  'FreeTrial.ineligible.description',
  'FreeTrial.ineligible.cta',
  'FreeTrial.ineligible.statusActive',
  'FreeTrial.ineligible.statusCompleted',
  'FreeTrial.ineligible.statusPending',
  'FreeTrial.loading.checking',
  'FreeTrial.loading.starting',
  'FreeTrial.success.title',
  'FreeTrial.success.description',
  'FreeTrial.success.cta',
  'FreeTrial.failure.title',
  'FreeTrial.failure.description',
  'FreeTrial.failure.cta',
  'FreeTrial.errors.already_used',
  'FreeTrial.errors.coupon_unavailable',
  'FreeTrial.errors.checkout_unavailable',
  'FreeTrial.errors.session_price_missing',
  'FreeTrial.errors.session_not_found',
  'FreeTrial.errors.network',
  'FreeTrial.errors.generic',
  'Dashboard.home.freeTrial.eligibleTitle',
  'Dashboard.home.freeTrial.eligibleSubline',
  'Dashboard.home.freeTrial.ineligibleTitle',
  'Dashboard.home.freeTrial.ineligibleSubline',
];

function read(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe('FreeTrial i18n keys', () => {
  it.each(REQUIRED_KEYS)('en.json has key %s', (key) => {
    expect(read(enMessages, key)).toBeDefined();
  });
  it.each(REQUIRED_KEYS)('fr.json has key %s', (key) => {
    expect(read(frMessages, key)).toBeDefined();
  });
});
