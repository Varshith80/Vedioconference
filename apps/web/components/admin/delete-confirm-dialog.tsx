'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// =====================================================================
// Sprint 3.8 — `DeleteConfirmDialog` atom (Admin Manual CRUD plan §8).
//
// A shared Radix Dialog for destructive admin deletes. The admin
// must type the row's slug to confirm. Reused by every CRUD page
// that supports delete (programs/grades/courses/chapters/sessions).
//
// The dialog is fully controlled: the parent owns `open` and calls
// `onOpenChange(false)` to dismiss, and `onConfirm` only when the
// typed slug matches.
// =====================================================================

export type DeleteConfirmMode = 'slug' | 'simple';

export interface DeleteConfirmDialogProps {
  /** Dialog open state. */
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Row's slug the admin must type to confirm. Required when
   *  `mode === 'slug'` (the default). Ignored when
   *  `mode === 'simple'`. */
  expectedSlug?: string;
  /**
   * `slug` (default): the admin must type the row's slug to
   *  enable the destructive button. Used by programs/grades/
   *  courses/chapters/sessions where the slug is a stable
   *  identifier the admin can see in the URL.
   * `simple`: a plain "Are you sure?" confirm. The button is
   *  enabled as soon as the dialog opens. Used for tutors
   *  (which don't have a slug) and any future resource where
   *  the slug-typing ceremony is more friction than safety.
   */
  mode?: DeleteConfirmMode;
  /** Resource name (e.g. "program", "course") for the title and
   *  body. Pre-translated label. */
  resourceLabel: string;
  /** The display name of the row (e.g. the title) — shown in
   *  the body so the admin is sure which row they're about to
   *  delete. */
  resourceTitle: string;
  /**
   * Override copy for the simple mode. The defaults are
   * deliberately the user-supplied wording for tutors
   * ("Are you sure you want to delete this tutor? This action
   * cannot be undone."). Other resources can still pass
   * customised strings without having to translate a new key.
   */
  simpleTitle?: string;
  simpleBody?: string;
  simpleConfirmCta?: string;
  /** Called when the admin clicks "Delete" (and the slug
   *  matches, in `slug` mode). */
  onConfirm: () => void;
  /** Render a spinner / disable the Delete button while the
   *  request is in flight. */
  submitting?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  expectedSlug,
  mode = 'slug',
  resourceLabel,
  resourceTitle,
  simpleTitle,
  simpleBody,
  simpleConfirmCta,
  onConfirm,
  submitting = false,
}: DeleteConfirmDialogProps): React.JSX.Element {
  const t = useTranslations('Admin.common');
  const tForms = useTranslations('Admin.forms');
  const [typed, setTyped] = React.useState('');

  // Reset the typed value when the dialog opens/closes.
  React.useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const isSimple = mode === 'simple';
  // In simple mode, the destructive button is enabled as soon
  // as the dialog opens. In slug mode, the admin must type the
  // exact slug before the button becomes active.
  const canConfirm = isSimple
    ? !submitting
    : typed.trim() === (expectedSlug ?? '') && !submitting;

  // Defaults honour the user-supplied wording for the tutors
  // case ("Are you sure you want to delete this tutor? This
  // action cannot be undone."). We keep the same shape for
  // every other resource that uses simple mode so the message
  // stays consistent — the caller can still override via the
  // `simpleTitle`/`simpleBody` props.
  const fallbackTitle = isSimple
    ? simpleTitle ?? `Are you sure you want to delete this ${resourceLabel}?`
    : t('confirmDeleteTitle', { resource: resourceLabel });
  const fallbackBody = isSimple
    ? simpleBody ?? 'This action cannot be undone.'
    : t('confirmDeleteBody', { resource: resourceLabel });
  const confirmCta = isSimple
    ? simpleConfirmCta ?? t('confirmDeleteCta')
    : t('confirmDeleteCta');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fallbackTitle}</DialogTitle>
          <DialogDescription>{fallbackBody}</DialogDescription>
        </DialogHeader>

        {isSimple ? (
          // Simple mode: just a quiet summary card so the
          // admin can double-check which row they're about to
          // delete. No text input.
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{resourceTitle}</span>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-medium">{resourceTitle}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                slug: {expectedSlug}
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="delete-confirm-slug">
                {t('confirmDeletePrompt', { slug: expectedSlug ?? '' })}
              </Label>
              <Input
                id="delete-confirm-slug"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={expectedSlug ?? ''}
                autoComplete="off"
                spellCheck={false}
                disabled={submitting}
              />
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {tForms('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={!canConfirm}
            aria-disabled={!canConfirm}
          >
            {submitting ? tForms('deleting') : confirmCta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

DeleteConfirmDialog.displayName = 'DeleteConfirmDialog';
