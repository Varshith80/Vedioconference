'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { registerSchema } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

type Values = z.infer<typeof registerSchema>;

/**
 * Sign-up form. B1 uses the local stub; B2 will swap in the
 * Supabase provider with the same call surface. On success, the
 * user is signed in and redirected to /auth/verify-email so the
 * e-mail confirmation flow can run.
 */
export function RegisterForm() {
  const router = useRouter();
  const auth = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.signUp({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
      });
      router.push('/auth/verify-email');
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
        Créer un compte
      </h1>

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nom complet</Label>
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
          autoComplete="new-password"
          required
          {...register('password')}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
        <p className="text-xs text-muted-foreground">
          10 caractères minimum, avec une majuscule, une minuscule et un chiffre.
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
          J’accepte les{' '}
          <Link href="/legal/cgu" className="underline">
            conditions générales d’utilisation
          </Link>{' '}
          et la{' '}
          <Link href="/legal/privacy" className="underline">
            politique de confidentialité
          </Link>
          .
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
        {submitting ? 'Création…' : 'Créer mon compte'}
      </Button>

      <p className="text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/auth/login" className="text-foreground underline">
          Se connecter
        </Link>
        .
      </p>
    </form>
  );
}
