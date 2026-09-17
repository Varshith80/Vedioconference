import 'server-only';
import * as React from 'react';
import { getTranslations } from 'next-intl/server';
import { shell, jsxToPlainText, type RenderedEmail, type EmailLocale } from './_base';

/**
 * `session-booking-rescheduled.tsx` — sent after the n8n
 * `module-reschedule` workflow has updated the Zoom meeting
 * and persisted the new meeting time. Contains both the
 * previous and new scheduled-start timestamps so the student
 * can confirm the change.
 *
 * Phase 3 — M3.5 (BookingRescheduled). Mirrors
 * `session-booking-confirmed.tsx` and adds
 * `previousScheduledStartIso`.
 */
export interface SessionBookingRescheduledProps {
  studentName: string;
  sessionTitle: string;
  courseTitle: string;
  previousScheduledStartIso: string;
  newScheduledStartIso: string;
  durationMin: number;
  joinUrl: string;
  dashboardUrl: string;
}

export async function renderSessionBookingRescheduledEmail(
  locale: EmailLocale,
  props: SessionBookingRescheduledProps,
): Promise<RenderedEmail> {
  const t = await getTranslations({ locale, namespace: 'Emails.sessionBookingRescheduled' });
  const subject = t('subject', { sessionTitle: props.sessionTitle });
  const previousHuman = new Date(props.previousScheduledStartIso).toUTCString();
  const newHuman = new Date(props.newScheduledStartIso).toUTCString();
  const html = shell(
    <>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20, fontWeight: 600 }}>{t('title')}</h1>
      <p>{t('greeting', { name: props.studentName })}</p>
      <p>{t('body', { sessionTitle: props.sessionTitle, courseTitle: props.courseTitle })}</p>
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: '16px 0', width: '100%' }}>
        <tbody>
          <tr>
            <td style={{ padding: '12px', backgroundColor: '#EDF0EA', borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: '#2B2E33' }}>{t('previousLabel')}</div>
              <div style={{ fontSize: 15, color: '#142B4D', textDecoration: 'line-through' }}>{previousHuman}</div>
            </td>
          </tr>
          <tr>
            <td style={{ padding: 0, height: 8 }} aria-hidden="true" />
          </tr>
          <tr>
            <td style={{ padding: '12px', backgroundColor: '#EDF0EA', borderRadius: 6 }}>
              <div style={{ fontSize: 13, color: '#2B2E33' }}>{t('newLabel')}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#142B4D' }}>{newHuman}</div>
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
      {`${t('previousLabel')}: ${previousHuman}\n`}
      {`${t('newLabel')}: ${newHuman} (${props.durationMin} min)\n\n`}
      {`${t('joinCta')}: ${props.joinUrl}\n\n`}
      {`${t('dashboardLink')}: ${props.dashboardUrl}\n`}
    </>,
  );
  return { subject, html, text };
}
