'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

type Values = z.infer<typeof forgotPasswordSchema>;

/**
 * Forgot-password form. On submit, asks the auth provider to send
 * a reset link. We always return the same success message whether
 * the e-mail exists or not (no user enumeration).
 */
export function ForgotPasswordForm() {
  const auth = useAuth();
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.resetPasswordForEmail({
        email: values.email,
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth/reset-password`
            : undefined,
      });
      setDone(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm space-y-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Lien envoyé
        </h1>
        <p className="text-sm text-muted-foreground">
          Si un compte existe pour cette adresse, vous recevrez un lien
          de réinitialisation dans quelques minutes.
        </p>
        <Link
          href="/auth/login"
          className="text-sm text-foreground underline"
        >
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        Mot de passe oublié
      </h1>
      <p className="text-sm text-muted-foreground">
        Entrez l’adresse e-mail de votre compte&nbsp;: nous vous enverrons
        un lien sécurisé pour choisir un nouveau mot de passe.
      </p>
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

      {serverError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Envoi…' : 'Envoyer le lien'}
      </Button>

      <p className="text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-foreground underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
