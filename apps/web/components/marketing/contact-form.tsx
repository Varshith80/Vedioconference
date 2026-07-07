'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { contactSchema } from '@/lib/validations/contact';
import { cn } from '@/lib/utils/cn';

type Values = z.infer<typeof contactSchema>;

/**
 * Contact form. Posts to `/api/contact`. The API uses Zod + a
 * per-IP rate limiter. Errors are rendered inline using the same
 * FormMessage pattern as the rest of the auth forms (Sprint B).
 */
export function ContactForm() {
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<Values>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', subject: '', message: '', website: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(values),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          setServerError(body?.error?.message ?? 'Impossible d’envoyer le message.');
          return;
        }
        setDone(true);
        reset();
        toast.success('Message envoyé. Nous revenons vers vous sous 24h.');
      } catch {
        setServerError('Erreur réseau. Veuillez réessayer.');
      }
    });
  });

  if (done) {
    return (
      <Alert variant="success" role="status" className="text-left">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>Message envoyé</AlertTitle>
        <AlertDescription>
          Merci, nous vous répondons sous 24 heures ouvrées.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-5"
      aria-describedby={serverError ? 'contact-error' : undefined}
    >
      {serverError && (
        <Alert variant="destructive" id="contact-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Envoi impossible</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      {/* Honeypot — visually hidden, ignored by humans, traps bots. */}
      <div aria-hidden="true" className="hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="contact-name"
          label="Nom complet"
          error={errors.name?.message}
        >
          <Input
            id="contact-name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            {...register('name')}
            className={cn(inputClass(errors.name?.message))}
          />
        </Field>

        <Field
          id="contact-email"
          label="E-mail"
          error={errors.email?.message}
        >
          <Input
            id="contact-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...register('email')}
            className={cn(inputClass(errors.email?.message))}
          />
        </Field>
      </div>

      <Field id="contact-subject" label="Sujet" error={errors.subject?.message}>
        <Input
          id="contact-subject"
          aria-invalid={Boolean(errors.subject)}
          {...register('subject')}
          className={cn(inputClass(errors.subject?.message))}
        />
      </Field>

      <Field
        id="contact-message"
        label="Message"
        hint="Décrivez votre besoin en quelques lignes (20 caractères minimum)."
        error={errors.message?.message}
      >
        <Textarea
          id="contact-message"
          rows={6}
          aria-invalid={Boolean(errors.message)}
          {...register('message')}
          className={cn(inputClass(errors.message?.message))}
        />
      </Field>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? 'Envoi en cours…' : 'Envoyer le message'}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(hasError: string | undefined): string {
  return hasError ? 'border-destructive focus-visible:ring-destructive' : '';
}
