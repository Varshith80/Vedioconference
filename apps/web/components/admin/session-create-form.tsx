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
  adminSessionCreateSchema,
  type AdminSessionCreateInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.8 — admin "Create session" form. POSTs /api/sessions.
// The parent chapter is picked via `SearchableSelect`. The
// `position` is pre-filled from the server's
// `getNextSessionPosition(chapterId)` (max(position)+1) so the
// admin usually just confirms the value. The assigned-tutor
// field is a `SearchableSelect` with an "Unassigned" option
// (empty string sent as `null`).
// =====================================================================

export interface ChapterOption {
  value: string; // chapter uuid
  label: string; // "Course — Chapter"
  courseId: string; // for refetching the next-position
}

export interface TutorOption {
  value: string; // tutor uuid
  label: string; // "Full name"
}

export interface SessionCreateFormProps {
  chapters: ReadonlyArray<ChapterOption>;
  tutors: ReadonlyArray<TutorOption>;
  initialPosition: number; // pre-filled for the first chapter; 1 if no chapters
  fetchNextPosition: (chapterId: string) => Promise<number>;
  defaultChapterId?: string;
  className?: string;
}

export function SessionCreateForm({
  chapters,
  tutors,
  initialPosition,
  fetchNextPosition,
  defaultChapterId,
  className,
}: SessionCreateFormProps): React.JSX.Element {
  const t = useTranslations('Admin.sessionCreate');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [chapterId, setChapterId] = React.useState<string | null>(
    defaultChapterId ?? chapters[0]?.value ?? null,
  );
  const [tutorId, setTutorId] = React.useState<string | null>(null);
  const [position, setPosition] = React.useState<number>(initialPosition);
  const [loadingNext, setLoadingNext] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<AdminSessionCreateInput, 'chapter_id' | 'tutor_id' | 'position'>>({
    resolver: zodResolver(
      adminSessionCreateSchema.omit({
        chapter_id: true,
        tutor_id: true,
        position: true,
      }),
    ),
    defaultValues: {
      slug: '',
      title: '',
      description: '',
      duration_min: 60,
      price_cents: null,
      currency: 'EUR',
      calendly_event_uri: '',
      is_published: false,
      is_preview: false,
    },
  });

  // When the chapter changes, re-fetch the next position. The
  // chapter picker is the only thing the form re-reads from the
  // server; the tutor list is static for the lifetime of the
  // dialog (the tutor directory does not change frequently).
  const onChapterChange = React.useCallback(
    async (next: string | null) => {
      setChapterId(next);
      if (!next) {
        setPosition(1);
        return;
      }
      setLoadingNext(true);
      try {
        const nextPos = await fetchNextPosition(next);
        setPosition(nextPos);
      } catch {
        setPosition(1);
      } finally {
        setLoadingNext(false);
      }
    },
    [fetchNextPosition],
  );

  async function onSubmit(
    values: Omit<AdminSessionCreateInput, 'chapter_id' | 'tutor_id' | 'position'>,
  ): Promise<void> {
    if (!chapterId) {
      setServerError(t('errors.chapterRequired'));
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const body: Record<string, unknown> = {
        ...values,
        chapter_id: chapterId,
        position,
        tutor_id: tutorId, // null = unassigned
      };
      const res = await fetch('/api/sessions', {
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
        duration_min: 60,
        price_cents: null,
        currency: 'EUR',
        calendly_event_uri: '',
        is_published: false,
        is_preview: false,
      });
      setTutorId(null);
      // After a successful create, advance the local position
      // hint so the next session in the same chapter lands at
      // the next slot.
      setPosition((p) => p + 1);
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
            <Label htmlFor="session-chapter-new">{t('fields.chapter')}</Label>
            <SearchableSelect
              id="session-chapter-new"
              aria-label={t('fields.chapter')}
              options={chapters}
              value={chapterId}
              onChange={onChapterChange}
              placeholder={t('placeholders.chapter')}
              emptyMessage={t('empty.chapters')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-title-new">{t('fields.title')}</Label>
              <Input id="session-title-new" {...register('title')} aria-invalid={errors.title ? 'true' : 'false'} />
              {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-slug-new">{t('fields.slug')}</Label>
              <Input id="session-slug-new" {...register('slug')} aria-invalid={errors.slug ? 'true' : 'false'} />
              {errors.slug ? <p className="text-xs text-destructive">{errors.slug.message}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="session-description-new">{t('fields.description')}</Label>
            <Textarea id="session-description-new" rows={3} {...register('description')} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-position-new">{t('fields.position')}</Label>
              <Input
                id="session-position-new"
                type="number"
                inputMode="numeric"
                min="1"
                value={position}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPosition(Number.isFinite(v) && v > 0 ? v : 1);
                }}
                disabled={loadingNext}
                aria-describedby="session-position-hint"
              />
              <p id="session-position-hint" className="text-xs text-muted-foreground">
                {t('positionHint')}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-duration-new">{t('fields.durationMin')}</Label>
              <Input
                id="session-duration-new"
                type="number"
                inputMode="numeric"
                min="1"
                {...register('duration_min', {
                  setValueAs: (v: unknown) =>
                    v === '' || v === null || v === undefined ? null : Number(v),
                })}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-price-new">{t('fields.priceCents')}</Label>
              <Input
                id="session-price-new"
                type="number"
                inputMode="numeric"
                min="0"
                {...register('price_cents', {
                  setValueAs: (v: unknown) =>
                    v === '' || v === null || v === undefined ? null : Number(v),
                })}
                aria-describedby="session-price-hint-new"
              />
              <p id="session-price-hint-new" className="text-xs text-muted-foreground">
                {t('priceTbdHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-currency-new">{t('fields.currency')}</Label>
              <Input id="session-currency-new" maxLength={3} {...register('currency')} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-calendly-new">{t('fields.calendlyUri')}</Label>
              <Input id="session-calendly-new" type="url" {...register('calendly_event_uri')} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="session-tutor-new">{t('fields.assignedTutor')}</Label>
            <SearchableSelect
              id="session-tutor-new"
              aria-label={t('fields.assignedTutor')}
              options={tutors}
              value={tutorId}
              onChange={setTutorId}
              placeholder={t('placeholders.tutor')}
              emptyMessage={t('empty.tutors')}
              clearable
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('is_published')} />
              {t('fields.isPublished')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('is_preview')} />
              {t('fields.isPreview')}
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !chapterId}>
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
