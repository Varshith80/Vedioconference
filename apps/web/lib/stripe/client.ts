import 'server-only';
import Stripe from 'stripe';
import { serverEnv } from '@/lib/env';

let _stripe: Stripe | null = null;

/** Lazy, server-only Stripe client. */
export function stripe(): Stripe {
  if (!_stripe) {
    const env = serverEnv();
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not configured.');
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
      typescript: true,
    });
  }
  return _stripe;
}
