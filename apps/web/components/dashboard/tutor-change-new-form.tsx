'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { formatCooldownRemaining } from '@/lib/tutor-change-cooldown-helpers';

const clientSchema = z.object({
  session_booking_id: z.string().uuid({ message: 'Choose a booking.' }),
  student_reason: z.string().max(2000).optional(),
});

export interface BookingOption {
  id: string;
  label: string;
}

export interface CooldownInfo {
  inCooldown: boolean;
  remainingMs: number;
  nextEligibleAt: string | null;
  lastChangedAt: string | null;
}

interface Props {
  bookings: ReadonlyArray<BookingOption>;
  locale: string;
  /**
   * Optional cooldown state. When `inCooldown === true`, the form
   * renders the banner and disables submission. The server remains
   * authoritative; this is a UX hint only.
   */
  cooldown?: CooldownInfo | null;
}

export function TutorChangeNewForm({
  bookings,
  locale,
  cooldown,
}: Props): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('TutorChange');
  const [bookingId, setBookingId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const inCooldown = Boolean(cooldown?.inCooldown);
  const remainingLabel = inCooldown
    ? formatCooldownRemaining(cooldown?.remainingMs ?? 0, (locale === 'fr' ? 'fr' : 'en'))
    : '';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (inCooldown) {
      toast.error(t('student.cooldown.error', { remaining: remainingLabel }));
      return;
    }
    const parsed = clientSchema.safeParse({
      session_booking_id: bookingId,
      student_reason: reason.trim() || undefined,
    });
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? 'Invalid input.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/tutor-change-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; data: { id: string } }
        | { error: { code?: string; message?: string; details?: unknown } }
        | null;
      if (!res.ok || !json || !('ok' in json) || !json.ok) {
        // Sprint 6.5 — 409 `tutor_change_cooldown_active` from the
        // server is the authoritative cooldown signal. Refresh the
        // page so the banner re-reads the current cooldown state.
        if (res.status === 409 && json && 'error' in json && json.error?.code === 'tutor_change_cooldown_active') {
          toast.error(t('student.cooldown.error', { remaining: remainingLabel }));
          router.refresh();
          return;
        }
        const message =
          json && 'error' in json && json.error?.message
            ? json.error.message
            : 'Unable to submit the request.';
        toast.error(message);
        return;
      }
      toast.success(t('student.submit'));
      router.push(`/${locale}/dashboard/tutor-change/${json.data.id}`);
      router.refresh();
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-8 p-6">
      {inCooldown ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="tutor-change-cooldown-banner"
        >
          <p className="font-medium">
            {t('student.cooldown.banner', { remaining: remainingLabel })}
          </p>
          <p className="mt-1 text-xs text-amber-800/80">
            {t('student.cooldown.cta')}
          </p>
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor="session_booking_id">{t('student.bookingLabel')}</Label>
          <select
            id="session_booking_id"
            name="session_booking_id"
            required
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            disabled={inCooldown}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">{t('student.bookingPlaceholder')}</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="student_reason">{t('student.reasonLabel')}</Label>
          <Textarea
            id="student_reason"
            name="student_reason"
            rows={5}
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('student.reasonPlaceholder')}
            disabled={inCooldown}
          />
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(`/${locale}/dashboard/tutor-change`)}
            disabled={submitting}
          >
            {t('student.backToList')}
          </Button>
          <Button
            type="submit"
            disabled={submitting || !bookingId || inCooldown}
          >
            {submitting ? t('student.submitting') : t('student.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
