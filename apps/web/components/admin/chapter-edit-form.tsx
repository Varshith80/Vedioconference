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
  adminChapterEditSchema,
  type AdminChapterEditInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Edit chapter" form. PATCHes
// /api/chapters/[id]. Mirrors the diff-and-patch pattern from
// the existing program/grade/course edit forms.
// =====================================================================

export interface ChapterEditFormProps {
  chapterId: string;
  initial: {
    slug: string;
    title: string;
    description: string | null;
    default_duration_min: number | null;
    position: number;
    is_published: boolean;
  };
  className?: string;
}

export function ChapterEditForm({
  chapterId,
  initial,
  className,
}: ChapterEditFormProps): React.JSX.Element {
  const t = useTranslations('Admin.chapterEdit');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<AdminChapterEditInput>({
    resolver: zodResolver(adminChapterEditSchema),
    defaultValues: {
      slug: initial.slug,
      title: initial.title,
      description: initial.description ?? '',
      default_duration_min: initial.default_duration_min,
      position: initial.position,
      is_published: initial.is_published,
    },
  });

  async function onSubmit(values: AdminChapterEditInput): Promise<void> {
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
      const newDuration = values.default_duration_min ?? null;
      if (newDuration !== initial.default_duration_min) {
        body.default_duration_min = newDuration;
      }
      if ((values.position ?? initial.position) !== initial.position) {
        body.position = values.position;
      }
      if (values.is_published !== undefined && values.is_published !== initial.is_published) {
        body.is_published = values.is_published;
      }

      if (Object.keys(body).length === 0) {
        setSavedAt(Date.now());
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/chapters/${chapterId}`, {
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
              <Label htmlFor="chapter-title">{t('fields.title')}</Label>
              <Input id="chapter-title" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="chapter-slug">{t('fields.slug')}</Label>
              <Input id="chapter-slug" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="chapter-description">{t('fields.description')}</Label>
            <Textarea id="chapter-description" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="chapter-position">{t('fields.position')}</Label>
              <Input
                id="chapter-position"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                {...register('position', { valueAsNumber: true })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="chapter-duration">{t('fields.durationMin')}</Label>
              <Input
                id="chapter-duration"
                type="number"
                inputMode="numeric"
                min="0"
                {...register('default_duration_min', { valueAsNumber: true })}
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
