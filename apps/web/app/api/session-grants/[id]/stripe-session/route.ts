import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { ApiError, NotFound, Unauthorized } from '@/lib/utils/errors';
import { getSessionGrant } from '@/services/curriculum/session-grants';

/**
 * GET /api/session-grants/[id]/stripe-session — return the
 * existing Stripe Checkout Session URL for a `pending_payment`
 * session grant.
 *
 * Used by the `/[locale]/checkout/session-grant/[id]` page to
 * resume an in-flight Stripe Checkout (e.g. the user closed
 * the tab and re-opened it).
 *
 * The new grant's `stripe_session_id` is written by the
 * `/api/n8n/notify` route handler (added in Sprint C, reused
 * unchanged for the v2 path). If no `stripe_session_id` is
 * set yet, the route returns 409 `stripe_session_pending`
 * and the client renders a "preparing your checkout" message.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in to resume checkout.');

    const { id } = await ctx.params;

    const grant = await getSessionGrant(id);
    if (!grant) throw NotFound('Session grant not found.');
    if (grant.student_id !== user.id) {
      throw new ApiError(403, 'not_owner', 'This session grant does not belong to you.');
    }
    if (grant.status === 'active' || grant.status === 'completed') {
      throw new ApiError(409, 'grant_already_paid', 'This session is already paid for.');
    }
    if (grant.status !== 'pending_payment') {
      throw new ApiError(409, 'grant_inactive', `Cannot resume a session grant with status "${grant.status}".`);
    }
    if (!grant.stripe_session_id) {
      throw new ApiError(409, 'stripe_session_pending', 'Your checkout session is still being prepared. Please retry in a moment.');
    }

    // The Stripe Checkout Session URL is reconstructed from
    // the session id. Stripe does not expose a public "lookup
    // URL" for an existing Checkout Session, so the route
    // returns the id; the client re-issues a create-checkout
    // call against `/api/session-grants` if it needs a fresh
    // URL. This is the same shape as the v1
    // `/api/enrollments/[id]/stripe-session` route.
    return jsonResponse({
      ok: true as const,
      data: {
        session_grant_id: grant.id,
        stripe_session_id: grant.stripe_session_id,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
