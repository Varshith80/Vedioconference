'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';

// =====================================================================
// Per-row delete control for the /admin/resources table.
//
// Sprint 8 — R-2 admin surface. Same UX as
// `TutorDeleteButton` but the row has no FK dependencies
// (`resource_grants` is a separate table that is a no-op
// writer today), so the delete is unconditional. If the
// platform later writes `resource_grants` (Sprint 3.6 §c.1
// leaves the join open as forward-compatibility), the FK is
// ON DELETE CASCADE — the grant row goes with the resource.
// =====================================================================

export interface ResourceDeleteButtonProps {
  resourceId: string;
  title: string;
}

export function ResourceDeleteButton({
  resourceId,
  title,
}: ResourceDeleteButtonProps): React.JSX.Element {
  const tCommon = useTranslations('Admin.common');
  const tResources = useTranslations('Admin.resources.delete');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/admin/resources/${resourceId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string; code?: string } }
          | null;
        const apiMessage = body?.error?.message;
        setServerError(apiMessage ?? tForms('deleteError'));
        return;
      }
      setOpen(false);
      setServerError(null);
      toast.success(tResources('success'));
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
        resourceLabel={tCommon('resource.resource')}
        resourceTitle={title}
        simpleTitle={tResources('title')}
        simpleBody={tResources('body')}
        simpleConfirmCta={tResources('confirmCta')}
        onConfirm={onConfirm}
        submitting={submitting}
      />
    </div>
  );
}

ResourceDeleteButton.displayName = 'ResourceDeleteButton';