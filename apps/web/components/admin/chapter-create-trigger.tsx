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
import { ChapterCreateForm, type CourseOption } from '@/components/admin/chapter-create-form';

export interface ChapterCreateTriggerProps {
  courses: ReadonlyArray<CourseOption>;
  defaultCourseSlug?: string;
}

export function ChapterCreateTrigger({
  courses,
  defaultCourseSlug,
}: ChapterCreateTriggerProps): React.JSX.Element {
  const t = useTranslations('Admin.chapterCreate');
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
        <ChapterCreateForm courses={courses} defaultCourseSlug={defaultCourseSlug} />
      </DialogContent>
    </Dialog>
  );
}
