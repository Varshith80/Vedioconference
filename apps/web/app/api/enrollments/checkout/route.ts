import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, NotFound, Unauthorized, Conflict } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * POST /api/enrollments/checkout — asks n8n to create a Stripe
 * Checkout Session for a `pending_payment` enrollment.
 *
 * Architecture (Sprint C, locked)
 * --------------------------------
 * n8n is the *only* system that calls Stripe on the booking path
 * (CLAUDE.md §2.3). The Next.js application does NOT import the
 * Stripe SDK for course payments. It delegates to the n8n
 * `enrollment-created` workflow via `N8N_ENROLLMENT_WEBHOOK_URL`.
 *
 * Flow
 * ----
 *   1. Client calls POST /api/enrollments/checkout { enrollment_id }.
 *   2. Route verifies the enrollment belongs to the caller and
 *      is `pending_payment`.
 *   3. Route POSTs to the n8n webhook with
 *      `{ enrollment_id, success_url, cancel_url, locale }`.
 *   4. n8n creates the Stripe Checkout Session and POSTs back
 *      to `/api/n8n/notify?type=enrollment_checkout_created`
 *      with `{ enrollment_id, checkout_url, stripe_session_id }`.
 *      The Next.js `/api/n8n/notify` handler (added in a
 *      follow-up patch) stores the session id on the
 *      enrollment row.
 *      NOTE: in the current Sprint C, the n8n workflow returns
 *      the checkout URL synchronously via the webhook response
 *      body, which the route returns to the client.
 *   5. Client redirects to `checkout_url`.
 *
 * Mock-gated execution
 * --------------------
 * When `N8N_ENROLLMENT_WEBHOOK_URL` is unset, the route returns
 * 503 `checkout_unavailable` — no destructive call is made.
 * This is the "real code, mock-gated execution" Sprint C mode.
 */
const bodySchema = z.object({
  enrollment_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to check out.');

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid request body.', { issues: parsed.error.issues });
    }

    // Read the enrollment + course, assert ownership.
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id, student_id, course_id, status, amount_cents, currency, stripe_session_id')
      .eq('id', parsed.data.enrollment_id)
      .single();
    const enrollmentRow = enrollment as unknown as {
      id: string;
      student_id: string;
      course_id: string;
      status: string;
      amount_cents: number;
      currency: string;
      stripe_session_id: string | null;
    } | null;
    if (enrollmentError || !enrollmentRow) {
      throw NotFound('Enrollment not found.');
    }
    if (enrollmentRow.student_id !== user.id) {
      throw new ApiError(403, 'not_owner', 'This enrollment does not belong to you.');
    }
    if (enrollmentRow.status === 'active' || enrollmentRow.status === 'completed') {
      throw Conflict('Enrollment is already paid.', { status: enrollmentRow.status });
    }
    if (enrollmentRow.status !== 'pending_payment') {
      throw new ApiError(409, 'enrollment_inactive', `Cannot check out an enrollment with status "${enrollmentRow.status}".`);
    }

    // Read the course (to display the title in the email and
    // the Stripe Checkout metadata).
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id, title, slug, price_cents, currency')
      .eq('id', enrollmentRow.course_id)
      .single();
    const courseRow = course as unknown as {
      id: string;
      title: string;
      slug: string;
      price_cents: number;
      currency: string;
    } | null;
    if (courseError || !courseRow) {
      throw NotFound('Course not found.');
    }

    const env = serverEnv();
    const webhookUrl = env.N8N_ENROLLMENT_WEBHOOK_URL;
    if (!webhookUrl) {
      // Mock-gated execution: no destructive call without n8n
      // being configured. The client renders a clear "checkout
      // is being prepared" message.
      throw new ApiError(503, 'checkout_unavailable', 'Checkout is not yet configured for this environment.');
    }

    // Resolve locale from the NEXT_LOCALE cookie. The site is
    // locale-prefixed; the success/cancel URLs are absolute.
    const locale = req.cookies.get('NEXT_LOCALE')?.value === 'fr' ? 'fr' : 'en';
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
    const successUrl = `${origin}/${locale}/checkout/success?enrollment_id=${enrollmentRow.id}`;
    const cancelUrl  = `${origin}/${locale}/checkout/cancel?enrollment_id=${enrollmentRow.id}`;

    // Call the n8n workflow. The response is expected to be
    //   { checkout_url: string, stripe_session_id: string }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type':  'application/json',
        'x-webhook-secret': env.N8N_WEBHOOK_SECRET ?? '',
      },
      body: JSON.stringify({
        enrollment_id:   enrollmentRow.id,
        student_id:      enrollmentRow.student_id,
        course: {
          id:          courseRow.id,
          title:       courseRow.title,
          slug:        courseRow.slug,
          price_cents: courseRow.price_cents,
          currency:    courseRow.currency,
        },
        amount_cents: enrollmentRow.amount_cents,
        currency:     enrollmentRow.currency,
        success_url:  successUrl,
        cancel_url:   cancelUrl,
        locale,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable>');
      logger.error('n8n enrollment-created webhook failed', {
        status: response.status,
        body:   text.slice(0, 500),
        enrollment_id: enrollmentRow.id,
      });
      throw new ApiError(502, 'checkout_provider_error', 'Could not create a Stripe Checkout Session at this time.');
    }
    const payload = await response.json().catch(() => null) as
      | { checkout_url?: string; stripe_session_id?: string }
      | null;
    if (!payload?.checkout_url) {
      logger.error('n8n enrollment-created webhook returned no checkout_url', { payload });
      throw new ApiError(502, 'checkout_provider_error', 'Checkout provider returned an invalid response.');
    }

    return jsonResponse({
      ok: true as const,
      data: {
        checkout_url:      payload.checkout_url,
        stripe_session_id: payload.stripe_session_id ?? null,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
