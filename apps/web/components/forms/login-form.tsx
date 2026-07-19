'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { makeAuthSchemas, type LoginInput } from '@/lib/validations/auth';
import { loginAction, type LoginActionError } from '@/app/[locale]/auth/login/actions';

/**
 * Sign-in form. The sign-in itself and the post-login redirect
 * are now handled by the `loginAction` Server Action (Sprint
 * 3.7) — the form no longer decides the destination in
 * `useEffect` / `useAuth().getRole()`. The Server Action reads
 * the role on the server, on a single Supabase client that has
 * the just-issued session, and `redirect()`s in a single
 * server-side frame. That eliminates the cookie-write race
 * that used to push the admin to `/dashboard` on the first
 * login after a fresh server start.
 */
export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const locale = useLocale();
  const t = useTranslations();
  const tLogin = useTranslations('Auth.login');
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { loginSchema } = useMemo(() => makeAuthSchemas(t), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: LoginInput) {
    setSubmitting(true);
    setServerError(null);
    try {
      // The Server Action will throw if sign-in fails. On
      // success it calls `redirect()` which navigates the
      // browser; we never reach the next line.
      await loginAction({
        email: values.email,
        password: values.password,
        locale,
        next: sp.get('next'),
      });
      // Defensive: if for any reason the action did NOT throw a
      // redirect (e.g. a future change to return-only on
      // success), refresh the page so the auth state on the
      // server is reflected in the client tree.
      router.refresh();
    } catch (err) {
      // The action throws serialised `LoginActionError` objects
      // for known failures and `NEXT_REDIRECT` sentinels for
      // success. We must let the redirect sentinel through.
      // `next/navigation` exposes `isRedirectError` for exactly
      // this case; we re-throw when the thrown value is a
      // redirect, otherwise we parse the JSON payload.
      const message = err instanceof Error ? err.message : '';
      if (isRedirectLikeError(message)) {
        // Allow the framework to perform the navigation.
        throw err;
      }
      const parsed = parseLoginError(message);
      setServerError(parsed?.message ?? tLogin('fallbackError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {tLogin('h1')}
      </h1>

      <div className="space-y-1.5">
        <Label htmlFor="email">{tLogin('email')}</Label>
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
        <Label htmlFor="password">{tLogin('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {serverError && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? tLogin('submitting') : tLogin('submit')}
      </Button>

      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between sm:gap-0">
        <Link href={`/${locale}/auth/forgot-password`} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {tLogin('forgot')}
        </Link>
        <Link href={`/${locale}/auth/register`} className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {tLogin('create')}
        </Link>
      </div>
    </form>
  );
}

// `next/navigation`'s `redirect()` throws a `NEXT_REDIRECT`
// sentinel whose message starts with `NEXT_REDIRECT;`. We
// detect it by message prefix because the type is internal and
// not exported under a stable name. Anything matching the
// prefix is a navigation that must be re-thrown, not a user
// error to display.
function isRedirectLikeError(message: string): boolean {
  return message.startsWith('NEXT_REDIRECT');
}

function parseLoginError(message: string): LoginActionError | null {
  if (!message) return null;
  try {
    const obj = JSON.parse(message) as Partial<LoginActionError>;
    if (obj && typeof obj === 'object' && typeof obj.message === 'string') {
      return {
        code: obj.code ?? 'unknown',
        message: obj.message,
        field: obj.field,
      };
    }
  } catch {
    // Not JSON — fall through to null.
  }
  return null;
}
