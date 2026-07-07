'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { forgotPasswordSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Values = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else { setDone(true); toast.success('E-mail envoyé.'); }
  }

  if (done) return <p className="max-w-sm text-sm">Si un compte existe pour cette adresse, vous recevrez un lien de réinitialisation.</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Mot de passe oublié</h1>
      <div>
        <label className="block text-sm" htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" className="mt-1 w-full rounded-md border px-3 py-2" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Envoi…' : 'Envoyer le lien'}
      </Button>
    </form>
  );
}
