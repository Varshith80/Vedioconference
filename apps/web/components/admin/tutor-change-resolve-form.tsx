'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export interface AdminTutorOption {
  id: string;
  full_name: string;
}

interface Props {
  requestId: string;
  tutors: ReadonlyArray<AdminTutorOption>;
  currentTutorId: string;
  initialNotes: string | null;
  locale: string;
}

export function TutorChangeResolveForm({
  requestId,
  tutors,
  currentTutorId,
  initialNotes,
  locale,
}: Props): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('TutorChange');
  const [notes, setNotes] = React.useState(initialNotes ?? '');
  const [selected, setSelected] = React.useState('');
  const [submitting, setSubmitting] = React.useState<'cancel' | 'complete' | null>(null);

  const candidates = tutors.filter((tr) => tr.id !== currentTutorId);

  async function callApi(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(
      `/api/admin/tutor-change-requests/${requestId}/resolution`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const json = (await res.json().catch(() => null)) as
      | { ok: true }
      | { error: { message?: string } }
      | null;
    if (!res.ok || !json || !('ok' in json) || !json.ok) {
      const message =
        json && 'error' in json && json.error?.message
          ? json.error.message
          : 'Unable to record the resolution.';
      toast.error(message);
      return false;
    }
    return true;
  }

  async function handleCancel(): Promise<void> {
    setSubmitting('cancel');
    const ok = await callApi({
      admin_notes: notes.trim() || undefined,
    });
    setSubmitting(null);
    if (ok) {
      toast.success(t('admin.resolveCancelCta'));
      router.push(`/${locale}/admin/tutor-change-requests`);
      router.refresh();
    }
  }

  async function handleComplete(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) {
      toast.error('Pick a tutor to re-point the booking to.');
      return;
    }
    setSubmitting('complete');
    const ok = await callApi({
      selected_tutor_id: selected,
      admin_notes: notes.trim() || undefined,
    });
    setSubmitting(null);
    if (ok) {
      toast.success(t('admin.resolveCompleteCta'));
      router.push(`/${locale}/admin/tutor-change-requests`);
      router.refresh();
    }
  }

  return (
    <Card className="mt-8 p-6">
      <h2 className="text-lg font-semibold">{t('admin.resolveTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('admin.resolveHelp')}
      </p>

      <form onSubmit={handleComplete} className="mt-4 space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="admin_notes">{t('admin.resolveNotesLabel')}</Label>
          <Textarea
            id="admin_notes"
            rows={4}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('admin.resolveNotesPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="selected_tutor_id">{t('admin.resolveSelectedLabel')}</Label>
          <select
            id="selected_tutor_id"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t('admin.resolveSelectedPlaceholder')}</option>
            {candidates.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={submitting !== null}
          >
            {t('admin.resolveCancelCta')}
          </Button>
          <Button type="submit" disabled={submitting !== null}>
            {submitting === 'complete'
              ? t('admin.resolving')
              : t('admin.resolveCompleteCta')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
