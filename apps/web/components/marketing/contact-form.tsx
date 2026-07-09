'use client';

import * as React from 'react';
import { useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { makeContactSchema, type ContactInput } from '@/lib/validations/contact';
import { cn } from '@/lib/utils/cn';

/**
 * Contact form. Posts to `/api/contact`. The API uses Zod + a
 * per-IP rate limiter. Errors are rendered inline using the same
 * FormMessage pattern as the rest of the auth forms (Sprint B).
 */
export function ContactForm() {
  const tForm = useTranslations('Contact.form');
  const tApi = useTranslations('ApiErrors');
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const schema = useMemo(() => makeContactSchema(t), [t]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactInput>({
    resolver: zodResolver(schema),
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
          setServerError(body?.error?.message ?? tApi('sendFailed'));
          return;
        }
        setDone(true);
        reset();
        toast.success(tForm('toastSuccess'));
      } catch {
        setServerError(tApi('validation'));
      }
    });
  });

  if (done) {
    return (
      <Alert variant="success" role="status" className="text-left">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle>{tForm('successTitle')}</AlertTitle>
        <AlertDescription>{tForm('successBody')}</AlertDescription>
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
          <AlertTitle>{tApi('sendFailed')}</AlertTitle>
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
          label={tForm('name')}
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
          label={tForm('email')}
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

      <Field id="contact-subject" label={tForm('subject')} error={errors.subject?.message}>
        <Input
          id="contact-subject"
          aria-invalid={Boolean(errors.subject)}
          {...register('subject')}
          className={cn(inputClass(errors.subject?.message))}
        />
      </Field>

      <Field
        id="contact-message"
        label={tForm('message')}
        hint={tForm('messageHint')}
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
        {isPending ? tForm('submitting') : tForm('submit')}
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
