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

const clientSchema = z.object({
  session_booking_id: z.string().uuid({ message: 'Choose a booking.' }),
  student_reason: z.string().max(2000).optional(),
});

export interface BookingOption {
  id: string;
  label: string;
}

interface Props {
  bookings: ReadonlyArray<BookingOption>;
  locale: string;
}

export function TutorChangeNewForm({ bookings, locale }: Props): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('TutorChange');
  const [bookingId, setBookingId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
        | { error: { message?: string } }
        | null;
      if (!res.ok || !json || !('ok' in json) || !json.ok) {
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
      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor="session_booking_id">{t('student.bookingLabel')}</Label>
          <select
            id="session_booking_id"
            name="session_booking_id"
            required
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <Button type="submit" disabled={submitting || !bookingId}>
            {submitting ? t('student.submitting') : t('student.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
