'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { registerSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';

type Values = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(registerSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { full_name: values.fullName } },
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    if (data.session) { router.push('/dashboard'); router.refresh(); }
    else toast.success('Vérifiez votre boîte mail pour confirmer votre compte.');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Créer un compte</h1>

      <div>
        <label className="block text-sm" htmlFor="fullName">Nom complet</label>
        <input id="fullName" className="mt-1 w-full rounded-md border px-3 py-2" {...register('fullName')} />
        {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>}
      </div>
      <div>
        <label className="block text-sm" htmlFor="email">E-mail</label>
        <input id="email" type="email" autoComplete="email" className="mt-1 w-full rounded-md border px-3 py-2" {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <div>
        <label className="block text-sm" htmlFor="password">Mot de passe</label>
        <input id="password" type="password" autoComplete="new-password" className="mt-1 w-full rounded-md border px-3 py-2" {...register('password')} />
        {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('acceptTerms')} /> J'accepte les CGU et la politique de confidentialité.
      </label>
      {errors.acceptTerms && <p className="text-xs text-destructive">{errors.acceptTerms.message}</p>}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Création…' : 'Créer mon compte'}
      </Button>

      <p className="text-sm">Déjà inscrit·e ? <Link href="/auth/login" className="underline">Se connecter</Link></p>
    </form>
  );
}
