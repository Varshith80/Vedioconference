import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `enrollment-confirmed.tsx` — sent when Stripe
 * `checkout.session.completed` fires and the enrollment is
 * flipped to `active`.
 */
export interface EnrollmentConfirmedProps {
  studentName: string;
  courseTitle: string;
  courseSlug:  string;
  dashboardUrl: string;
}

export async function renderEnrollmentConfirmedEmail(
  locale: EmailLocale,
  props: EnrollmentConfirmedProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.enrollmentConfirmed' });
  const subject = t('subject', { courseTitle: props.courseTitle });
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { courseTitle: props.courseTitle })}</p>
      <p style={{ marginTop: 24, marginBottom: 4 }}>
        <a
          href={props.dashboardUrl}
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            backgroundColor: '#1F7A6C',
            color: '#FFFFFF',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 600,
          }}
        >
          {t('cta')}
        </a>
      </p>
      <p style={{ marginTop: 24, fontSize: 13, color: '#2B2E33' }}>{t('footer')}</p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body', { courseTitle: props.courseTitle })}\n\n`}
      {`${t('cta')}: ${props.dashboardUrl}\n\n`}
      {`${t('footer')}`}
    </>,
  );
  return { subject, html, text };
}
