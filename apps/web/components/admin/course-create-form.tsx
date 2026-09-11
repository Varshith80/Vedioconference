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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  adminCourseCreateSchema,
  type AdminCourseCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Create course" form. POSTs /api/courses.
// The parent program is picked via `SearchableSelect`; the
// optional parent grade is also a `SearchableSelect` filtered
// by the chosen program. Both lists are populated by the
// page (server component).
// =====================================================================

export interface ProgramOption {
  value: string; // slug
  label: string; // title
}

export interface GradeOption {
  value: string; // slug
  label: string; // title
  programSlug: string; // the parent program's slug
}

export interface CourseCreateFormProps {
  programs: ReadonlyArray<ProgramOption>;
  grades: ReadonlyArray<GradeOption>;
  defaultProgramSlug?: string;
  className?: string;
}

export function CourseCreateForm({
  programs,
  grades,
  defaultProgramSlug,
  className,
}: CourseCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.courseCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [programSlug, setProgramSlug] = React.useState<string | null>(
    defaultProgramSlug ?? programs[0]?.value ?? null,
  );
  const [gradeSlug, setGradeSlug] = React.useState<string | null>(null);

  const gradeOptions = React.useMemo(
    () => grades.filter((g) => !programSlug || g.programSlug === programSlug),
    [grades, programSlug],
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<AdminCourseCreateInput, 'program_slug' | 'grade_slug'>>({
    resolver: zodResolver(
      adminCourseCreateSchema.omit({ program_slug: true, grade_slug: true }),
    ),
    defaultValues: { title: '', slug: '', subtitle: '', description: '', is_published: false },
  });

  async function onSubmit(
    values: Omit<AdminCourseCreateInput, 'program_slug' | 'grade_slug'>,
  ): Promise<void> {
    if (!programSlug) {
      setServerError(t('errors.programRequired'));
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = { ...values, program_slug: programSlug };
      if (gradeSlug) body.grade_slug = gradeSlug;
      const res = await fetch('/api/courses', {
        method: 'POST',
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
      reset({ title: '', slug: '', subtitle: '', description: '', is_published: false });
      setGradeSlug(null);
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
              <Label htmlFor="course-program-new">{t('fields.program')}</Label>
              <SearchableSelect
                id="course-program-new"
                aria-label={t('fields.program')}
                options={programs}
                value={programSlug}
                onChange={(v) => {
                  setProgramSlug(v);
                  // Reset the grade if it doesn't belong to the new program.
                  if (v && gradeSlug) {
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
              <Label htmlFor="course-grade-new">{t('fields.grade')}</Label>
              <SearchableSelect
                id="course-grade-new"
                aria-label={t('fields.grade')}
                options={gradeOptions}
                value={gradeSlug}
                onChange={setGradeSlug}
                placeholder={t('placeholders.grade')}
                emptyMessage={t('empty.grades')}
                disabled={!programSlug}
                clearable
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="course-title-new">{t('fields.title')}</Label>
              <Input id="course-title-new" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="course-slug-new">{t('fields.slug')}</Label>
              <Input id="course-slug-new" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="course-subtitle-new">{t('fields.subtitle')}</Label>
            <Input id="course-subtitle-new" {...register('subtitle')} />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="course-description-new">{t('fields.description')}</Label>
            <Textarea id="course-description-new" rows={3} {...register('description')} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('is_published')} />
            {t('fields.isPublished')}
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !programSlug}>
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
