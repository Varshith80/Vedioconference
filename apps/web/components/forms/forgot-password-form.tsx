'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { makeAuthSchemas, type ForgotPasswordInput } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

/**
 * Forgot-password form. On submit, asks the auth provider to send
 * a reset link. We always return the same success message whether
 * the e-mail exists or not (no user enumeration).
 */
export function ForgotPasswordForm() {
  const auth = useAuth();
  const locale = useLocale();
  const t = useTranslations();
  const tFp = useTranslations('Auth.forgotPassword');
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { forgotPasswordSchema } = useMemo(() => makeAuthSchemas(t), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.resetPasswordForEmail({
        email: values.email,
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/${locale}/auth/reset-password`
            : undefined,
      });
      setDone(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tFp('fallbackError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {tFp('sentTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {tFp('sentBody')}
        </p>
        <Link
          href={`/${locale}/auth/login`}
          className="text-sm text-foreground underline"
        >
          {tFp('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {tFp('h1')}
      </h1>
      <p className="text-sm text-muted-foreground">
        {tFp('intro')}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="email">{tFp('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? tFp('submitting') : tFp('submit')}
      </Button>

      <p className="text-sm text-muted-foreground">
        <Link href={`/${locale}/auth/login`} className="text-foreground underline">
          {tFp('backToLogin')}
        </Link>
      </p>
    </form>
  );
}
