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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils/cn';
import {
  adminCourseEditSchema,
  type AdminCourseEditInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Edit course" form. PATCHes /api/courses/[id].
// Mirrors the diff-and-patch + `router.refresh()` pattern from
// the existing program/grade edit forms.
// =====================================================================

export interface ProgramOption {
  value: string; // slug
  label: string; // title
}

export interface GradeOption {
  value: string; // slug
  label: string; // title
  programSlug: string;
}

export interface CourseEditFormProps {
  courseId: string;
  initial: {
    title: string;
    slug: string;
    subtitle: string | null;
    description: string | null;
    program_slug: string;
    grade_slug: string | null;
    is_published: boolean;
  };
  programs: ReadonlyArray<ProgramOption>;
  grades: ReadonlyArray<GradeOption>;
  className?: string;
}

export function CourseEditForm({
  courseId,
  initial,
  programs,
  grades,
  className,
}: CourseEditFormProps): React.JSX.Element {
  const t = useTranslations('Admin.courseEdit');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [programSlug, setProgramSlug] = React.useState<string>(initial.program_slug);
  const [gradeSlug, setGradeSlug] = React.useState<string | null>(initial.grade_slug);

  const gradeOptions = React.useMemo(
    () => grades.filter((g) => g.programSlug === programSlug),
    [grades, programSlug],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Omit<AdminCourseEditInput, 'program_slug' | 'grade_slug'>>({
    resolver: zodResolver(adminCourseEditSchema.omit({ program_slug: true, grade_slug: true })),
    defaultValues: {
      title: initial.title,
      slug: initial.slug,
      subtitle: initial.subtitle ?? '',
      description: initial.description ?? '',
      is_published: initial.is_published,
    },
  });

  async function onSubmit(
    values: Omit<AdminCourseEditInput, 'program_slug' | 'grade_slug'>,
  ): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {};
      if (values.title !== undefined && values.title !== initial.title) body.title = values.title;
      if (values.slug !== undefined && values.slug !== initial.slug) body.slug = values.slug;
      const sub = values.subtitle ?? '';
      if (sub !== (initial.subtitle ?? '')) {
        body.subtitle = sub === '' ? null : sub;
      }
      const desc = values.description ?? '';
      if (desc !== (initial.description ?? '')) {
        body.description = desc === '' ? null : desc;
      }
      if (programSlug !== initial.program_slug) body.program_slug = programSlug;
      if ((gradeSlug ?? null) !== (initial.grade_slug ?? null)) {
        body.grade_slug = gradeSlug; // null to clear
      }
      if (values.is_published !== undefined && values.is_published !== initial.is_published) {
        body.is_published = values.is_published;
      }

      if (Object.keys(body).length === 0) {
        setSavedAt(Date.now());
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/admin/courses/${courseId}`, {
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
              <Label htmlFor="course-program">{t('fields.program')}</Label>
              <SearchableSelect
                id="course-program"
                aria-label={t('fields.program')}
                options={programs}
                value={programSlug}
                onChange={(v) => {
                  if (!v) return;
                  setProgramSlug(v);
                  if (gradeSlug) {
                    const stillValid = grades.some(
                      (g) => g.value === gradeSlug && g.programSlug === v,
                    );
                    if (!stillValid) setGradeSlug(null);
                  }
                }}
                placeholder={t('placeholders.program')}
                emptyMessage={t('empty.programs')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="course-grade">{t('fields.grade')}</Label>
              <SearchableSelect
                id="course-grade"
                aria-label={t('fields.grade')}
                options={gradeOptions}
                value={gradeSlug}
                onChange={setGradeSlug}
                placeholder={t('placeholders.grade')}
                emptyMessage={t('empty.grades')}
                clearable
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="course-title">{t('fields.title')}</Label>
              <Input id="course-title" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="course-slug">{t('fields.slug')}</Label>
              <Input id="course-slug" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="course-subtitle">{t('fields.subtitle')}</Label>
            <Input id="course-subtitle" {...register('subtitle')} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="course-description">{t('fields.description')}</Label>
            <Textarea id="course-description" rows={3} {...register('description')} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('is_published')} />
            {t('fields.isPublished')}
          </label>

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
