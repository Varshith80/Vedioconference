import 'server-only';
import type { RenderedEmail, EmailLocale } from './_base';
import { renderEnrollmentConfirmedEmail, type EnrollmentConfirmedProps } from './enrollment-confirmed';
import { renderSessionBookingConfirmedEmail, type SessionBookingConfirmedProps } from './session-booking-confirmed';
import { renderReminder24hEmail, type Reminder24hProps } from './reminder-24h';
import { renderReminder1hEmail, type Reminder1hProps } from './reminder-1h';
import { renderSessionCancelledEmail, type SessionCancelledProps } from './session-cancelled';
import { renderAdminDeadLetterEmail, type AdminDeadLetterProps } from './admin-dead-letter';
import {
  renderMonthlyPaymentFailedEmail,
  type MonthlyPaymentFailedProps,
} from './monthly-payment-failed';
import {
  renderMonthlyPaymentRecoveredEmail,
  type MonthlyPaymentRecoveredProps,
} from './monthly-payment-recovered';
import {
  renderMonthlySuspendedEmail,
  type MonthlySuspendedProps,
} from './monthly-suspended';

/**
 * `lib/email/templates/index.ts` — typed dispatcher. Adding a
 * new template is a content operation: drop the file in this
 * folder, add a branch here, add the i18n keys to
 * `messages/<locale>.json`.
 *
 * Sprint 3.6 §6.1: the v1 names `module_booking_confirmed` and
 * `module_cancelled` are renamed to `session_booking_confirmed`
 * and `session_cancelled` to match the v2 hierarchy. The
 * `enrollment_confirmed` template is kept for the
 * checkout-success email (Stripe + n8n still emit a
 * "your enrollment is active" message even though the
 * underlying row is now a session_grant).
 */

export type EmailTemplateName =
  | 'enrollment_confirmed'
  | 'session_booking_confirmed'
  | 'reminder_24h'
  | 'reminder_1h'
  | 'session_cancelled'
  | 'admin_dead_letter'
  | 'monthly_payment_failed'
  | 'monthly_payment_recovered'
  | 'monthly_suspended';

export type EmailTemplateProps =
  | { name: 'enrollment_confirmed';        props: EnrollmentConfirmedProps }
  | { name: 'session_booking_confirmed';   props: SessionBookingConfirmedProps }
  | { name: 'reminder_24h';                props: Reminder24hProps }
  | { name: 'reminder_1h';                 props: Reminder1hProps }
  | { name: 'session_cancelled';           props: SessionCancelledProps }
  | { name: 'admin_dead_letter';           props: AdminDeadLetterProps }
  | { name: 'monthly_payment_failed';      props: MonthlyPaymentFailedProps }
  | { name: 'monthly_payment_recovered';   props: MonthlyPaymentRecoveredProps }
  | { name: 'monthly_suspended';           props: MonthlySuspendedProps };

export async function renderEmailTemplate(
  locale: EmailLocale,
  template: EmailTemplateProps,
): Promise<RenderedEmail> {
  switch (template.name) {
    case 'enrollment_confirmed':
      return renderEnrollmentConfirmedEmail(locale, template.props);
    case 'session_booking_confirmed':
      return renderSessionBookingConfirmedEmail(locale, template.props);
    case 'reminder_24h':
      return renderReminder24hEmail(locale, template.props);
    case 'reminder_1h':
      return renderReminder1hEmail(locale, template.props);
    case 'session_cancelled':
      return renderSessionCancelledEmail(locale, template.props);
    case 'admin_dead_letter':
      return renderAdminDeadLetterEmail(locale, template.props);
    case 'monthly_payment_failed':
      return renderMonthlyPaymentFailedEmail(locale, template.props);
    case 'monthly_payment_recovered':
      return renderMonthlyPaymentRecoveredEmail(locale, template.props);
    case 'monthly_suspended':
      return renderMonthlySuspendedEmail(locale, template.props);
  }
}
