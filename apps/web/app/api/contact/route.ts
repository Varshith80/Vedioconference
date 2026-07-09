import { NextResponse, type NextRequest } from 'next/server';
import { resend } from '@/lib/email/client';
import { contactSchema } from '@/lib/validations/contact';
import { errorResponse } from '@/lib/utils/api';
import { rateLimit } from '@/lib/utils/rate-limit';
import { logger } from '@/lib/utils/logger';
import { BRAND } from '@/lib/constants/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public contact endpoint. Validates the body with Zod, applies a
 * per-IP rate limit (5 / hour), and forwards the message to the
 * configured Resend inbox. The honeypot field is checked here too.
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    const limit = rateLimit(`contact:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: { code: 'rate_limited', message: 'Trop de requêtes. Réessayez plus tard.' } },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(parsed.error);
    }
    const { name, email, subject, message, website } = parsed.data;

    // Honeypot: if the hidden field is filled, silently 200.
    if (website && website.length > 0) {
      logger.warn('[contact] honeypot triggered', { ip });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const fromAddress = process.env.RESEND_FROM_EMAIL ?? 'no-reply@example.com';
    const toAddress = BRAND.contactEmail;

    const subjectLine = `[Contact] ${subject}`;
    const html = renderEmail({ name, email, subject, message });

    const result = await resend().emails.send({
      from: fromAddress,
      to: toAddress,
      replyTo: email,
      subject: subjectLine,
      html,
    });

    if (result.error) {
      logger.error('[contact] resend error', { error: result.error.message });
      return NextResponse.json(
        { error: { code: 'send_failed', message: 'Envoi impossible. Réessayez plus tard.' } },
        { status: 502 },
      );
    }

    logger.info('[contact] message sent', { ip, to: toAddress });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return errorResponse(err);
  }
}

function renderEmail(args: { name: string; email: string; subject: string; message: string }): string {
  // Plain HTML, escaped by hand. No template engine to keep deps tight.
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; line-height: 1.5;">
      <h2 style="margin:0 0 12px 0;">${esc(args.subject)}</h2>
      <p style="margin:0 0 8px 0;"><strong>De :</strong> ${esc(args.name)} &lt;${esc(args.email)}&gt;</p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="white-space: pre-wrap; margin: 0;">${esc(args.message)}</p>
    </div>
  `;
}
