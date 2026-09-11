/**
 * Static pricing tiers for Phase 2. Sprint 5 (Slice A) updated
 * the pack to "Pack 10 sessions" (10 credits, 6-month expiry)
 * and the per-session price to €35. The source of truth for
 * the PAYG price is the DB (`sessions.price_cents`) once the
 * curriculum is imported; this constant is the marketing-page
 * fallback. All three tiers are localisable via the
 * `Pricing` i18n namespace; the component receives the
 * already-translated strings.
 */
export interface PricingTier {
  id: 'individual' | 'pack10' | 'monthly';
  name: string;
  description: string;
  /** Integer cents. */
  priceCents: number;
  currency: 'EUR';
  billing: string;
  features: ReadonlyArray<string>;
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
}

export const PRICING_TIERS: ReadonlyArray<PricingTier> = [
  {
    id: 'individual',
    name: 'individualTitle',
    description: 'individualDescription',
    priceCents: 3500,
    currency: 'EUR',
    billing: 'individualBilling',
    features: [
      'individualFeature1',
      'individualFeature2',
      'individualFeature3',
      'individualFeature4',
    ],
    cta: { label: 'individualCta', href: '/sessions' },
  },
  {
    id: 'pack10',
    name: 'pack10Title',
    description: 'pack10Description',
    priceCents: 29900,
    currency: 'EUR',
    billing: 'pack10Billing',
    features: [
      'pack10Feature1',
      'pack10Feature2',
      'pack10Feature3',
      'pack10Feature4',
    ],
    cta: { label: 'pack10Cta', href: '/api/session-grants' },
    highlight: true,
    badge: 'pack10Badge',
  },
  {
    id: 'monthly',
    name: 'monthlyTitle',
    description: 'monthlyDescription',
    priceCents: 10900,
    currency: 'EUR',
    billing: 'monthlyBilling',
    features: [
      'monthlyFeature1',
      'monthlyFeature2',
      'monthlyFeature3',
      'monthlyFeature4',
    ],
    cta: { label: 'monthlyCta', href: '/contact' },
  },
];
