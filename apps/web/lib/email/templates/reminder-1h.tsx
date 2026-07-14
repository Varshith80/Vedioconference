import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `reminder-1h.tsx` — T-1h final reminder. Sent by the n8n
 * `session-reminder-scheduler` workflow's `1h` step. Sprint
 * 3.5 renamed the underlying entity from `module` to
 * `session`; this template now reads `sessionTitle`.
 */
export interface Reminder1hProps {
  studentName: string;
  sessionTitle: string;
  scheduledStartIso: string;
  joinUrl: string;
}

export async function renderReminder1hEmail(
  locale: EmailLocale,
  props: Reminder1hProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.reminder1h' });
  const subject = t('subject', { sessionTitle: props.sessionTitle });
  const scheduledHuman = new Date(props.scheduledStartIso).toUTCString();
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { sessionTitle: props.sessionTitle })}</p>
      <p style={{ margin: '16px 0', fontSize: 15, fontWeight: 600, color: '#142B4D' }}>{scheduledHuman}</p>
      <p>
        <a
          href={props.joinUrl}
          style={{
            display: 'inline-block',
            padding: '10px 16px',
            backgroundColor: '#E8A33D',
            color: '#142B4D',
            textDecoration: 'none',
            borderRadius: 6,
            fontWeight: 700,
          }}
        >
          {t('joinCta')}
        </a>
      </p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body', { sessionTitle: props.sessionTitle })}\n\n`}
      {`${scheduledHuman}\n\n`}
      {`${t('joinCta')}: ${props.joinUrl}\n`}
    </>,
  );
  return { subject, html, text };
}
