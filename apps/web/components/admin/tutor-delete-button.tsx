'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';

// =====================================================================
// Per-row delete control for the /admin/tutors table.
//
// One trash button + a `simple`-mode confirm dialog. The
// dialog uses the user-supplied wording verbatim
// ("Are you sure you want to delete this tutor? This action
// cannot be undone.") — we deliberately do NOT use the slug-
// typing flow for tutors because (a) the `tutors` table has no
// slug column and (b) the row already shows the tutor's name
// + email, so the visual confirmation is enough.
//
// Business rule: the DELETE endpoint refuses with 409 when the
// tutor still has upcoming assigned sessions. We surface that
// verbatim in the inline error so the admin knows exactly what
// to do next (unassign the tutor from /admin/sessions first).
// =====================================================================

export interface TutorDeleteButtonProps {
  tutorId: string;
  fullName: string;
}

export function TutorDeleteButton({
  tutorId,
  fullName,
}: TutorDeleteButtonProps): React.JSX.Element {
  const tCommon = useTranslations('Admin.common');
  const tTutors = useTranslations('Admin.tutors.delete');
  const tTutorsErr = useTranslations('Admin.tutors.delete.error');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/admin/tutors', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: tutorId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string; code?: string; details?: { code?: string; blockers?: Array<{ kind: string; count: number }> } } }
          | null;
        // The 409 path carries a server-side, structured "why
        // blocked" message. The API response payload includes
        // a `details.code` discriminator and a per-kind
        // `blockers[]` breakdown so we can pick the exact
        // localized copy that matches the operator's situation
        // (upcoming vs. historical vs. read error). The plain
        // `body.error.message` is the universal fallback (also
        // generated server-side, so the operator still gets a
        // clear sentence in either locale).
        const details = body?.error?.details;
        const apiMessage = body?.error?.message;
        if (res.status === 409 && details?.blockers) {
          const hasUpcoming = details.blockers.some((b) => b.kind === 'upcoming_booking');
          const hasReadError = details.blockers.some((b) => b.kind === 'read_error');
          if (hasReadError) {
            setServerError(tTutorsErr('readError'));
          } else if (hasUpcoming) {
            setServerError(tTutorsErr('hasUpcoming'));
          } else {
            setServerError(tTutorsErr('hasHistory'));
          }
        } else if (res.status === 409 && details?.code === 'tutor_has_dependents') {
          // Defence-in-depth 409 fired by the DELETE itself
          // (the pre-flight missed a row created in the same
          // instant). Use the fallback copy; it's still
          // actionable.
          setServerError(tTutorsErr('fallback'));
        } else if (res.status === 409 && apiMessage) {
          setServerError(apiMessage);
        } else {
          setServerError(apiMessage ?? tForms('deleteError'));
        }
        return;
      }
      // Success — close the dialog, refresh the RSC, toast.
      setOpen(false);
      setServerError(null);
      toast.success(tTutors('success'));
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tForms('deleteError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={tCommon('delete')}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden={true} />
      </Button>
      {serverError ? (
        <p className="text-xs text-destructive" role="alert">
          {serverError}
        </p>
      ) : null}
      <DeleteConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setServerError(null);
        }}
        mode="simple"
        resourceLabel={tCommon('resource.tutor')}
        resourceTitle={fullName}
        simpleTitle={tTutors('title')}
        simpleBody={tTutors('body')}
        simpleConfirmCta={tTutors('confirmCta')}
        onConfirm={onConfirm}
        submitting={submitting}
      />
    </div>
  );
}

TutorDeleteButton.displayName = 'TutorDeleteButton';
