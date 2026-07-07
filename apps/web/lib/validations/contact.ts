import { z } from 'zod';
import { emailSchema } from './auth';

/** Public contact form. Validated on both client and server. */
export const contactSchema = z.object({
  name: z.string().min(2, 'Le nom est trop court.').max(120),
  email: emailSchema,
  subject: z.string().min(3, 'Le sujet est trop court.').max(160),
  message: z.string().min(20, 'Le message doit contenir au moins 20 caractères.').max(4000),
  /** Honeypot — must remain empty. */
  website: z.string().max(0).optional().or(z.literal('')),
});
export type ContactInput = z.infer<typeof contactSchema>;
