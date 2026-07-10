import 'server-only';
import { resend } from './client';
import { serverEnv } from '@/lib/env';
import { renderEmailTemplate, type EmailTemplateProps } from './templates';
import type { EmailLocale } from './templates/_base';
import { logger } from '@/lib/utils/logger';

/**
 * `lib/email/send.ts` — server-only helper. Renders a
 * template, then dispatches via Resend. Used by the n8n
 * notify webhook (`POST /api/webhooks/n8n?type=email`) and by
 * any server code that needs to send a transactional email
 * directly (e.g. the contact form in B1).
 *
 * The send is mock-gated: when `RESEND_API_KEY` is not set, the
 * helper logs and returns a synthetic `id='mock'` so the
 * caller can continue. No destructive call is ever made
 * against the production Resend account when the env is unset.
 */
export interface SendTemplatedEmailInput {
  to:       string;
  locale:   EmailLocale;
  template: EmailTemplateProps;
}

export interface SendTemplatedEmailResult {
  id:     string;
  status: 'sent' | 'mocked';
}

export async function sendTemplatedEmail(
  input: SendTemplatedEmailInput,
): Promise<SendTemplatedEmailResult> {
  const rendered = await renderEmailTemplate(input.locale, input.template);
  const env = serverEnv();
  if (!env.RESEND_API_KEY) {
    logger.info('email mocked (RESEND_API_KEY not set)', {
      to:      input.to,
      subject: rendered.subject,
      template: input.template.name,
    });
    return { id: 'mock', status: 'mocked' };
  }
  const { data, error } = await resend().emails.send({
    from:    env.RESEND_FROM_EMAIL,
    to:      input.to,
    subject: rendered.subject,
    html:    rendered.html,
    text:    rendered.text,
  });
  if (error) {
    logger.error('resend send failed', {
      to:       input.to,
      subject:  rendered.subject,
      template: input.template.name,
      err:      error.message,
    });
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { id: data?.id ?? 'sent', status: 'sent' };
}
