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
import { resetPasswordSchema } from '@/lib/validations/auth';
import { useAuth } from '@/services/auth/use-auth';

type Values = z.infer<typeof resetPasswordSchema>;

/**
 * Reset-password form. The e-mail link delivers a one-time code
 * in the `?code=` query string; we send the user here, they enter
 * a new password, we call `updatePassword`, and we redirect to
 * the dashboard.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const auth = useAuth();
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const code = sp.get('code');

  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(resetPasswordSchema),
  });

  // If the URL carries a one-time code, run verifyOtp first.
  React.useEffect(() => {
    if (!code) return;
    const email = sp.get('email');
    if (!email) return;
    void auth
      .verifyOtp({ email, token: code, type: 'recovery' })
      .catch((err) => setServerError(err instanceof Error ? err.message : 'Lien invalide.'));
    // We intentionally only run this once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: Values) {
    setSubmitting(true);
    setServerError(null);
    try {
      await auth.updatePassword({ password: values.password });
      setDone(true);
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1500);
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
          Mot de passe mis à jour
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous allez être redirigé vers votre espace…
        </p>
        <Link href="/dashboard" className="text-sm text-foreground underline">
          Aller à l’espace
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4" noValidate>
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        Nouveau mot de passe
      </h1>
      <p className="text-sm text-muted-foreground">
        Choisissez un nouveau mot de passe pour votre compte. 10 caractères
        minimum, avec une majuscule, une minuscule et un chiffre.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          {...register('password')}
        />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
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
        {submitting ? 'Mise à jour…' : 'Mettre à jour'}
      </Button>
    </form>
  );
}
