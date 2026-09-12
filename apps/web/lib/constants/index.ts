export const APP_NAME = 'CoursEnLigne';
export const APP_DESCRIPTION =
  'Plateforme de cours particuliers en ligne, mathématiques et physique-chimie, du lycée à la licence.';

export const SUPPORT_EMAIL = 'support@coursenligne.fr';
export const SUPPORT_PHONE = '+33 1 23 45 67 89';

// Sprint 10 — I-1: hard-coded admin recipient for the booking-
// path admin-* email templates. n8n is the orchestrator, but
// the Next.js renderer is the security boundary: the request
// body's `to` field is IGNORED for the admin_* templates and
// the recipient is THIS constant, never a request-supplied
// address. Edit this file (not `.env`, not `.env.example`) if
// the operator needs to change the admin recipient.
export const ADMIN_NOTIFY_EMAIL = 'admin@coursenligne.fr';

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

export {
  BRAND,
  BRAND_COLORS,
  BRAND_FONTS,
} from './brand';
export type { LearningPathId } from './brand';
