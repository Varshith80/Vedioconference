'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { loginSchema } from '@/lib/validations/auth';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';

type Values = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Connexion réussie.');
    router.push(sp.get('next') ?? '/dashboard');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="w-full max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Connexion</h1>

      <div>
        <label htmlFor="email" className="block text-sm">E-mail</label>
        <input id="email" type="email" autoComplete="email" required
               className="mt-1 w-full rounded-md border px-3 py-2"
               {...register('email')} />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm">Mot de passe</label>
        <input id="password" type="password" autoComplete="current-password" required
               className="mt-1 w-full rounded-md border px-3 py-2"
               {...register('password')} />
        {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>}
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? 'Connexion…' : 'Se connecter'}
      </Button>

      <div className="flex justify-between text-sm">
        <Link href="/auth/forgot-password" className="underline">Mot de passe oublié</Link>
        <Link href="/auth/register" className="underline">Créer un compte</Link>
      </div>
    </form>
  );
}
