import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `session-booking-confirmed.tsx` — sent after the n8n
 * `session-booking-to-zoom` workflow has created the Zoom
 * meeting and persisted the meeting_link row. Contains the
 * join URL. Renamed from `module-booking-confirmed.tsx` in
 * Sprint 3.6 §6.1 to match the v2 hierarchy.
 */
export interface SessionBookingConfirmedProps {
  studentName: string;
  sessionTitle: string;
  courseTitle: string;
  scheduledStartIso: string;
  durationMin: number;
  joinUrl: string;
  dashboardUrl: string;
}

export async function renderSessionBookingConfirmedEmail(
  locale: EmailLocale,
  props: SessionBookingConfirmedProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.sessionBookingConfirmed' });
  const subject = t('subject', { sessionTitle: props.sessionTitle });
  const scheduledHuman = new Date(props.scheduledStartIso).toUTCString();
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { sessionTitle: props.sessionTitle, courseTitle: props.courseTitle })}</p>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '16px 0', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 12px', backgroundColor: '#EDF0EA', borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: '#2B2E33' }}>{t('when')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#142B4D' }}>{scheduledHuman}</div>
              <div style={{ fontSize: 13, color: '#2B2E33' }}>
                {t('duration', { minutes: props.durationMin })}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
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
      <p style={{ marginTop: 24 }}>
        <a href={props.dashboardUrl} style={{ color: '#1F7A6C' }}>
          {t('dashboardLink')}
        </a>
      </p>
    </>,
    subject,
  );
  const text = jsxToPlainText(
    <>
      {`${t('title')}\n\n`}
      {`${t('greeting', { name: props.studentName })}\n\n`}
      {`${t('body', { sessionTitle: props.sessionTitle, courseTitle: props.courseTitle })}\n\n`}
      {`${t('when')}: ${scheduledHuman}\n`}
      {`${t('duration', { minutes: props.durationMin })}\n\n`}
      {`${t('joinCta')}: ${props.joinUrl}\n\n`}
      {`${t('dashboardLink')}: ${props.dashboardUrl}\n`}
    </>,
  );
  return { subject, html, text };
}
