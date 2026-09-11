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
import { TutorCreateForm } from '@/components/admin/tutor-create-form';

// =====================================================================
// Sprint 3.8 — admin "Create tutor" trigger. Wraps
// `TutorCreateForm` in a Radix Dialog so the form lives inline
// with the tutor directory and is keyboard/aria accessible.
// =====================================================================

export function TutorCreateTrigger(): React.JSX.Element {
  const t = useTranslations('Admin.tutorCreate');
  const tCommon = useTranslations('Admin.common');
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          <Plus className="h-4 w-4" aria-hidden={true} />
          {tCommon('createCta', { resource: t('resource') })}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subline')}</DialogDescription>
        </DialogHeader>
        <TutorCreateForm />
      </DialogContent>
    </Dialog>
  );
}
