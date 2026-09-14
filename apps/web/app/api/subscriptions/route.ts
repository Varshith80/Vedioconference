import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import {
  provisionMonthlySubscription,
  MONTHLY_PRICE_CENTS,
  MONTHLY_CURRENCY,
} from '@/services/curriculum/monthly-subscriptions';

/**
 * POST /api/subscriptions — start the Monthly Support checkout.
 *
 * Phase 2 — Feature C: Monthly Support = €109 TTC / month,
 * 4×60-min sessions / period, no rollover, end-of-period cancel.
 * The recurring billing is owned by Stripe; n8n is the only
 * system that calls Stripe for the booking path (CLAUDE.md §2.3).
 *
 * Flow
 * ----
 *   1. Client calls POST /api/subscriptions { kind: 'monthly' }.
 *   2. Route verifies the user is signed in. The student id is
 *      taken from the auth session — never from the body.
 *   3. Route calls `provisionMonthlySubscription` (service role)
 *      which:
 *        - dedupes by `stripe_subscription_id` UNIQUE
 *          (returns `duplicate_subscription` → 409);
 *        - inserts the `subscriptions` row (status=incomplete,
 *          period from Stripe — see step 4);
 *        - inserts the first-period `session_grants` pool row
 *          (grant_type='subscription', total_credits=4);
 *        - inserts the first `subscription_period_grants` row
 *          (PRIMARY KEY — the at-most-once primitive).
 *
 *      NOTE: this sprint's Stripe webhook integration is not
 *      published (the user authorised the application-side
 *      scaffolding only). The provisioning here creates the
 *      DB rows synchronously so the dashboard can show the
 *      current state; a future Stripe webhook
 *      (customer.subscription.created) reconciles the same
 *      row by stripe_subscription_id.
 *
 *   4. Stripe's authoritative period values come from the
 *      `STRIPE_PRICE_SUBSCRIPTION` env. Without a live
 *      webhook, we use a placeholder period (now → now+30d)
 *      ONLY so the DB row exists for the dashboard. The
 *      webhook handler overwrites this with Stripe's real
 *      values on `customer.subscription.created` arrival.
 *      (D-6 invariant: Stripe is authoritative; the 30-day
 *      placeholder is a temporary scaffolding value, never
 *      authoritative.)
 *
 *   5. Route POSTs to n8n `enrollment-created` with
 *      `kind: 'monthly'` (the workflow's switch branch
 *      handles `mode: 'subscription'`). n8n returns
 *      `{ checkout_url, stripe_session_id }`.
 *
 * Mock-gated execution
 * --------------------
 * When `N8N_ENROLLMENT_WEBHOOK_URL` is unset, the route
 * returns 503 `checkout_unavailable` — no destructive call
 * is made.
 */
const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('monthly') }),
]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to start a subscription.');

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    if (parsed.data.kind !== 'monthly') {
      throw BadRequest('Only kind="monthly" is supported by this route.');
    }

    // Resolve the locale for the n8n payload + the Stripe
    // success/cancel URLs. The site is locale-prefixed.
    const locale = req.cookies.get('NEXT_LOCALE')?.value === 'fr' ? 'fr' : 'en';
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const successUrl = `${origin}/${locale}/checkout/success?kind=monthly`;
    const cancelUrl = `${origin}/${locale}/checkout/cancel?kind=monthly`;

    // Scaffolding period (D-6: NOT authoritative — Stripe's
    // webhook overwrites these on `customer.subscription.created`).
    // The 30-day value is the smallest forward-only scaffolding
    // for the dashboard to render until the webhook is wired
    // in production. Stripe's webhook is the SOLE source of
    // truth for `current_period_start` / `current_period_end`.
    const periodStart = new Date();
    const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    // 1. Provision the DB rows synchronously.
    const stripeSubscriptionId = `scaffolding_${user.id}_${periodStart.toISOString()}`;
    const stripeCustomerId = `scaffolding_cus_${user.id}`;
    const env = serverEnv();
    const stripePriceId = env.STRIPE_PRICE_SUBSCRIPTION ?? 'price_scaffolding_monthly';

    const provision = await provisionMonthlySubscription({
      studentId: user.id,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      latestInvoiceId: null,
      stripeEventId: stripeSubscriptionId,
    });
    if (provision.kind === 'duplicate_subscription') {
      throw new ApiError(
        409,
        'monthly_subscription_exists',
        'You already have an active Monthly Support subscription.',
        { subscription_id: provision.subscriptionId },
      );
    }
    if (provision.kind === 'unknown') {
      throw new ApiError(500, 'provision_failed', 'Could not provision the subscription row.');
    }

    // 2. n8n checkout (mock-gated).
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new ApiError(
        503,
        'checkout_unavailable',
        'Checkout is not yet configured for this environment.',
        { subscription_id: provision.subscriptionId },
      );
    }

    const n8nPayload: Record<string, unknown> = {
      kind: 'monthly',
      student_id: user.id,
      amount_cents: MONTHLY_PRICE_CENTS,
      currency: MONTHLY_CURRENCY,
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale,
      subscription_id: provision.subscriptionId,
      session_grant_id: provision.grantId,
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify(n8nPayload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      logger.error('n8n enrollment-created webhook failed (monthly path)', {
        status: response.status,
        body: text.slice(0, 500),
        subscription_id: provision.subscriptionId,
      });
      throw new ApiError(
        502,
        'checkout_provider_error',
        'Could not create a Stripe Checkout Session at this time.',
      );
    }
    const payload = (await response.json().catch(() => null)) as
      | { checkout_url?: string; stripe_session_id?: string }
      | null;
    if (!payload?.checkout_url) {
      logger.error('n8n enrollment-created webhook returned no checkout_url (monthly path)', {
        payload,
        subscription_id: provision.subscriptionId,
      });
      throw new ApiError(
        502,
        'checkout_provider_error',
        'Checkout provider returned an invalid response.',
      );
    }

    return jsonResponse(
      {
        ok: true as const,
        data: {
          subscription_id: provision.subscriptionId,
          checkout_url: payload.checkout_url,
          stripe_session_id: payload.stripe_session_id ?? null,
          kind: 'monthly',
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
