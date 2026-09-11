'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  SessionCreateForm,
  type ChapterOption,
  type TutorOption,
} from '@/components/admin/session-create-form';

// =====================================================================
// Sprint 3.8 — admin "Create session" Dialog trigger. Renders the
// `SessionCreateForm` inside a Radix Dialog. The dialog also provides
// the `fetchNextPosition` callback to the form: it GETs
// `/api/sessions/next-position?chapterId=...` and forwards the
// returned integer. The endpoint is admin-only; failures fall back
// to `1` so the form never blocks on a transient backend hiccup.
// =====================================================================

export interface SessionCreateTriggerProps {
  chapters: ReadonlyArray<ChapterOption>;
  tutors: ReadonlyArray<TutorOption>;
  defaultChapterId?: string;
}

export function SessionCreateTrigger({
  chapters,
  tutors,
  defaultChapterId,
}: SessionCreateTriggerProps): React.JSX.Element {
  const t = useTranslations('Admin.sessionCreate');
  const tCommon = useTranslations('Admin.common');
  const [open, setOpen] = React.useState(false);

  // Pre-fill the dialog with the next position for the default
  // chapter. When the admin changes the chapter inside the
  // dialog, the form re-fetches via the same function.
  const initialChapter = defaultChapterId ?? chapters[0]?.value ?? null;
  const [initialPosition, setInitialPosition] = React.useState<number>(1);

  React.useEffect(() => {
    if (!open || !initialChapter) {
      setInitialPosition(1);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/sessions/next-position?chapterId=${encodeURIComponent(initialChapter)}`,
        );
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as
          | { data?: { position?: number } }
          | null;
        if (!cancelled) setInitialPosition(body?.data?.position ?? 1);
      } catch {
        // network blip → keep the optimistic default of 1
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialChapter]);

  const fetchNextPosition = React.useCallback(
    async (chapterId: string): Promise<number> => {
      const res = await fetch(
        `/api/sessions/next-position?chapterId=${encodeURIComponent(chapterId)}`,
      );
      if (!res.ok) return 1;
      const body = (await res.json().catch(() => null)) as
        | { data?: { position?: number } }
        | null;
      return body?.data?.position ?? 1;
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-4 w-4" aria-hidden={true} />
          {tCommon('createCta', { resource: t('resource') })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subline')}</DialogDescription>
        </DialogHeader>
        <SessionCreateForm
          chapters={chapters}
          tutors={tutors}
          initialPosition={initialPosition}
          fetchNextPosition={fetchNextPosition}
          defaultChapterId={initialChapter ?? undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
