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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils/cn';
import {
  adminProgramEditSchema,
  type AdminProgramEditInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Edit program" form. PATCHes
// /api/programs/[id]. Mirrors `SessionEditForm`'s
// diff-and-patch + `router.refresh()` pattern (Sprint 3.6 §4.5).
// =====================================================================

export interface ProgramEditFormProps {
  programId: string;
  initial: {
    title: string;
    slug: string;
    description: string | null;
    sort_order: number;
    is_published: boolean;
  };
  className?: string;
}

export function ProgramEditForm({
  programId,
  initial,
  className,
}: ProgramEditFormProps): React.JSX.Element {
  const t = useTranslations('Admin.programEdit');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AdminProgramEditInput>({
    resolver: zodResolver(adminProgramEditSchema),
    defaultValues: {
      title: initial.title,
      slug: initial.slug,
      description: initial.description ?? '',
      sort_order: initial.sort_order,
      is_published: initial.is_published,
    },
  });

  async function onSubmit(values: AdminProgramEditInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {};
      if (values.title !== undefined && values.title !== initial.title) body.title = values.title;
      if (values.slug !== undefined && values.slug !== initial.slug) body.slug = values.slug;
      const desc = values.description ?? '';
      if (desc !== (initial.description ?? '')) {
        body.description = desc === '' ? null : desc;
      }
      if ((values.sort_order ?? initial.sort_order) !== initial.sort_order) {
        body.sort_order = values.sort_order;
      }
      if (values.is_published !== undefined && values.is_published !== initial.is_published) {
        body.is_published = values.is_published;
      }

      if (Object.keys(body).length === 0) {
        setSavedAt(Date.now());
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/programs/${programId}`, {
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
              <Label htmlFor="program-title">{t('fields.title')}</Label>
              <Input id="program-title" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="program-slug">{t('fields.slug')}</Label>
              <Input
                id="program-slug"
                {...register('slug')}
                aria-invalid={errors.slug ? 'true' : 'false'}
              />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="program-description">{t('fields.description')}</Label>
            <Textarea id="program-description" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="program-sort">{t('fields.sortOrder')}</Label>
              <Input
                id="program-sort"
                type="number"
                inputMode="numeric"
                min="0"
                {...register('sort_order', { valueAsNumber: true })}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('is_published')} />
                {t('fields.isPublished')}
              </label>
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
