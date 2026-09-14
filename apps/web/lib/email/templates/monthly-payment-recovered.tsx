import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `monthly-payment-recovered.tsx` — sent when a Monthly Support
 * subscription recovers from `past_due` back to `active`. D-1:
 * no expired-credit restoration is offered (unused credits
 * from a past_due period do not roll over).
 */
export interface MonthlyPaymentRecoveredProps {
  studentName: string;
}

export async function renderMonthlyPaymentRecoveredEmail(
  locale: EmailLocale,
  props: MonthlyPaymentRecoveredProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.monthlyPaymentRecovered' });
  const subject = t('subject');
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body')}</p>
      <p style={{ marginTop: 24, fontSize: 13, color: '#2B2E33' }}>{t('footer')}</p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body')}\n\n`}
      {`${t('footer')}`}
    </>,
  );
  return { subject, html, text };
}
