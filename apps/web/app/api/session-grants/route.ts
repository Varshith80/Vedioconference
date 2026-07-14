import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized, NotFound } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { createPendingSessionGrant } from '@/services/curriculum/session-grants';

/**
 * POST /api/session-grants — create a `pending_payment` session
 * grant and return the Stripe Checkout URL.
 *
 * Architecture (Sprint 3.5, locked)
 * --------------------------------
 * Per the user-approved plan, the **session** is now the unit
 * of payment (not the course). A student buys one session at a
 * time. n8n remains the only system that calls Stripe for the
 * booking path (CLAUDE.md §2.3).
 *
 * Flow
 * ----
 *   1. Client calls POST /api/session-grants { session_id }.
 *   2. Route verifies the user is signed in.
 *   3. Route calls `createPendingSessionGrant` service which
 *      checks the session's `price_cents`. If the price is
 *      NULL (Sprint 5 will populate it from the Excel
 *      curriculum), the service returns
 *      `session_price_missing` and the route replies 422.
 *   4. Otherwise, the route POSTs to the n8n
 *      `enrollment-created` workflow via
 *      `N8N_ENROLLMENT_WEBHOOK_URL`. The workflow's payload
 *      field names are renamed per §6.4 of the plan:
 *        enrollment_id  → session_grant_id
 *        course         → session
 *        student_id     → student_id (unchanged)
 *      The workflow filename is unchanged.
 *   5. n8n returns `{ checkout_url, stripe_session_id }`. The
 *      route returns them to the client which redirects to
 *      `checkout_url`.
 *
 * Mock-gated execution
 * --------------------
 * When `N8N_ENROLLMENT_WEBHOOK_URL` is unset, the route returns
 * 503 `checkout_unavailable` — no destructive call is made.
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
    if (!user) throw Unauthorized('You must be signed in to buy a session.');

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Create the pending grant. The service does the price +
    // duplicate checks; the route maps the discriminated
    // result to an HTTP response.
    const result = await createPendingSessionGrant(
      user.id,
      parsed.data.session_id,
    );
    if (result.kind === 'session_not_found') {
      throw NotFound('Session not found.');
    }
    if (result.kind === 'session_price_missing') {
      // The session is published but its price has not yet
      // been imported from the Excel curriculum. This is the
      // documented 422 path for Sprint 3.5 — the student sees
      // a "Price TBD" message in the UI. Sprint 5 will wire
      // the Excel import to populate `sessions.price_cents`.
      throw new ApiError(
        422,
        'session_price_missing',
        'This session does not have a price yet. Please check back later.',
      );
    }
    if (result.kind === 'duplicate_active_grant') {
      throw new ApiError(
        409,
        'session_grant_exists',
        'You already have an active or pending grant for this session.',
        { grant_id: result.grant.id },
      );
    }

    const grant = result.grant;

    // Read the session for the n8n payload.
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, title, slug, price_cents, currency')
      .eq('id', parsed.data.session_id)
      .single();
    const sessionRow = session as unknown as {
      id: string;
      title: string;
      slug: string;
      price_cents: number;
      currency: string;
    } | null;
    if (sessionError || !sessionRow) {
      throw NotFound('Session not found.');
    }

    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      // Mock-gated execution: no destructive call without n8n
      // being configured. The client renders a clear
      // "checkout is being prepared" message.
      throw new ApiError(
        503,
        'checkout_unavailable',
        'Checkout is not yet configured for this environment.',
      );
    }

    // Resolve locale from the NEXT_LOCALE cookie. The site is
    // locale-prefixed; the success/cancel URLs are absolute.
    const locale = req.cookies.get('NEXT_LOCALE')?.value === 'fr' ? 'fr' : 'en';
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const successUrl = `${origin}/${locale}/checkout/success?session_grant_id=${grant.id}`;
    const cancelUrl = `${origin}/${locale}/checkout/cancel?session_grant_id=${grant.id}`;

    // Call the n8n workflow. The workflow filename is
    // `enrollment-created.json` (kept unchanged per
    // Adjustment #2). The internal field names are renamed
    // per §6.4 of the plan. The n8n workflow is responsible
    // for creating the Stripe Checkout Session and returning
    // `{ checkout_url, stripe_session_id }`.
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-secret': env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify({
        session_grant_id: grant.id,
        student_id: grant.student_id,
        session: {
          id: sessionRow.id,
          title: sessionRow.title,
          slug: sessionRow.slug,
          price_cents: sessionRow.price_cents,
          currency: sessionRow.currency,
        },
        amount_cents: grant.amount_cents,
        currency: grant.currency,
        success_url: successUrl,
        cancel_url: cancelUrl,
        locale,
        kind: 'session',
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      logger.error('n8n enrollment-created webhook failed (session-grant path)', {
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
      logger.error('n8n enrollment-created webhook returned no checkout_url (session-grant path)', {
        payload,
        session_grant_id: grant.id,
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
          session_grant_id: grant.id,
          checkout_url: payload.checkout_url,
          stripe_session_id: payload.stripe_session_id ?? null,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
