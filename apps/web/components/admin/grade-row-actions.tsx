'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';

export interface GradeRowActionsProps {
  gradeId: string;
  slug: string;
  title: string;
}

export function GradeRowActions({
  gradeId,
  slug,
  title,
}: GradeRowActionsProps): React.JSX.Element {
  const tCommon = useTranslations('Admin.common');
  const tForms = useTranslations('Admin.forms');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function onConfirm(): Promise<void> {
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch(`/api/grades/${gradeId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setServerError(body?.error?.message ?? tForms('deleteError'));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : tForms('deleteError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="icon" asChild aria-label={tCommon('edit')}>
        <a href={`./grades/${gradeId}`}>
          <Edit className="h-4 w-4" aria-hidden={true} />
        </a>
      </Button>
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
        <p className="text-xs text-destructive ml-2" role="alert">{serverError}</p>
      ) : null}
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        expectedSlug={slug}
        resourceLabel={tCommon('resource.grade')}
        resourceTitle={title}
        onConfirm={onConfirm}
        submitting={submitting}
      />
    </div>
  );
}
