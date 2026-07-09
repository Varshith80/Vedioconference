'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

type Values = z.infer<typeof loginSchema>;

/**
 * Sign-in form. Uses the auth abstraction (`useAuth()`), so it
 * works the same way against the B1 stub and the future B2
 * Supabase provider. On success, redirects to `?next=` or to
 * the dashboard.
 */
export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const auth = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.signInWithPassword(values);
      router.push(sp.get('next') ?? '/dashboard');
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        Connexion
      </h1>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
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
        <Label htmlFor="password">Mot de passe</Label>
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
        {submitting ? 'Connexion…' : 'Se connecter'}
      </Button>

      <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between sm:gap-0">
        <Link href="/auth/forgot-password" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Mot de passe oublié
        </Link>
        <Link href="/auth/register" className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Créer un compte
        </Link>
      </div>
    </form>
  );
}
