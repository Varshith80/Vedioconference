import { z } from 'zod';
import { makeEmailSchema } from './auth';

type TLike = (key: string) => string;
const tr = (t: TLike, k: string): string => t(`Validation.contact.${k}`);

/**
 * Public contact form. The factory takes a translator so the error
 * messages follow the active locale. The server-side route handler
 * builds its own translator from `getApiTranslator(req)`.
 */
export function makeContactSchema(t: TLike) {
  return z.object({
    name: z.string().min(2, tr(t, 'nameShort')).max(120),
    email: makeEmailSchema(t),
    subject: z.string().min(3, tr(t, 'subjectShort')).max(160),
    message: z.string().min(20, tr(t, 'messageMin')).max(4000),
    /** Honeypot — must remain empty. */
    website: z.string().max(0).optional().or(z.literal('')),
  });
}

export type ContactInput = z.infer<ReturnType<typeof makeContactSchema>>;
