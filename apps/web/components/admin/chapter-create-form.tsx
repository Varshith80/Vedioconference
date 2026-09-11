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
  adminChapterCreateSchema,
  type AdminChapterCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Create chapter" form. POSTs /api/chapters.
// The parent course is picked via `SearchableSelect`.
// =====================================================================

export interface CourseOption {
  value: string; // slug
  label: string; // title
}

export interface ChapterCreateFormProps {
  courses: ReadonlyArray<CourseOption>;
  defaultCourseSlug?: string;
  className?: string;
}

export function ChapterCreateForm({
  courses,
  defaultCourseSlug,
  className,
}: ChapterCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.chapterCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [courseSlug, setCourseSlug] = React.useState<string | null>(
    defaultCourseSlug ?? courses[0]?.value ?? null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<AdminChapterCreateInput, 'course_slug'>>({
    resolver: zodResolver(adminChapterCreateSchema.omit({ course_slug: true })),
    defaultValues: {
      slug: '',
      title: '',
      description: '',
      default_duration_min: 60,
      is_published: false,
      // `position` is server-defaulted to
      // getNextChapterPosition() when omitted. The admin can
      // override by typing a value here; a duplicate surfaces
      // as 409 from POST /api/chapters.
    },
  });

  async function onSubmit(
    values: Omit<AdminChapterCreateInput, 'course_slug'>,
  ): Promise<void> {
    if (!courseSlug) {
      setServerError(t('errors.courseRequired'));
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      // Strip empty optional fields so the server can apply
      // its default (getNextChapterPosition). React Hook
      // Form leaves `position` as `undefined` when the
      // input is not registered, which is what we want.
      const body: Record<string, unknown> = { ...values, course_slug: courseSlug };
      if (body.position === undefined || body.position === null) {
        delete body.position;
      }
      const res = await fetch('/api/chapters', {
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
      reset({
        slug: '',
        title: '',
        description: '',
        default_duration_min: 60,
        is_published: false,
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="chapter-course-new">{t('fields.course')}</Label>
            <SearchableSelect
              id="chapter-course-new"
              aria-label={t('fields.course')}
              options={courses}
              value={courseSlug}
              onChange={setCourseSlug}
              placeholder={t('placeholders.course')}
              emptyMessage={t('empty.courses')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="chapter-title-new">{t('fields.title')}</Label>
              <Input id="chapter-title-new" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="chapter-slug-new">{t('fields.slug')}</Label>
              <Input id="chapter-slug-new" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="chapter-description-new">{t('fields.description')}</Label>
            <Textarea id="chapter-description-new" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="chapter-position-new">{t('fields.position')}</Label>
              <Input
                id="chapter-position-new"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                {...register('position', {
                  // Empty input must NOT become `NaN` (RHF's
                  // default for valueAsNumber) — the API Zod
                  // schema rejects NaN with 400. Mapping the
                  // empty string to `undefined` lets the
                  // field be omitted from the request, so
                  // POST /api/chapters can apply the
                  // getNextChapterPosition() default. Any
                  // other value is coerced to a Number so
                  // the schema's `.int().positive()` check
                  // gets a real number.
                  setValueAs: (v: unknown) => {
                    if (v === '' || v === null || v === undefined) return undefined;
                    const n = Number(v);
                    return Number.isFinite(n) ? n : undefined;
                  },
                })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label htmlFor="chapter-duration-new">{t('fields.durationMin')}</Label>
              <Input
                id="chapter-duration-new"
                type="number"
                inputMode="numeric"
                min="0"
                {...register('default_duration_min', { valueAsNumber: true })}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1 text-sm font-medium">
            <input type="checkbox" {...register('is_published')} />
            <span>{t('fields.isPublished')}</span>
          </label>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !courseSlug}>
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
