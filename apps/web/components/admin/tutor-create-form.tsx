'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  adminTutorCreateSchema,
  type AdminTutorCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Create tutor" form. POSTs /api/admin/tutors.
//
// Tutors are now standalone reference records. The form carries
// only the fields needed for session assignment and for the
// Admin to know who to send Zoom meeting details to:
//   full_name, email, phone, status, notes.
//
// There is NO auth flow, NO tutor-side UI, NO profile, NO
// headline/bio/years_experience/zoom_user_id/calendly fields.
// =====================================================================

export interface TutorCreateFormProps {
  className?: string;
}

export function TutorCreateForm({ className }: TutorCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.tutorCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdminTutorCreateInput>({
    resolver: zodResolver(adminTutorCreateSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      status: 'active',
      notes: '',
    },
  });

  async function onSubmit(values: AdminTutorCreateInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      // Strip empty optional fields so the API does not receive
      // "" where it expects null / undefined. Zod's `.optional()`
      // accepts undefined; empty strings would 400.
      const payload: Record<string, unknown> = {
        full_name: values.full_name,
        email: values.email,
        status: values.status ?? 'active',
      };
      if (values.phone && values.phone.length > 0) payload['phone'] = values.phone;
      if (values.notes && values.notes.length > 0) payload['notes'] = values.notes;

      const res = await fetch('/api/admin/tutors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setServerError(errBody?.error?.message ?? tForms('saveError'));
        return;
      }
      reset({
        full_name: '',
        email: '',
        phone: '',
        status: 'active',
        notes: '',
      });
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tForms('saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subline')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="tutor-name-new">{t('fields.fullName')}</Label>
              <Input
                id="tutor-name-new"
                {...register('full_name')}
                aria-invalid={errors.full_name ? 'true' : 'false'}
              />
              {errors.full_name ? (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="tutor-email-new">{t('fields.email')}</Label>
              <Input
                id="tutor-email-new"
                type="email"
                {...register('email')}
                aria-invalid={errors.email ? 'true' : 'false'}
              />
              {errors.email ? (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="tutor-phone-new">{t('fields.phone')}</Label>
              <Input
                id="tutor-phone-new"
                type="tel"
                {...register('phone')}
                placeholder={t('placeholders.phone')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="tutor-status-new">{t('fields.status')}</Label>
              <select
                id="tutor-status-new"
                {...register('status')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                defaultValue="active"
              >
                <option value="active">{t('statusOptions.active')}</option>
                <option value="inactive">{t('statusOptions.inactive')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="tutor-notes-new">{t('fields.notes')}</Label>
            <Textarea id="tutor-notes-new" rows={3} {...register('notes')} />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden={true} />
              {submitting ? tForms('submitting') : t('submit')}
            </Button>
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">
                {serverError}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
