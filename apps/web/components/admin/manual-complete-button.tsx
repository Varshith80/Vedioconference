'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

// =====================================================================
// Sprint 8 — B-19 manual-complete button. Back-office tool only:
// appears in the admin /admin/session-bookings list. POSTs
// /api/admin/session-bookings/[id]/complete and revalidates
// the page.
//
// We intentionally use a plain confirm() prompt instead of
// the DeleteConfirmDialog: this is an idempotent action (the
// API returns 200 with transitioned:false when already
// completed), so a destructive-style confirm is overkill.
// =====================================================================

export interface ManualCompleteButtonProps {
  bookingId: string;
  status: string;
}

export function ManualCompleteButton({
  bookingId,
  status,
}: ManualCompleteButtonProps): React.JSX.Element | null {
  const t = useTranslations('Admin.manualComplete');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  // Already terminal? Don't render the button at all. The
  // status filter on /admin/session-bookings keeps the list
  // to non-terminal rows, but defence-in-depth.
  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'no_show' ||
    status === 'rescheduled'
  ) {
    return null;
  }

  async function onClick(): Promise<void> {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/session-bookings/${bookingId}/complete`,
        { method: 'POST' },
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { transitioned?: boolean } }
        | null;
      if (!res.ok) {
        const errBody = body as unknown as
          | { error?: { message?: string } }
          | null;
        toast.error(errBody?.error?.message ?? tForms('saveError'));
        return;
      }
      toast.success(t('success'));
      // Always revalidate — even when transitioned:false, the
      // server may have flipped a derived field.
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tForms('saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={submitting}
      onClick={() => void onClick()}
    >
      <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
      {submitting ? tForms('submitting') : t('cta')}
    </Button>
  );
}

ManualCompleteButton.displayName = 'ManualCompleteButton';