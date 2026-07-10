import 'server-only';
import type { RenderedEmail, EmailLocale } from './_base';
import { renderEnrollmentConfirmedEmail, type EnrollmentConfirmedProps } from './enrollment-confirmed';
import { renderModuleBookingConfirmedEmail, type ModuleBookingConfirmedProps } from './module-booking-confirmed';
import { renderReminder24hEmail, type Reminder24hProps } from './reminder-24h';
import { renderReminder1hEmail, type Reminder1hProps } from './reminder-1h';
import { renderModuleCancelledEmail, type ModuleCancelledProps } from './module-cancelled';
import { renderAdminDeadLetterEmail, type AdminDeadLetterProps } from './admin-dead-letter';

/**
 * `lib/email/templates/index.ts` — typed dispatcher. Adding a
 * new template is a content operation: drop the file in this
 * folder, add a branch here, add the i18n keys to
 * `messages/<locale>.json`.
 */

export type EmailTemplateName =
  | 'enrollment_confirmed'
  | 'module_booking_confirmed'
  | 'reminder_24h'
  | 'reminder_1h'
  | 'module_cancelled'
  | 'admin_dead_letter';

export type EmailTemplateProps =
  | { name: 'enrollment_confirmed';        props: EnrollmentConfirmedProps }
  | { name: 'module_booking_confirmed';   props: ModuleBookingConfirmedProps }
  | { name: 'reminder_24h';               props: Reminder24hProps }
  | { name: 'reminder_1h';                props: Reminder1hProps }
  | { name: 'module_cancelled';           props: ModuleCancelledProps }
  | { name: 'admin_dead_letter';          props: AdminDeadLetterProps };

export async function renderEmailTemplate(
  locale: EmailLocale,
  template: EmailTemplateProps,
): Promise<RenderedEmail> {
  switch (template.name) {
    case 'enrollment_confirmed':
      return renderEnrollmentConfirmedEmail(locale, template.props);
    case 'module_booking_confirmed':
      return renderModuleBookingConfirmedEmail(locale, template.props);
    case 'reminder_24h':
      return renderReminder24hEmail(locale, template.props);
    case 'reminder_1h':
      return renderReminder1hEmail(locale, template.props);
    case 'module_cancelled':
      return renderModuleCancelledEmail(locale, template.props);
    case 'admin_dead_letter':
      return renderAdminDeadLetterEmail(locale, template.props);
  }
}
