import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

// =====================================================================
// Phase 1 — Feature A: UI states test.
//
// Asserts the 5 banner states (eligible / not_eligible /
// loading / success / failure) are renderable and have a
// stable DOM shape. We use renderToStaticMarkup to avoid
// pulling in a DOM library and to keep the test surface
// small.
// =====================================================================

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock next-intl so the component does not require the
// NextIntlClientProvider context at render time.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { FreeTrialBanner } = await import('@/components/dashboard/free-trial-banner');

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

describe('FreeTrialBanner — UI states', () => {
  it('renders the eligible state with the CTA', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'eligible' },
        sessionId: SESSION_ID,
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="eligible"');
    expect(html).toContain('aria-labelledby="free-trial-title"');
    // CTA is rendered as a real <button type="button">.
    expect(html).toMatch(/<button[^>]*type="button"/);
  });

  it('renders the not_eligible state with status and a catalog link', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'not_eligible', status: 'completed' },
        sessionId: '',
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="not_eligible"');
    expect(html).toContain('href="/en/catalog"');
  });

  it('renders the loading state with aria-busy=true', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'loading' },
        sessionId: SESSION_ID,
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="loading"');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders the starting state with aria-busy=true', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'starting' },
        sessionId: SESSION_ID,
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="starting"');
    expect(html).toContain('aria-busy="true"');
  });

  it('renders the success state with a Stripe Checkout link', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'success', checkoutUrl: 'https://stripe.test/cs_1' },
        sessionId: SESSION_ID,
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="success"');
    expect(html).toContain('href="https://stripe.test/cs_1"');
  });

  it('renders the failure state with the "try again" affordance', () => {
    const html = renderToStaticMarkup(
      React.createElement(FreeTrialBanner, {
        initial: { kind: 'failure', reason: 'already_used' },
        sessionId: SESSION_ID,
        catalogHref: '/en/catalog',
        locale: 'en',
      }),
    );
    expect(html).toContain('data-state="failure"');
    // The "try again" button is type=button.
    expect(html).toMatch(/<button[^>]*type="button"/);
  });
});
