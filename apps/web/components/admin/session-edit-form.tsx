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
  adminSessionEditSchema,
  type AdminSessionEditInput,
} from '@/lib/validations/admin-catalog';

// =====================================================================
// Sprint 3.6 §4.5 — admin "Edit session" form. PATCHes
// /api/sessions/[id]. The form is the only mutator for an
// existing session outside the Excel importer. price_cents
// is a number input; submitting with the field blank maps
// to `null` (price TBD) — the API preserves nullability
// (Sprint 3.5 invariant).
//
// Sprint 3.8 — the assigned-tutor FK is managed outside RHF
// (controlled <SearchableSelect>), and the PATCH body only
// includes `tutor_id` when the selection differs from the
// initial value. Clearing the picker sends `null` (unassigned);
// picking a tutor sends the tutor's UUID. Historical
// `session_bookings.tutor_id` rows are not affected by session
// reassignment — that's an immutable history invariant.
// =====================================================================

export interface TutorOption {
  value: string; // tutor uuid
  label: string; // "Full name" (standalone tutor, no headline — Sprint 3.8)
}

export interface SessionEditFormProps {
  sessionId: string;
  initial: {
    title: string;
    description: string | null;
    duration_min: number | null;
    price_cents: number | null;
    currency: string;
    calendly_event_uri: string | null;
    is_published: boolean;
    is_preview: boolean;
    tutor_id: string | null; // Sprint 3.8 — current assigned tutor
  };
  tutors: ReadonlyArray<TutorOption>;
  className?: string;
}

export function SessionEditForm({
  sessionId,
  initial,
  tutors,
  className,
}: SessionEditFormProps): React.JSX.Element {
  const t = useTranslations('Admin.sessionEdit');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();

  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  // Sprint 3.8 — the assigned-tutor picker is controlled
  // outside RHF (matches the create form pattern). `null`
  // means unassigned. The PATCH body only carries `tutor_id`
  // when this value diverges from `initial.tutor_id`.
  const [tutorId, setTutorId] = React.useState<string | null>(initial.tutor_id);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
  } = useForm<AdminSessionEditInput>({
    resolver: zodResolver(adminSessionEditSchema),
    defaultValues: {
      title: initial.title,
      description: initial.description ?? '',
      duration_min: initial.duration_min,
      price_cents: initial.price_cents,
      currency: initial.currency,
      calendly_event_uri: initial.calendly_event_uri ?? '',
      is_published: initial.is_published,
      is_preview: initial.is_preview,
    },
  });

  // The price_cents field is a number input; the form
  // treats an empty string as null (price TBD). We watch
  // the raw value and forward the right shape to the API.
  const priceCentsRaw = watch('price_cents');

  async function onSubmit(values: AdminSessionEditInput): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      // Normalise empty-string fields to null where the API
      // expects a nullable scalar.
      const body: Record<string, unknown> = {};
      if (values.title !== initial.title) body.title = values.title;
      const desc = values.description ?? '';
      if (desc !== (initial.description ?? '')) {
        body.description = desc === '' ? null : desc;
      }
      if ((values.duration_min ?? null) !== initial.duration_min) {
        body.duration_min = values.duration_min ?? null;
      }
      if ((values.price_cents ?? null) !== initial.price_cents) {
        body.price_cents = values.price_cents ?? null;
      }
      if (values.currency && values.currency !== initial.currency) {
        body.currency = values.currency;
      }
      const calendly = values.calendly_event_uri ?? '';
      if (calendly !== (initial.calendly_event_uri ?? '')) {
        body.calendly_event_uri = calendly === '' ? null : calendly;
      }
      if (values.is_published !== initial.is_published) {
        body.is_published = values.is_published;
      }
      if (values.is_preview !== initial.is_preview) {
        body.is_preview = values.is_preview;
      }
      // Sprint 3.8 — assigned-tutor FK. We only send it when
      // the admin's selection diverges from the initial value
      // to keep PATCH bodies small. `null` (Unassigned) is
      // distinct from the field being omitted: the API maps
      // both to the right behavior.
      if (tutorId !== initial.tutor_id) {
        body.tutor_id = tutorId;
      }

      if (Object.keys(body).length === 0) {
        // Nothing to send — treat as a no-op success.
        setSavedAt(Date.now());
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/sessions/${sessionId}`, {
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
          <div className="flex flex-col gap-1">
            <Label htmlFor="session-title">{t('fields.title')}</Label>
            <Input
              id="session-title"
              {...register('title')}
              aria-invalid={errors.title ? 'true' : 'false'}
            />
            {errors.title ? (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="session-description">{t('fields.description')}</Label>
            <Textarea
              id="session-description"
              rows={3}
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-duration">{t('fields.durationMin')}</Label>
              <Input
                id="session-duration"
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
              <Label htmlFor="session-price">{t('fields.priceCents')}</Label>
              <Input
                id="session-price"
                type="number"
                inputMode="numeric"
                min="0"
                value={priceCentsRaw === null || priceCentsRaw === undefined ? '' : String(priceCentsRaw)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setValue(
                    'price_cents',
                    raw === '' ? null : Number(raw),
                    { shouldDirty: true },
                  );
                }}
                aria-describedby="session-price-hint"
              />
              <p id="session-price-hint" className="text-xs text-muted-foreground">
                {t('priceTbdHint')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-currency">{t('fields.currency')}</Label>
              <Input
                id="session-currency"
                maxLength={3}
                {...register('currency')}
                aria-invalid={errors.currency ? 'true' : 'false'}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="session-calendly">{t('fields.calendlyUri')}</Label>
              <Input
                id="session-calendly"
                type="url"
                {...register('calendly_event_uri')}
              />
            </div>
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

          <div className="flex flex-col gap-1">
            <Label htmlFor="session-tutor">{t('fields.assignedTutor')}</Label>
            <SearchableSelect
              id="session-tutor"
              aria-label={t('fields.assignedTutor')}
              options={tutors}
              value={tutorId}
              onChange={setTutorId}
              placeholder={t('placeholders.tutor')}
              emptyMessage={t('empty.tutors')}
              clearable
            />
            <p className="text-xs text-muted-foreground">{t('assignedTutorHint')}</p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submitting || !isDirty}>
              {submitting ? tForms('submitting') : tForms('submit')}
            </Button>
            {savedAt && !serverError ? (
              <p className="text-sm text-muted-foreground" role="status">
                {t('saved')}
              </p>
            ) : null}
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
