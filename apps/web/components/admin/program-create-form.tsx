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
  adminProgramCreateSchema,
  type AdminProgramCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Create program" form. POSTs
// /api/programs. Mirrors the edit form's UX (RHF + zodResolver
// + `router.refresh()`).
// =====================================================================

export interface ProgramCreateFormProps {
  className?: string;
}

export function ProgramCreateForm({ className }: ProgramCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.programCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdminProgramCreateInput>({
    resolver: zodResolver(adminProgramCreateSchema),
    defaultValues: {
      title: '',
      slug: '',
      description: '',
      sort_order: 0,
      is_published: false,
    },
  });

  async function onSubmit(values: AdminProgramCreateInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setServerError(errBody?.error?.message ?? tForms('saveError'));
        return;
      }
      reset();
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
              <Label htmlFor="program-title-new">{t('fields.title')}</Label>
              <Input id="program-title-new" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="program-slug-new">{t('fields.slug')}</Label>
              <Input id="program-slug-new" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="program-description-new">{t('fields.description')}</Label>
            <Textarea id="program-description-new" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="program-sort-new">{t('fields.sortOrder')}</Label>
              <Input id="program-sort-new" type="number" inputMode="numeric" min="0" {...register('sort_order', { valueAsNumber: true })} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('is_published')} />
                {t('fields.isPublished')}
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting}>
              <Plus className="h-4 w-4" aria-hidden={true} />
              {submitting ? tForms('submitting') : t('submit')}
            </Button>
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">{serverError}</p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
