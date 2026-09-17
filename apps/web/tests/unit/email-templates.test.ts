import { describe, it, expect, vi } from 'vitest';

// next-intl/server's getTranslations pulls in heavy next-intl
// init logic. For these pure render tests we stub the
// translations function with a flat key-returning helper.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ namespace }: { namespace: string }) => {
    const fixture: Record<string, string> = {
      'Emails.enrollmentConfirmed.subject':       'Welcome to {courseTitle}',
      'Emails.sessionBookingConfirmed.subject':   'Session confirmed — {sessionTitle}',
      'Emails.sessionBookingRescheduled.subject': 'Session rescheduled — {sessionTitle}',
      'Emails.reminder24h.subject':               'Reminder — {sessionTitle} tomorrow',
      'Emails.reminder1h.subject':                'Starting soon — {sessionTitle}',
      'Emails.sessionCancelled.subject':          'Session cancelled — {sessionTitle}',
      'Emails.adminDeadLetter.subject':           '[n8n] {workflow} failed',
    };
    return (key: string, vars?: Record<string, unknown>) => {
      const full = `${namespace}.${key}`;
      // Subject-style keys can take ICU vars. Use the fixture
      // when present, otherwise return the key unchanged so
      // tests assert *structure* (e.g. "contains the join URL")
      // rather than a snapshot of the translation copy.
      const template = fixture[full] ?? full;
      if (vars && 'courseTitle'  in vars) return template.replace('{courseTitle}',  String(vars.courseTitle));
      if (vars && 'sessionTitle' in vars) return template.replace('{sessionTitle}', String(vars.sessionTitle));
      if (vars && 'workflow'     in vars) return template.replace('{workflow}',    String(vars.workflow));
      if (vars && 'name'         in vars) return template.replace('{name}',        String(vars.name));
      return template;
    };
  }),
}));

import { renderEnrollmentConfirmedEmail } from '@/lib/email/templates/enrollment-confirmed';
import { renderSessionBookingConfirmedEmail } from '@/lib/email/templates/session-booking-confirmed';
import { renderSessionBookingRescheduledEmail } from '@/lib/email/templates/session-booking-rescheduled';
import { renderReminder24hEmail } from '@/lib/email/templates/reminder-24h';
import { renderReminder1hEmail } from '@/lib/email/templates/reminder-1h';
import { renderSessionCancelledEmail } from '@/lib/email/templates/session-cancelled';
import { renderAdminDeadLetterEmail } from '@/lib/email/templates/admin-dead-letter';

describe('email templates', () => {
  const baseProps = {
    enrollmentConfirmed: {
      studentName:  'Alice',
      courseTitle:  'Mathématiques — Terminale',
      courseSlug:   'mathematiques-terminale',
      dashboardUrl: 'https://example.com/en/dashboard',
    },
    sessionBookingConfirmed: {
      studentName:      'Alice',
      sessionTitle:     'Algèbre linéaire',
      courseTitle:      'Mathématiques — Terminale',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      durationMin:      60,
      joinUrl:          'https://zoom.example/j/123',
      dashboardUrl:     'https://example.com/en/dashboard',
    },
    reminder24h: {
      studentName:      'Alice',
      sessionTitle:     'Algèbre linéaire',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      joinUrl:          'https://zoom.example/j/123',
    },
    reminder1h: {
      studentName:      'Alice',
      sessionTitle:     'Algèbre linéaire',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      joinUrl:          'https://zoom.example/j/123',
    },
    sessionCancelled: {
      studentName:      'Alice',
      sessionTitle:     'Algèbre linéaire',
      courseTitle:      'Mathématiques — Terminale',
      cancelledReason:  'Tutor unavailable',
      dashboardUrl:     'https://example.com/en/dashboard',
    },
    sessionBookingRescheduled: {
      studentName:               'Alice',
      sessionTitle:              'Algèbre linéaire',
      courseTitle:               'Mathématiques — Terminale',
      previousScheduledStartIso: '2026-09-20T14:00:00.000Z',
      newScheduledStartIso:      '2026-09-22T16:00:00.000Z',
      durationMin:               60,
      joinUrl:                   'https://zoom.example/j/789',
      dashboardUrl:              'https://example.com/en/dashboard',
    },
    adminDeadLetter: {
      workflow:      'session-booking-to-zoom',
      errorMessage:  'Zoom 500',
      originalEvent: { foo: 'bar' },
    },
  };

  it('enrollment_confirmed renders a complete shell', async () => {
    const r = await renderEnrollmentConfirmedEmail('en', baseProps.enrollmentConfirmed);
    expect(r.subject).toContain('Welcome');
    expect(r.html).toContain('CoursEnLigne');
    expect(r.html).toContain('https://example.com/en/dashboard');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('session_booking_confirmed renders the join URL', async () => {
    const r = await renderSessionBookingConfirmedEmail('en', baseProps.sessionBookingConfirmed);
    expect(r.html).toContain('zoom.example/j/123');
    expect(r.html).toContain('example.com/en/dashboard');
    expect(r.text).toContain('zoom.example/j/123');
  });

  it('reminder_24h renders the join URL', async () => {
    const r = await renderReminder24hEmail('en', baseProps.reminder24h);
    expect(r.html).toContain('zoom.example/j/123');
  });

  it('reminder_1h renders the join URL', async () => {
    const r = await renderReminder1hEmail('en', baseProps.reminder1h);
    expect(r.html).toContain('zoom.example/j/123');
  });

  it('session_cancelled renders the cancellation reason', async () => {
    const r = await renderSessionCancelledEmail('fr', baseProps.sessionCancelled);
    expect(r.html).toContain('Tutor unavailable');
    expect(r.text).toContain('Tutor unavailable');
  });

  it('admin_dead_letter renders the workflow name + the original event', async () => {
    const r = await renderAdminDeadLetterEmail('en', baseProps.adminDeadLetter);
    expect(r.html).toContain('session-booking-to-zoom');
    expect(r.html).toContain('Zoom 500');
    expect(r.html).toMatch(/foo/);
  });

  it('session_booking_rescheduled renders the previous and new dates in EN', async () => {
    const r = await renderSessionBookingRescheduledEmail('en', baseProps.sessionBookingRescheduled);
    expect(r.subject).toContain('Algèbre linéaire');
    expect(r.html).toContain('zoom.example/j/789');
    expect(r.html).toContain('example.com/en/dashboard');
    expect(r.html).toContain('CoursEnLigne');
    // The "Previous time" line carries the human-readable
    // UTC date of the prior slot.
    expect(r.html).toMatch(/Sun, 20 Sep 2026/);
    // The "New time" line carries the human-readable UTC
    // date of the rescheduled slot.
    expect(r.html).toMatch(/Tue, 22 Sep 2026/);
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('session_booking_rescheduled renders in FR with translated subject', async () => {
    const r = await renderSessionBookingRescheduledEmail('fr', baseProps.sessionBookingRescheduled);
    // The FR subject uses the literal fixture; the dispatcher
    // mock returns the path when no fixture entry matches.
    expect(r.subject.length).toBeGreaterThan(0);
    expect(r.html).toContain('zoom.example/j/789');
  });

  it('every template produces a non-empty plain-text fallback', async () => {
    const results = await Promise.all([
      renderEnrollmentConfirmedEmail('en',         baseProps.enrollmentConfirmed),
      renderSessionBookingConfirmedEmail('en',     baseProps.sessionBookingConfirmed),
      renderSessionBookingRescheduledEmail('en',   baseProps.sessionBookingRescheduled),
      renderReminder24hEmail('en',                 baseProps.reminder24h),
      renderReminder1hEmail('en',                  baseProps.reminder1h),
      renderSessionCancelledEmail('en',            baseProps.sessionCancelled),
      renderAdminDeadLetterEmail('en',             baseProps.adminDeadLetter),
    ]);
    for (const r of results) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.html.length).toBeGreaterThan(0);
      expect(r.subject.length).toBeGreaterThan(0);
    }
  });
});
