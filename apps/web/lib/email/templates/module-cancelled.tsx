import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `module-cancelled.tsx` — sent when a booking is cancelled by
 * the student or by the admin. Contains the cancellation reason.
 */
export interface ModuleCancelledProps {
  studentName: string;
  moduleTitle: string;
  courseTitle: string;
  cancelledReason: string;
  dashboardUrl: string;
}

export async function renderModuleCancelledEmail(
  locale: EmailLocale,
  props: ModuleCancelledProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.moduleCancelled' });
  const subject = t('subject', { moduleTitle: props.moduleTitle });
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { moduleTitle: props.moduleTitle, courseTitle: props.courseTitle })}</p>
      <p style={{ margin: '16px 0', fontSize: 13, color: '#2B2E33' }}>
        <strong>{t('reasonLabel')}:</strong> {props.cancelledReason}
      </p>
      <p>
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
          {t('dashboardCta')}
        </a>
      </p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body', { moduleTitle: props.moduleTitle, courseTitle: props.courseTitle })}\n\n`}
      {`${t('reasonLabel')}: ${props.cancelledReason}\n\n`}
      {`${t('dashboardCta')}: ${props.dashboardUrl}\n`}
    </>,
  );
  return { subject, html, text };
}
