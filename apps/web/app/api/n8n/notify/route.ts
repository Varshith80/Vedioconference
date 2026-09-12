import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/utils/api';
import { ApiError, BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { ADMIN_NOTIFY_EMAIL } from '@/lib/constants';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/n8n/notify`.
//
// The renderer for the booking-path emails that the v2 n8n
// workflows trigger (confirmation, cancellation, admin digest,
// tutor notification, etc.). n8n is the orchestrator; Next.js
// owns the email-template rendering and the Resend call.
//
// Why Next.js owns the renderer
// -----------------------------
// The same architectural argument that applies to
// `app/api/contact/route.ts` (CLAUDE.md §2.3 — "n8n is the
// only system that calls external APIs on the booking path")
// applies here with one important inversion: the
// `contact` route is a user-facing form (no orchestrator), so
// Next.js does the whole pipeline. The booking emails have an
// orchestrator (n8n) that decides WHEN to send, so n8n does
// the orchestration and Next.js does the rendering + vendor
// call. The `contact` route is the only OTHER Next.js → vendor
// call in the codebase and it is a precedent for this split
// (it renders inline HTML, the same way this route does).
//
// Authentication
// --------------
// `x-webhook-secret` must match `N8N_WEBHOOK_SECRET`. The
// secret is the same shared secret used by the other n8n
// webhooks (`/api/webhooks/n8n`, `/api/cron/send-reminders`).
//
// Recipient safety
// ----------------
// The `admin_*` template set is hard-coded to send to
// `ADMIN_NOTIFY_EMAIL` (env var). The `to` field on the
// request body is IGNORED for those templates. This prevents
// the well-known class of bug where a forged `to` address
// leaks a confirmation / cancellation to an attacker. The
// `email_tutor` and non-admin `email` templates use the
// `to` field as supplied by n8n (which itself only learns
// the address from the Supabase row, not from the public
// Calendly payload).
// =====================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---- Zod schemas ----------------------------------------------------

// Closed-set enum for the templates Next.js knows how to render.
// The v1 `module_booking_confirmed` etc. are preserved as aliases
// to the v2 names so the v1-shaped workflow JSONs that have not
// yet been re-authored still work.
const TEMPLATE_NAMES = [
  // booking-lifecycle (v2)
  'session_booking_confirmed',
  'session_booking_cancelled',
  'session_booking_rescheduled',
  'session_completed',
  // grant-lifecycle (v2)
  'session_grant_checkout_created',
  'session_grant_payment_succeeded',
  'session_grant_refund_succeeded',
  // observability
  'admin_dead_letter',
  'admin_booking_confirmed',
  'admin_booking_cancelled',
  'admin_booking_rescheduled',
  // v1 aliases (kept for one release so the legacy
  // module-*-email workflows do not 400 while they are being
  // rewritten to v2)
  'module_booking_confirmed',
  'module_booking_cancelled',
  'module_booking_rescheduled',
  'module_completed',
  'enrollment_checkout_created',
  'enrollment_refund_succeeded',
] as const;

const notifyBodySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    template: z.enum(TEMPLATE_NAMES),
    to: z.string().email().optional(),
    locale: z.enum(['en', 'fr']).default('fr'),
    props: z.record(z.string(), z.unknown()).default({}),
    // Required for the `admin_*` template set so the operator
    // can identify which workflow produced the email. Ignored
    // for non-admin templates.
    workflow: z.string().optional(),
  }),
  z.object({
    type: z.literal('email_tutor'),
    to: z.string().email(),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(10_000),
    session_booking_id: z.string().uuid().optional(),
  }),
]);

type NotifyBody = z.infer<typeof notifyBodySchema>;

const ADMIN_TEMPLATES = new Set<string>([
  'admin_dead_letter',
  'admin_booking_confirmed',
  'admin_booking_cancelled',
  'admin_booking_rescheduled',
]);

// ---- Brand palette (same as the Sprint 5 Slice E reminder body) ---

const BRAND = {
  bleuPlan: '#1f4e8a',
  velin:    '#f6f4ef',
  white:    '#ffffff',
  text:     '#1f2937',
  muted:    '#6b7280',
} as const;

const STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ---- HTML / text renderers (one per template) ----------------------

interface Rendered {
  subject: string;
  html: string;
  text: string;
}

function htmlShell(opts: { title: string; body: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.velin};font-family:${STACK};color:${BRAND.text};">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.velin};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" width="560" style="background:${BRAND.white};border:1px solid ${BRAND.velin};border-radius:8px;overflow:hidden;">
      <tr><td style="background:${BRAND.bleuPlan};color:#ffffff;padding:20px 24px;font-family:${STACK};font-size:18px;font-weight:600;">Intégrale</td></tr>
      <tr><td style="padding:24px;font-family:${STACK};font-size:15px;line-height:1.55;">${opts.body}</td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid ${BRAND.velin};color:${BRAND.muted};font-size:12px;font-family:${STACK};">© ${new Date().getFullYear()} Intégrale · contact@integrale.example</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(template: string, props: Record<string, unknown>, locale: 'en' | 'fr'): Rendered {
  const fr = locale === 'fr';
  const studentName = typeof props['studentName'] === 'string' ? (props['studentName'] as string) : '';
  const sessionTitle = typeof props['sessionTitle'] === 'string' ? (props['sessionTitle'] as string)
                    : typeof props['moduleTitle'] === 'string' ? (props['moduleTitle'] as string) : '';
  const joinUrl = typeof props['joinUrl'] === 'string' ? (props['joinUrl'] as string) : '#';
  const scheduledStart = typeof props['scheduledStartIso'] === 'string' ? (props['scheduledStartIso'] as string)
                       : typeof props['scheduledStart'] === 'string' ? (props['scheduledStart'] as string) : '';
  const dashboardUrl = typeof props['dashboardUrl'] === 'string' ? (props['dashboardUrl'] as string) : '#';
  const cta = fr ? 'Rejoindre la session' : 'Join the session';
  const greet = fr ? `Bonjour ${studentName},` : `Hi ${studentName},`;

  switch (template) {
    case 'session_booking_confirmed':
    case 'module_booking_confirmed': {
      const subject = fr
        ? 'Votre session est confirmée'
        : 'Your session is confirmed';
      const lead = fr
        ? 'Votre session est confirmée. Vous trouverez ci-dessous le lien pour rejoindre votre tuteur.'
        : 'Your session is confirmed. Below is the link to join your tutor.';
      const body = `${greet}<p>${lead}</p>` +
        `<p><strong>${fr ? 'Session' : 'Session'}:</strong> ${escapeHtml(sessionTitle)}</p>` +
        `<p><strong>${fr ? 'Date' : 'Date'}:</strong> ${escapeHtml(scheduledStart)}</p>` +
        `<p style="margin:32px 0;"><a href="${escapeHtml(joinUrl)}" style="background:${BRAND.bleuPlan};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:${STACK};font-size:15px;font-weight:600;display:inline-block;">${cta}</a></p>` +
        `<p style="color:${BRAND.muted};font-size:13px;"><a href="${escapeHtml(dashboardUrl)}" style="color:${BRAND.muted};">${fr ? 'Voir mon tableau de bord' : 'View my dashboard'}</a></p>`;
      const text = [greet, lead, `${fr ? 'Session' : 'Session'}: ${sessionTitle}`, `${fr ? 'Date' : 'Date'}: ${scheduledStart}`, `${cta}: ${joinUrl}`].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_booking_cancelled':
    case 'module_booking_cancelled': {
      const subject = fr ? 'Votre session a été annulée' : 'Your session was cancelled';
      const lead = fr
        ? 'Votre session a été annulée. Si vous souhaitez reprogrammer, rendez-vous sur votre tableau de bord.'
        : 'Your session was cancelled. To reschedule, visit your dashboard.';
      const body = `${greet}<p>${lead}</p>` +
        `<p><strong>${fr ? 'Session' : 'Session'}:</strong> ${escapeHtml(sessionTitle)}</p>` +
        `<p style="margin:32px 0;"><a href="${escapeHtml(dashboardUrl)}" style="background:${BRAND.bleuPlan};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:${STACK};font-size:15px;font-weight:600;display:inline-block;">${fr ? 'Voir mon tableau de bord' : 'View my dashboard'}</a></p>`;
      const text = [greet, lead, `${fr ? 'Session' : 'Session'}: ${sessionTitle}`].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_booking_rescheduled':
    case 'module_booking_rescheduled': {
      const subject = fr ? 'Votre session a été reprogrammée' : 'Your session was rescheduled';
      const lead = fr
        ? 'Votre session a été reprogrammée. Le nouveau créneau est ci-dessous.'
        : 'Your session was rescheduled. The new time is below.';
      const body = `${greet}<p>${lead}</p>` +
        `<p><strong>${fr ? 'Session' : 'Session'}:</strong> ${escapeHtml(sessionTitle)}</p>` +
        `<p><strong>${fr ? 'Nouvelle date' : 'New date'}:</strong> ${escapeHtml(scheduledStart)}</p>` +
        `<p style="margin:32px 0;"><a href="${escapeHtml(joinUrl)}" style="background:${BRAND.bleuPlan};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:${STACK};font-size:15px;font-weight:600;display:inline-block;">${cta}</a></p>`;
      const text = [greet, lead, `${fr ? 'Session' : 'Session'}: ${sessionTitle}`, `${fr ? 'Nouvelle date' : 'New date'}: ${scheduledStart}`, `${cta}: ${joinUrl}`].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_completed':
    case 'module_completed': {
      const subject = fr ? 'Session terminée' : 'Session completed';
      const lead = fr
        ? 'Votre session est terminée. Merci pour votre participation !'
        : 'Your session is complete. Thanks for attending!';
      const body = `${greet}<p>${lead}</p>` +
        `<p><strong>${fr ? 'Session' : 'Session'}:</strong> ${escapeHtml(sessionTitle)}</p>`;
      const text = [greet, lead, `${fr ? 'Session' : 'Session'}: ${sessionTitle}`].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_grant_checkout_created':
    case 'enrollment_checkout_created': {
      const subject = fr ? 'Votre paiement a été initié' : 'Your payment was started';
      const lead = fr
        ? 'Votre paiement a été initié. Finalisez-le pour confirmer votre inscription.'
        : 'Your payment was started. Complete it to confirm your enrollment.';
      const body = `${greet}<p>${lead}</p>`;
      const text = [greet, lead].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_grant_payment_succeeded': {
      const subject = fr ? 'Paiement confirmé' : 'Payment confirmed';
      const lead = fr
        ? 'Votre paiement a été confirmé. Vos séances sont disponibles sur votre tableau de bord.'
        : 'Your payment was confirmed. Your sessions are available in your dashboard.';
      const body = `${greet}<p>${lead}</p>` +
        `<p style="margin:32px 0;"><a href="${escapeHtml(dashboardUrl)}" style="background:${BRAND.bleuPlan};color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:${STACK};font-size:15px;font-weight:600;display:inline-block;">${fr ? 'Voir mon tableau de bord' : 'View my dashboard'}</a></p>`;
      const text = [greet, lead].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'session_grant_refund_succeeded':
    case 'enrollment_refund_succeeded': {
      const subject = fr ? 'Remboursement effectué' : 'Refund issued';
      const lead = fr
        ? 'Votre remboursement a été effectué. Le crédit apparaîtra sur votre compte sous quelques jours.'
        : 'Your refund was issued. The credit will appear on your account within a few days.';
      const body = `${greet}<p>${lead}</p>`;
      const text = [greet, lead].join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
    case 'admin_dead_letter':
    case 'admin_booking_confirmed':
    case 'admin_booking_cancelled':
    case 'admin_booking_rescheduled': {
      const workflow = typeof props['workflow'] === 'string' ? (props['workflow'] as string) : 'unknown';
      const errorMessage = typeof props['errorMessage'] === 'string' ? (props['errorMessage'] as string) : '';
      const subject = `[${template}] ${workflow}`;
      const lead = fr
        ? 'Un workflow n8n a déclenché un événement admin.'
        : 'An n8n workflow triggered an admin event.';
      const body = `<p>${lead}</p>` +
        `<p><strong>template:</strong> ${escapeHtml(template)}</p>` +
        `<p><strong>workflow:</strong> ${escapeHtml(workflow)}</p>` +
        (errorMessage ? `<p><strong>error:</strong> ${escapeHtml(errorMessage)}</p>` : '') +
        `<pre style="background:${BRAND.velin};padding:12px;border-radius:6px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;">${escapeHtml(JSON.stringify(props, null, 2))}</pre>`;
      const text = [lead, `template: ${template}`, `workflow: ${workflow}`, errorMessage ? `error: ${errorMessage}` : '', JSON.stringify(props, null, 2)].filter(Boolean).join('\n\n');
      return { subject, html: htmlShell({ title: subject, body }), text };
    }
  }

  // Unreachable: the Zod `template` enum should have rejected any
  // value not in TEMPLATE_NAMES before renderTemplate() runs.
  // This branch is a defense-in-depth so the function has a
  // defined return on all paths (TypeScript's strict return-type
  // check). The route handler maps this to a 500 via errorResponse.
  throw new Error(`Unknown template: ${template}`);
}

// ---- Route handler --------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ---- Auth: shared secret --------------------------------------
    const expected = serverEnv().N8N_WEBHOOK_SECRET;
    if (!expected) {
      // We refuse to reveal whether the route exists by
      // 401-ing on a misconfigured deployment (the same
      // pattern as the cron route and the n8n webhook).
      logger.warn('n8n notify called but N8N_WEBHOOK_SECRET is unset');
      throw Unauthorized('Renderer is not configured.');
    }
    const provided = req.headers.get('x-webhook-secret');
    if (provided !== expected) {
      throw Unauthorized('Invalid renderer secret.');
    }

    // ---- Body validation ------------------------------------------
    const raw = await req.json();
    const parsed = notifyBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw BadRequest('Invalid notify payload.', parsed.error.flatten());
    }
    const body: NotifyBody = parsed.data;

    // ---- Recipient resolution -------------------------------------
    let to: string;
    if (body.type === 'email_tutor') {
      // email_tutor is never an admin template; `to` is required
      // and comes from n8n (which itself read it from Supabase,
      // not from the Calendly payload).
      to = body.to;
    } else {
      // body.type === 'email'
      if (ADMIN_TEMPLATES.has(body.template)) {
        // SECURITY: the admin recipient is HARD-CODED to the
        // `ADMIN_NOTIFY_EMAIL` constant in `lib/constants/`.
        // The body's `to` (if any) is ignored. This blocks
        // the well-known attack class where a forged `to`
        // address leaks a confirmation / cancellation to an
        // attacker. The constant is a sibling of
        // `SUPPORT_EMAIL` and is not a `process.env` lookup,
        // so it is never influenced by a request body or by
        // a misconfigured `.env`.
        to = ADMIN_NOTIFY_EMAIL;
      } else {
        // Non-admin email template. The recipient is whatever
        // n8n supplied (which itself resolved the address
        // from Supabase, never from the public Calendly
        // payload). If `to` is missing we 400.
        if (!body.to) {
          throw BadRequest(`Template ${body.template} requires \`to\`.`);
        }
        to = body.to;
      }
    }

    // ---- Render ---------------------------------------------------
    let rendered: Rendered;
    if (body.type === 'email_tutor') {
      // The tutor email is supplied verbatim (n8n rendered
      // the subject and body itself for this type). We do NOT
      // wrap it in a brand shell — the tutor email is a
      // transactional notification and the existing v1
      // `tutor-notification` workflow built the body in n8n.
      // We only minimal-escape for the HTML part.
      const safeBody = escapeHtml(body.body).replace(/\n/g, '<br>');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(body.subject)}</title></head><body style="font-family:${STACK};color:${BRAND.text};">${safeBody}</body></html>`;
      rendered = { subject: body.subject, html, text: body.body };
    } else {
      rendered = renderTemplate(body.template, body.props, body.locale);
    }

    // ---- Send via Resend ------------------------------------------
    const env = serverEnv();
    if (!env.RESEND_API_KEY) {
      // Renderer is not configured (no Resend key). Log and 200
      // so a replay does not re-throw.
      logger.warn('n8n notify: RESEND_API_KEY is unset; skipping send', { template: body.type === 'email' ? body.template : 'email_tutor', to });
      return NextResponse.json({ ok: true, skipped: 'resend_unset' });
    }
    if (!env.RESEND_FROM_EMAIL) {
      // Same pattern as above.
      logger.warn('n8n notify: RESEND_FROM_EMAIL is unset; skipping send');
      return NextResponse.json({ ok: true, skipped: 'resend_from_unset' });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    env.RESEND_FROM_EMAIL,
        to:      [to],
        subject: rendered.subject,
        html:    rendered.html,
        text:    rendered.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.error('Resend send failed', { status: res.status, err: errText.slice(0, 500) });
      throw new ApiError(502, 'upstream_error', 'Email provider rejected the request.');
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
