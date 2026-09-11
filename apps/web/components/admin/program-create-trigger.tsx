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
import { ProgramCreateForm } from '@/components/admin/program-create-form';

// =====================================================================
// Sprint 3.8 — header-action trigger on the admin programs list.
// Opens a Radix Dialog that hosts the inline create form. Same
// pattern reused by grades/courses/chapters/sessions.
// =====================================================================

export function ProgramCreateTrigger(): React.JSX.Element {
  const t = useTranslations('Admin.programCreate');
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
        <ProgramCreateForm />
      </DialogContent>
    </Dialog>
  );
}
