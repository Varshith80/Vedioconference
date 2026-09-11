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
import {
  adminGradeCreateSchema,
  type AdminGradeCreateInput,
} from '@/lib/validations/admin-catalog';
import { SearchableSelect } from '@/components/ui/searchable-select';

// =====================================================================
// Sprint 3.8 — admin "Create grade" form. POSTs /api/grades.
// The parent program is picked via `SearchableSelect` (a list of
// `slug` values populated by the parent page).
// =====================================================================

export interface ProgramOption {
  value: string; // slug
  label: string; // title
}

export interface GradeCreateFormProps {
  programs: ReadonlyArray<ProgramOption>;
  defaultProgramSlug?: string;
  className?: string;
}

export function GradeCreateForm({
  programs,
  defaultProgramSlug,
  className,
}: GradeCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.gradeCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [programSlug, setProgramSlug] = React.useState<string | null>(
    defaultProgramSlug ?? programs[0]?.value ?? null,
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<AdminGradeCreateInput, 'program_slug'>>({
    resolver: zodResolver(adminGradeCreateSchema.omit({ program_slug: true })),
    defaultValues: { title: '', slug: '', sort_order: 0 },
  });

  async function onSubmit(values: Omit<AdminGradeCreateInput, 'program_slug'>): Promise<void> {
    if (!programSlug) {
      setServerError(t('errors.programRequired'));
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/grades', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...values, program_slug: programSlug }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setServerError(errBody?.error?.message ?? tForms('saveError'));
        return;
      }
      reset({ title: '', slug: '', sort_order: 0 });
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
            <Label htmlFor="grade-program-new">{t('fields.program')}</Label>
            <SearchableSelect
              id="grade-program-new"
              aria-label={t('fields.program')}
              options={programs}
              value={programSlug}
              onChange={setProgramSlug}
              placeholder={t('placeholders.program')}
              emptyMessage={t('empty.programs')}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-title-new">{t('fields.title')}</Label>
              <Input id="grade-title-new" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="grade-slug-new">{t('fields.slug')}</Label>
              <Input id="grade-slug-new" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="grade-sort-new">{t('fields.sortOrder')}</Label>
            <Input id="grade-sort-new" type="number" inputMode="numeric" min="0" {...register('sort_order', { valueAsNumber: true })} />
          </div>
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
