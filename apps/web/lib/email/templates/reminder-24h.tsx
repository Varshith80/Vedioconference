import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `reminder-24h.tsx` — T-24h reminder. Sent by the n8n
 * `module-reminder-scheduler` workflow's `24h` step.
 */
export interface Reminder24hProps {
  studentName: string;
  moduleTitle: string;
  scheduledStartIso: string;
  joinUrl: string;
}

export async function renderReminder24hEmail(
  locale: EmailLocale,
  props: Reminder24hProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.reminder24h' });
  const subject = t('subject', { moduleTitle: props.moduleTitle });
  const scheduledHuman = new Date(props.scheduledStartIso).toUTCString();
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { moduleTitle: props.moduleTitle })}</p>
      <p style={{ margin: '16px 0', fontSize: 15, fontWeight: 600, color: '#142B4D' }}>{scheduledHuman}</p>
      <p>
        <a
          href={props.joinUrl}
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
      {`${t('body', { moduleTitle: props.moduleTitle })}\n\n`}
      {`${scheduledHuman}\n\n`}
      {`${t('joinCta')}: ${props.joinUrl}\n`}
    </>,
  );
  return { subject, html, text };
}
