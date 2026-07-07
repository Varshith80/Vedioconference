import { z } from 'zod';

export const emailSchema    = z.string().email('Adresse e-mail invalide.');
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères.')
  .regex(/[a-z]/, 'Le mot de passe doit contenir une minuscule.')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir une majuscule.')
  .regex(/\d/,   'Le mot de passe doit contenir un chiffre.');

export const registerSchema = z.object({
  fullName: z.string().min(2, 'Le nom est trop court.').max(120),
  email:    emailSchema,
  password: passwordSchema,
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Vous devez accepter les CGU.' }) }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email:    emailSchema,
  password: z.string().min(1, 'Mot de passe requis.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema  = z.object({ password: passwordSchema });
