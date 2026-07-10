import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `admin-dead-letter.tsx` — sent to the admin distribution list
 * when an n8n workflow posts to the dead-letter route. Carries
 * the workflow name, the error message, and the original event
 * payload.
 */
export interface AdminDeadLetterProps {
  workflow:     string;
  errorMessage: string;
  originalEvent: Record<string, unknown>;
}

export async function renderAdminDeadLetterEmail(
  locale: EmailLocale,
  props: AdminDeadLetterProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.adminDeadLetter' });
  const subject = t('subject', { workflow: props.workflow });
  const eventJson = JSON.stringify(props.originalEvent, null, 2);
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('body', { workflow: props.workflow })}</p>
      <p style={{ margin: '16px 0', fontSize: 13, color: '#2B2E33' }}>
        <strong>{t('errorLabel')}:</strong> {props.errorMessage}
      </p>
      <pre
        style={{
          backgroundColor: '#EDF0EA',
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {eventJson}
      </pre>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('body', { workflow: props.workflow })}\n\n`}
      {`${t('errorLabel')}: ${props.errorMessage}\n\n`}
      {eventJson}
    </>,
  );
  return { subject, html, text };
}
