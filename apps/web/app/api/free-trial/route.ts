import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized, NotFound } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import {
  getFreeTrialStatus,
  getOrCreateFreeTrialCoupon,
  startFreeTrialSessionGrant,
} from '@/services/curriculum/free-trial';

/**
 * POST /api/free-trial — claim a student's first free 60-minute
 * session.
 *
 * Pricing Q6: One 60-min trial per student, NOT per course/program/
 * subject. Enforced server-side via the partial unique index
 * `uq_session_grants_one_trial_per_student` (migration
 * `20260913000003_free_trial_session_grant.sql`). The 100%
 * discount is delivered as a `coupons` row referenced by the
 * existing n8n `enrollment-created` workflow; n8n is the only
 * system that calls Stripe for the booking path (CLAUDE.md §2.3).
 *
 * Flow
 * ----
 *   1. Client POSTs { session_id }.
 *   2. Route verifies the user is signed in. The student id
 *      is taken from the auth session — never from the body.
 *   3. Route calls `startFreeTrialSessionGrant` which:
 *        - resolves the session (404 `session_not_found`,
 *          422 `session_price_missing` otherwise);
 *        - checks no other trial grant exists (returns
 *          `free_trial_already_used` with the existing id);
 *        - inserts a `pending_payment` row with
 *          `is_trial = true`, `amount_cents = 0`, race-safe.
 *   4. Route resolves the 100% coupon id via
 *      `getOrCreateFreeTrialCoupon`.
 *   5. Route POSTs to n8n `enrollment-created` with a
 *      `kind: 'trial'` discriminator and a `coupon_id` field
 *      so n8n applies the 100% discount at Stripe Checkout
 *      creation time.
 *   6. n8n returns `{ checkout_url, stripe_session_id }` and
 *      the route forwards it to the client.
 *
 * Idempotency / race-safety
 * -------------------------
 * The service is the race-safety gate. If two parallel
 * `startFreeTrialSessionGrant` calls for the same student reach
 * the partial unique index, only one wins; the other gets a
 * 23505 which the service translates to
 * `free_trial_already_used`. The client may safely retry and
 * receive a stable 409 with the existing grant id.
 */
const bodySchema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to claim a free trial.');

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    const sessionId = parsed.data.session_id;

    // 1. Service-level claim. Race-safety is owned by the
    //    partial unique index in the migration. The client
    //    cannot influence the student id — it's read from
    //    the authenticated session.
    const result = await startFreeTrialSessionGrant(user.id, sessionId);
    if (result.kind === 'session_not_found') {
      throw NotFound('Session not found.');
    }
    if (result.kind === 'session_price_missing') {
      throw new ApiError(
        422,
        'session_price_missing',
        'This session does not have a price yet. Please check back later.',
      );
    }
    if (result.kind === 'free_trial_already_used') {
      throw new ApiError(
        409,
        'free_trial_already_used',
        'You have already used your free 60-minute trial.',
        { grant_id: result.existingGrantId },
      );
    }
    const grant = result.grant;

    // 2. Coupon lookup (or create on demand).
    const couponId = await getOrCreateFreeTrialCoupon();
    if (!couponId) {
      logger.error('getOrCreateFreeTrialCoupon returned null (free-trial path)', {
        session_grant_id: grant.id,
      });
      throw new ApiError(
        503,
        'coupon_unavailable',
        'Free-trial coupon is not available at this time.',
      );
    }

    // 3. Read the session for the n8n payload.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, slug, price_cents, currency, duration_min')
      .eq('id', sessionId)
      .single();
    if (sessionError || !session) {
      throw NotFound('Session not found.');
    }
    const sessionRow = session as unknown as {
      id: string;
      title: string;
      slug: string;
      price_cents: number;
      currency: string;
      duration_min: number | null;
    };

    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      // Mock-gated execution: no destructive call without n8n
      // being configured.
      throw new ApiError(
        503,
        'checkout_unavailable',
        'Checkout is not yet configured for this environment.',
      );
    }

    // 4. Resolve the success / cancel URLs.
    const locale = req.cookies.get('NEXT_LOCALE')?.value === 'fr' ? 'fr' : 'en';
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const successUrl = `${origin}/${locale}/checkout/success?session_grant_id=${grant.id}`;
    const cancelUrl = `${origin}/${locale}/checkout/cancel?session_grant_id=${grant.id}`;

    // 5. Call n8n `enrollment-created` with the trial discriminator
    //    and the coupon id. n8n is responsible for applying the
    //    100% discount at Stripe Checkout creation time.
    const n8nPayload: Record<string, unknown> = {
      session_grant_id: grant.id,
      student_id: grant.student_id,
      session: {
        id: sessionRow.id,
        title: sessionRow.title,
        slug: sessionRow.slug,
        price_cents: sessionRow.price_cents,
        currency: sessionRow.currency,
        duration_min: sessionRow.duration_min,
      },
      amount_cents: 0,
      currency: sessionRow.currency,
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale,
      kind: 'trial',
      coupon_id: couponId,
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
      logger.error('n8n enrollment-created webhook failed (free-trial path)', {
        status: response.status,
        body: text.slice(0, 500),
        session_grant_id: grant.id,
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
      logger.error('n8n enrollment-created webhook returned no checkout_url (free-trial path)', {
        payload,
        session_grant_id: grant.id,
      });
      throw new ApiError(
        502,
        'checkout_provider_error',
        'Checkout provider returned an invalid response.',
      );
    }

    // 6. Return the checkout URL. The grant is in `pending_payment`
    //    until the Stripe webhook confirms the 100%-off charge.
    return jsonResponse(
      {
        ok: true as const,
        data: {
          session_grant_id: grant.id,
          checkout_url: payload.checkout_url,
          stripe_session_id: payload.stripe_session_id ?? null,
          kind: 'trial',
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * GET /api/free-trial — read-only check used by the dashboard
 * banner. Returns whether the student has already used their
 * free trial. Authentication is required; the student id is
 * taken from the auth session.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to check your trial status.');

    const status = await getFreeTrialStatus(user.id);
    return jsonResponse(
      {
        ok: true as const,
        data: {
          used: status.used,
          grant_id: status.grantId,
          status: status.status,
        },
      },
      { status: 200 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
