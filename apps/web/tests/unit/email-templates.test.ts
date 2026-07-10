import { describe, it, expect, vi } from 'vitest';

// next-intl/server's getTranslations pulls in heavy next-intl
// init logic. For these pure render tests we stub the
// translations function with a flat key-returning helper.
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async ({ namespace }: { namespace: string }) => {
    const fixture: Record<string, string> = {
      'Emails.enrollmentConfirmed.subject':       'Welcome to {courseTitle}',
      'Emails.moduleBookingConfirmed.subject':   'Session confirmed — {moduleTitle}',
      'Emails.reminder24h.subject':              'Reminder — {moduleTitle} tomorrow',
      'Emails.reminder1h.subject':               'Starting soon — {moduleTitle}',
      'Emails.moduleCancelled.subject':          'Session cancelled — {moduleTitle}',
      'Emails.adminDeadLetter.subject':          '[n8n] {workflow} failed',
    };
    return (key: string, vars?: Record<string, unknown>) => {
      const full = `${namespace}.${key}`;
      // Subject-style keys can take ICU vars. Use the fixture
      // when present, otherwise return the key unchanged so
      // tests assert *structure* (e.g. "contains the join URL")
      // rather than a snapshot of the translation copy.
      const template = fixture[full] ?? full;
      if (vars && 'courseTitle' in vars) return template.replace('{courseTitle}', String(vars.courseTitle));
      if (vars && 'moduleTitle' in vars) return template.replace('{moduleTitle}', String(vars.moduleTitle));
      if (vars && 'workflow'   in vars) return template.replace('{workflow}',   String(vars.workflow));
      if (vars && 'name'       in vars) return template.replace('{name}',       String(vars.name));
      return template;
    };
  }),
}));

import { renderEnrollmentConfirmedEmail } from '@/lib/email/templates/enrollment-confirmed';
import { renderModuleBookingConfirmedEmail } from '@/lib/email/templates/module-booking-confirmed';
import { renderReminder24hEmail } from '@/lib/email/templates/reminder-24h';
import { renderReminder1hEmail } from '@/lib/email/templates/reminder-1h';
import { renderModuleCancelledEmail } from '@/lib/email/templates/module-cancelled';
import { renderAdminDeadLetterEmail } from '@/lib/email/templates/admin-dead-letter';

describe('email templates', () => {
  const baseProps = {
    enrollmentConfirmed: {
      studentName:  'Alice',
      courseTitle:  'Mathématiques — Terminale',
      courseSlug:   'mathematiques-terminale',
      dashboardUrl: 'https://example.com/en/dashboard',
    },
    moduleBookingConfirmed: {
      studentName:      'Alice',
      moduleTitle:      'Algèbre linéaire',
      courseTitle:      'Mathématiques — Terminale',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      durationMin:      60,
      joinUrl:          'https://zoom.example/j/123',
      dashboardUrl:     'https://example.com/en/dashboard',
    },
    reminder24h: {
      studentName:      'Alice',
      moduleTitle:      'Algèbre linéaire',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      joinUrl:          'https://zoom.example/j/123',
    },
    reminder1h: {
      studentName:      'Alice',
      moduleTitle:      'Algèbre linéaire',
      scheduledStartIso: '2026-08-01T14:00:00.000Z',
      joinUrl:          'https://zoom.example/j/123',
    },
    moduleCancelled: {
      studentName:      'Alice',
      moduleTitle:      'Algèbre linéaire',
      courseTitle:      'Mathématiques — Terminale',
      cancelledReason:  'Tutor unavailable',
      dashboardUrl:     'https://example.com/en/dashboard',
    },
    adminDeadLetter: {
      workflow:      'module-booking-to-zoom',
      errorMessage:  'Zoom 500',
      originalEvent: { foo: 'bar' },
    },
  };

  it('enrollment_confirmed renders a complete shell', async () => {
    const r = await renderEnrollmentConfirmedEmail('en', baseProps.enrollmentConfirmed);
    expect(r.subject).toContain('Welcome');
    expect(r.html).toContain('Intégrale');
    expect(r.html).toContain('https://example.com/en/dashboard');
    expect(r.text.length).toBeGreaterThan(0);
  });

  it('module_booking_confirmed renders the join URL', async () => {
    const r = await renderModuleBookingConfirmedEmail('en', baseProps.moduleBookingConfirmed);
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

  it('module_cancelled renders the cancellation reason', async () => {
    const r = await renderModuleCancelledEmail('fr', baseProps.moduleCancelled);
    expect(r.html).toContain('Tutor unavailable');
    expect(r.text).toContain('Tutor unavailable');
  });

  it('admin_dead_letter renders the workflow name + the original event', async () => {
    const r = await renderAdminDeadLetterEmail('en', baseProps.adminDeadLetter);
    expect(r.html).toContain('module-booking-to-zoom');
    expect(r.html).toContain('Zoom 500');
    expect(r.html).toMatch(/foo/);
  });

  it('every template produces a non-empty plain-text fallback', async () => {
    const results = await Promise.all([
      renderEnrollmentConfirmedEmail('en',    baseProps.enrollmentConfirmed),
      renderModuleBookingConfirmedEmail('en', baseProps.moduleBookingConfirmed),
      renderReminder24hEmail('en',            baseProps.reminder24h),
      renderReminder1hEmail('en',             baseProps.reminder1h),
      renderModuleCancelledEmail('en',        baseProps.moduleCancelled),
      renderAdminDeadLetterEmail('en',        baseProps.adminDeadLetter),
    ]);
    for (const r of results) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.html.length).toBeGreaterThan(0);
      expect(r.subject.length).toBeGreaterThan(0);
    }
  });
});
