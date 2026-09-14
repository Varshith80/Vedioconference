import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `monthly-payment-failed.tsx` — sent when Stripe reports an
 * `invoice.payment_failed` event for a Monthly Support
 * subscription. Tells the student:
 *   - what failed,
 *   - that the current period's credits remain usable until
 *     `current_period_end` (D-1),
 *   - that they should update their payment method.
 */
export interface MonthlyPaymentFailedProps {
  studentName: string;
  failureReason: string;
  periodEnd: string; // ISO 8601
  amountEur: number;
}

export async function renderMonthlyPaymentFailedEmail(
  locale: EmailLocale,
  props: MonthlyPaymentFailedProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.monthlyPaymentFailed' });
  const subject = t('subject');
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', {
        amount: props.amountEur,
        periodEnd: props.periodEnd,
      })}</p>
      <p style={{ marginTop: 16, fontSize: 13, color: '#2B2E33' }}>
        <strong>{t('reasonLabel')}:</strong> {props.failureReason}
      </p>
      <p style={{ marginTop: 24, fontSize: 13, color: '#2B2E33' }}>{t('footer')}</p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body', { amount: props.amountEur, periodEnd: props.periodEnd })}\n\n`}
      {`${t('reasonLabel')}: ${props.failureReason}\n\n`}
      {`${t('footer')}`}
    </>,
  );
  return { subject, html, text };
}
