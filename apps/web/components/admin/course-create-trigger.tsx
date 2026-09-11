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
import { CourseCreateForm, type ProgramOption, type GradeOption } from '@/components/admin/course-create-form';

export interface CourseCreateTriggerProps {
  programs: ReadonlyArray<ProgramOption>;
  grades: ReadonlyArray<GradeOption>;
  defaultProgramSlug?: string;
}

export function CourseCreateTrigger({
  programs,
  grades,
  defaultProgramSlug,
}: CourseCreateTriggerProps): React.JSX.Element {
  const t = useTranslations('Admin.courseCreate');
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
        <CourseCreateForm
          programs={programs}
          grades={grades}
          defaultProgramSlug={defaultProgramSlug}
        />
      </DialogContent>
    </Dialog>
  );
}
