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
import { useAuth } from '@/services/auth/use-auth';

/**
 * Sign-in form. Uses the auth abstraction (`useAuth()`), so it
 * works the same way against the B1 stub and the future B2
 * Supabase provider. On success, redirects to `?next=` (locale-aware)
 * or to the locale-aware dashboard.
 */
export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const auth = useAuth();
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
      await auth.signInWithPassword(values);

      // Resolve the post-login destination from the signed-in
      // user's `public.profiles.role`. The session itself
      // (auth.users) does not carry the application role — the
      // profile row is the source of truth (CLAUDE.md §3.9 +
      // Sprint 3.6 §4.1). Without this lookup, admins would
      // fall through to the student dashboard.
      //
      // Role mapping (matches the `public.user_role` enum):
      //   admin / super_admin -> /<locale>/admin
      //   student (default)   -> /<locale>/dashboard
      let role: 'student' | 'admin' | 'super_admin' | null = null;
      try {
        role = await auth.getRole();
      } catch {
        // If the role lookup fails (e.g. the profile row has not
        // been provisioned yet for a brand-new signup), fall
        // through to the safe default of `/dashboard`. The
        // session itself succeeded; we just couldn't resolve
        // the role to decide on a more specific landing page.
        role = null;
      }
      const isAdmin = role === 'admin' || role === 'super_admin';
      // A `?next=` query param (set by `?error=forbidden` redirect
      // links from /admin etc.) still wins when present, as long
      // as it stays inside the current locale. This preserves the
      // pre-fix behaviour for the "you must sign in to view this
      // page" UX.
      const next = sp.get('next');
      const safeNext = next && next.startsWith(`/${locale}`) ? next : null;
      const dest =
        safeNext ??
        (isAdmin ? `/${locale}/admin` : `/${locale}/dashboard`);
      router.push(dest);
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tLogin('fallbackError'));
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
