import { z } from 'zod';

/**
 * Translator shape used by the Zod factories in this module.
 * Compatible with the `t` returned by `useTranslations()` (client)
 * and by `getTranslations()` (RSC) — both expose a `(key, values?) => string`
 * signature.
 *
 * The factories in this file are pure: they take a translator and return
 * a Zod schema. Components call them inside `useMemo` keyed on `t` so the
 * schema is rebuilt only when the locale changes.
 */
type TLike = (key: string) => string;

const tr = (t: TLike, k: string): string => t(`Validation.${k}`);

/**
 * Email shape. Always available; the error message is localised.
 */
export function makeEmailSchema(t: TLike) {
  return z.string().email(tr(t, 'emailInvalid'));
}

/**
 * Password shape — 10 characters minimum, mixed case, digit.
 */
export function makePasswordSchema(t: TLike) {
  return z
    .string()
    .min(10, tr(t, 'passwordMin'))
    .regex(/[a-z]/, tr(t, 'passwordLower'))
    .regex(/[A-Z]/, tr(t, 'passwordUpper'))
    .regex(/\d/, tr(t, 'passwordDigit'));
}

export function makeAuthSchemas(t: TLike) {
  const email = makeEmailSchema(t);
  const password = makePasswordSchema(t);
  return {
    emailSchema: email,
    passwordSchema: password,
    registerSchema: z.object({
      fullName: z.string().min(2, tr(t, 'nameShort')).max(120),
      email,
      password,
      acceptTerms: z.literal(true, {
        errorMap: () => ({ message: tr(t, 'terms') }),
      }),
    }),
    loginSchema: z.object({
      email,
      password: z.string().min(1, tr(t, 'loginPasswordRequired')),
    }),
    forgotPasswordSchema: z.object({ email }),
    resetPasswordSchema: z.object({ password }),
  };
}

export type RegisterInput = z.infer<ReturnType<typeof makeAuthSchemas>['registerSchema']>;
export type LoginInput = z.infer<ReturnType<typeof makeAuthSchemas>['loginSchema']>;
export type ForgotPasswordInput = z.infer<
  ReturnType<typeof makeAuthSchemas>['forgotPasswordSchema']
>;
export type ResetPasswordInput = z.infer<
  ReturnType<typeof makeAuthSchemas>['resetPasswordSchema']
>;
