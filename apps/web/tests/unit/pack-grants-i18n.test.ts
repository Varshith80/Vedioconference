import { describe, it, expect } from 'vitest';
import enMessages from '@/messages/en.json';
import frMessages from '@/messages/fr.json';

// =====================================================================
// Phase 1 — Feature B: i18n presence for the Pack admin surface.
//
// Every key the new /admin/packs list page, /admin/packs/[id]
// detail page, and the client refund card consumes must
// exist in both locales. This prevents a future regression
// where the EN copy is updated but the FR copy is missed.
// =====================================================================

const REQUIRED_KEYS: string[] = [
  'Admin.packs.title',
  'Admin.packs.subline',
  'Admin.packs.empty',
  'Admin.packs.action.view',
  'Admin.packs.columns.student',
  'Admin.packs.columns.status',
  'Admin.packs.columns.amount',
  'Admin.packs.columns.credits',
  'Admin.packs.columns.refunded',
  'Admin.packs.columns.createdAt',
  'Admin.packs.columns.expiresAt',
  'Admin.packs.detail.title',
  'Admin.packs.detail.subline',
  'Admin.packs.detail.fields.student',
  'Admin.packs.detail.fields.status',
  'Admin.packs.detail.fields.amount',
  'Admin.packs.detail.fields.credits',
  'Admin.packs.detail.fields.created',
  'Admin.packs.detail.fields.expires',
  'Admin.packs.detail.fields.refunded',
  'Admin.packs.detail.refund.title',
  'Admin.packs.detail.refund.description',
  'Admin.packs.detail.refund.execute',
  'Admin.packs.detail.refund.executing',
  'Admin.packs.detail.refund.success',
  'Admin.packs.detail.refund.failure',
  'Admin.packs.detail.refund.alreadyRefunded',
  'Admin.packs.detail.refund.invalidState',
  'Admin.packs.detail.refund.zeroUnused',
  'Admin.packs.detail.refund.unusedSessions',
  'Admin.packs.detail.refund.calculated',
  'Admin.packs.detail.refund.actual',
  'Admin.packs.detail.refund.capped',
  'Admin.sidebar',
  'Admin.topNav',
];

function read(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object' && k in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, obj);
}

describe('Pack admin i18n keys', () => {
  it.each(REQUIRED_KEYS)('en.json has key %s', (key) => {
    expect(read(enMessages, key)).toBeDefined();
  });
  it.each(REQUIRED_KEYS)('fr.json has key %s', (key) => {
    expect(read(frMessages, key)).toBeDefined();
  });

  it('both locales include the "packs" navigation entry in the sidebar', () => {
    const enSidebar = (read(enMessages, 'Admin.sidebar') as { items?: Array<{ id: string }> }).items;
    const frSidebar = (read(frMessages, 'Admin.sidebar') as { items?: Array<{ id: string }> }).items;
    expect(enSidebar).toBeDefined();
    expect(frSidebar).toBeDefined();
    expect(enSidebar!.some((i) => i.id === 'packs')).toBe(true);
    expect(frSidebar!.some((i) => i.id === 'packs')).toBe(true);
  });

  it('both locales include the "packs" navigation entry in the top nav', () => {
    const enTop = (read(enMessages, 'Admin.topNav') as { items?: Array<{ id: string }> }).items;
    const frTop = (read(frMessages, 'Admin.topNav') as { items?: Array<{ id: string }> }).items;
    expect(enTop).toBeDefined();
    expect(frTop).toBeDefined();
    expect(enTop!.some((i) => i.id === 'packs')).toBe(true);
    expect(frTop!.some((i) => i.id === 'packs')).toBe(true);
  });
});
