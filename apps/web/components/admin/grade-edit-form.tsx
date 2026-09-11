'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';
import {
  adminGradeEditSchema,
  type AdminGradeEditInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Edit grade" form. PATCHes /api/grades/[id].
// =====================================================================

export interface GradeEditFormProps {
  gradeId: string;
  initial: {
    program_slug: string;
    slug: string;
    title: string;
    sort_order: number;
  };
  className?: string;
}

export function GradeEditForm({
  gradeId,
  initial,
  className,
}: GradeEditFormProps): React.JSX.Element {
  const t = useTranslations('Admin.gradeEdit');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AdminGradeEditInput>({
    resolver: zodResolver(adminGradeEditSchema),
    defaultValues: { ...initial },
  });

  async function onSubmit(values: AdminGradeEditInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {};
      if (values.title !== undefined && values.title !== initial.title) body.title = values.title;
      if (values.slug !== undefined && values.slug !== initial.slug) body.slug = values.slug;
      if (values.program_slug !== undefined && values.program_slug !== initial.program_slug) {
        body.program_slug = values.program_slug;
      }
      if ((values.sort_order ?? initial.sort_order) !== initial.sort_order) {
        body.sort_order = values.sort_order;
      }
      if (Object.keys(body).length === 0) {
        setSavedAt(Date.now());
        setSubmitting(false);
        return;
      }
      const res = await fetch(`/api/grades/${gradeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setServerError(errBody?.error?.message ?? tForms('saveError'));
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tForms('saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className={cn('max-w-2xl', className)}>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('subline')}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-title">{t('fields.title')}</Label>
              <Input id="grade-title" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-slug">{t('fields.slug')}</Label>
              <Input id="grade-slug" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-program">{t('fields.programSlug')}</Label>
              <Input id="grade-program" {...register('program_slug')} aria-invalid={errors.program_slug ? 'true' : 'false'} />
              {errors.program_slug ? <p className="text-xs text-destructive">{errors.program_slug.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-sort">{t('fields.sortOrder')}</Label>
              <Input id="grade-sort" type="number" inputMode="numeric" min="0" {...register('sort_order', { valueAsNumber: true })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !isDirty}>
              {submitting ? tForms('submitting') : tForms('submit')}
            </Button>
            {savedAt && !serverError ? (
              <p className="text-sm text-muted-foreground" role="status">{t('saved')}</p>
            ) : null}
            {serverError ? (
              <p className="text-sm text-destructive" role="alert">{serverError}</p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
