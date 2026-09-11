'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Edit, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteConfirmDialog } from '@/components/admin/delete-confirm-dialog';

// =====================================================================
// Sprint 3.8 — per-row "Edit" + "Delete" controls for the admin
// courses list. Edit routes to /admin/courses/[id]. Delete opens
// a `DeleteConfirmDialog` and DELETEs the row via /api/courses/[id].
// =====================================================================

export interface CourseRowActionsProps {
  courseId: string;
  slug: string;
  title: string;
}

export function CourseRowActions({
  courseId,
  slug,
  title,
}: CourseRowActionsProps): React.JSX.Element {
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
      const res = await fetch(`/api/admin/courses/${courseId}`, { method: 'DELETE' });
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
      <Button
        type="button"
        variant="ghost"
        size="icon"
        asChild
        aria-label={tCommon('edit')}
      >
        <a href={`./courses/${courseId}`}>
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
        <p className="text-xs text-destructive ml-2" role="alert">
          {serverError}
        </p>
      ) : null}
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        expectedSlug={slug}
        resourceLabel={tCommon('resource.course')}
        resourceTitle={title}
        onConfirm={onConfirm}
        submitting={submitting}
      />
      <MoreHorizontal className="hidden h-4 w-4 text-muted-foreground" aria-hidden={true} />
    </div>
  );
}
