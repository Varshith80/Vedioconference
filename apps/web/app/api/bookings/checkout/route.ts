import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { stripe } from '@/lib/stripe/client';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/services/auth';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

const checkoutSchema = z.object({
  courseId: z.string().uuid(),
  start:    z.string().datetime(),
  end:      z.string().datetime(),
});

/**
 * Create a Stripe Checkout Session for a course booking.
 *
 * The session metadata carries everything the Stripe webhook
 * (handled by n8n) needs to create the booking + Zoom meeting.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();

    const body = checkoutSchema.parse(await req.json());
    const supabase = createSupabaseServerClient();
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('*')
      .eq('id', body.courseId)
      .eq('is_published', true)
      .single();
    if (courseError || !course) throw BadRequest('Cours introuvable.');

    const session = await stripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email!,
      line_items: [{
        price_data: {
          currency:    course.currency.toLowerCase(),
          unit_amount: course.price_cents,
          product_data: { name: course.title, description: course.subtitle ?? undefined },
        },
        quantity: 1,
      }],
      metadata: {
        student_id: user.id,
        course_id:  course.id,
        start:      body.start,
        end:        body.end,
      },
      success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/bookings?status=success`,
      cancel_url:  `${process.env.NEXT_PUBLIC_SITE_URL}/courses/${course.slug}?status=cancelled`,
    });

    logger.info('Stripe checkout session created', { sessionId: session.id, userId: user.id });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) { return errorResponse(e); }
}
