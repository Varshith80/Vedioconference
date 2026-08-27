'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export interface AdminTutorOption {
  id: string;
  full_name: string;
}

interface Props {
  requestId: string;
  tutors: ReadonlyArray<AdminTutorOption>;
  currentTutorId: string;
  locale: string;
}

export function TutorChangeProposeForm({
  requestId,
  tutors,
  currentTutorId,
  locale,
}: Props): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('TutorChange');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const candidates = tutors.filter((tr) => tr.id !== currentTutorId);

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 3),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (selected.length === 0) {
      toast.error('Pick at least one tutor.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/tutor-change-requests/${requestId}/alternatives`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ alternative_tutor_ids: selected }),
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
            : 'Unable to send the proposal.';
        toast.error(message);
        return;
      }
      toast.success(t('admin.proposeSubmit'));
      router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-8 p-6">
      <h2 className="text-lg font-semibold">{t('admin.proposeTitle')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('admin.proposeHelp')}
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <fieldset>
          <legend className="text-sm font-medium">
            {t('admin.alternativesLabel')}
          </legend>
          <ul role="list" className="mt-2 space-y-2">
            {candidates.map((tr) => (
              <li key={tr.id}>
                <label
                  htmlFor={`prop-${tr.id}`}
                  className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-3 transition-colors hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    id={`prop-${tr.id}`}
                    type="checkbox"
                    checked={selected.includes(tr.id)}
                    onChange={() => toggle(tr.id)}
                    disabled={!selected.includes(tr.id) && selected.length >= 3}
                    className="h-4 w-4"
                  />
                  <span className="font-medium">{tr.full_name}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex items-center justify-end gap-3">
          <Button asChild={true} type="button" variant="ghost">
            <a href={`/${locale}/admin/tutor-change-requests`}>
              {t('common.retry')}
            </a>
          </Button>
          <Button type="submit" disabled={submitting || selected.length === 0}>
            {submitting ? t('admin.proposeSubmitting') : t('admin.proposeSubmit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
