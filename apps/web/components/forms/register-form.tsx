'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { makeAuthSchemas, type RegisterInput } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

/**
 * Sign-up form. B1 uses the local stub; B2 will swap in the
 * Supabase provider with the same call surface. On success, the
 * user is signed in and redirected to the locale-aware
 * /auth/verify-email page so the e-mail confirmation flow can run.
 */
export function RegisterForm() {
  const router = useRouter();
  const auth = useAuth();
  const locale = useLocale();
  const t = useTranslations();
  const tReg = useTranslations('Auth.register');
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { registerSchema } = useMemo(() => makeAuthSchemas(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(values: RegisterInput) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      router.push(`/${locale}/auth/verify-email`);
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tReg('fallbackError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {tReg('h1')}
      </h1>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">{tReg('fullName')}</Label>
        <Input
          id="fullName"
          type="text"
          autoComplete="name"
          required
          {...register('fullName')}
        />
        {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">{tReg('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">{tReg('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {tReg('passwordHint')}
        </p>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="acceptTerms"
          type="checkbox"
          required
          className="mt-1 h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          {...register('acceptTerms')}
        />
        <Label htmlFor="acceptTerms" className="text-xs text-muted-foreground">
          {tReg.rich('terms', {
            terms: (chunks) => (
              <Link href={`/${locale}/legal/cgu`} className="underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href={`/${locale}/legal/privacy`} className="underline">
                {chunks}
              </Link>
            ),
          })}
        </Label>
      </div>
      {errors.acceptTerms && (
        <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>
      )}

      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? tReg('submitting') : tReg('submit')}
      </Button>

      <p className="text-sm text-muted-foreground">
        {tReg('alreadyHave')}{' '}
        <Link href={`/${locale}/auth/login`} className="text-foreground underline">
          {tReg('signin')}
        </Link>
        .
      </p>
    </form>
  );
}
