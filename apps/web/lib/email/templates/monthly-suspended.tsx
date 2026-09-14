import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `monthly-suspended.tsx` — sent when the Monthly Support
 * subscription is finalised as suspended (grace period expired
 * OR `customer.subscription.deleted` arrived from Stripe). D-1:
 * existing current-period credits remain consumable until
 * `current_period_end`. No expired-credit restoration.
 */
export interface MonthlySuspendedProps {
  studentName: string;
  reason: 'grace_expired' | 'stripe_deleted';
}

export async function renderMonthlySuspendedEmail(
  locale: EmailLocale,
  props: MonthlySuspendedProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.monthlySuspended' });
  const subject = t('subject');
  const reasonLabel = t(`reason_${props.reason}`);
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body')}</p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#2B2E33' }}>
        <strong>{t('reasonLabel')}:</strong> {reasonLabel}
      </p>
      <p style={{ marginTop: 24, fontSize: 13, color: '#2B2E33' }}>{t('footer')}</p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body')}\n\n`}
      {`${t('reasonLabel')}: ${reasonLabel}\n\n`}
      {`${t('footer')}`}
    </>,
  );
  return { subject, html, text };
}
