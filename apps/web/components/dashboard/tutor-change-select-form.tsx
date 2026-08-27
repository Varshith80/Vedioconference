'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const clientSchema = z.object({
  selected_tutor_id: z.string().uuid({ message: 'Choose a tutor.' }),
});

export interface TutorOption {
  id: string;
  label: string;
}

interface Props {
  requestId: string;
  alternatives: ReadonlyArray<TutorOption>;
  locale: string;
}

export function TutorChangeSelectForm({
  requestId,
  alternatives,
  locale,
}: Props): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('TutorChange');
  const [selected, setSelected] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = clientSchema.safeParse({ selected_tutor_id: selected });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? 'Invalid input.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/student/tutor-change-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
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
            : 'Unable to record your selection.';
        toast.error(message);
        return;
      }
      toast.success(t('student.selectAlternativeTitle'));
      router.push(`/${locale}/dashboard/tutor-change/${requestId}`);
      router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-6 p-6">
      <h2 className="text-lg font-semibold">
        {t('student.selectAlternativeTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('student.selectAlternativeHelp')}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <ul role="radiogroup" className="space-y-2">
          {alternatives.map((a) => (
            <li key={a.id}>
              <label
                htmlFor={`alt-${a.id}`}
                className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  id={`alt-${a.id}`}
                  type="radio"
                  name="selected_tutor_id"
                  value={a.id}
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                  className="h-4 w-4"
                />
                <span className="font-medium">{a.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/${locale}/dashboard/tutor-change`)}
            disabled={submitting}
          >
            {t('student.backToList')}
          </Button>
          <Button type="submit" disabled={submitting || !selected}>
            {submitting ? t('student.selecting') : t('student.selectCta')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
