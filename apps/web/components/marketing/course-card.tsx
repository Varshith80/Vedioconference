import * as React from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Clock, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCents } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { Course } from '@/types/domain';

interface CourseCardProps {
  course: Course;
  /** Optional pre-localized course title. If set, used
   *  instead of `course.title`. The runtime app computes
   *  this from `row.metadata?.titles?.[locale]?.title` via
   *  `lib/i18n/localized-title.ts`; the importer is the
   *  only writer of the metadata field. */
  displayTitle?: string;
  className?: string;
}

/**
 * Public course card used on the marketing catalog. Pure presentational
 * — all data is passed in, no DB / no business logic.
 *
 * Uses `useLocale()` and `useTranslations('Courses')` from
 * next-intl to build the locale-prefixed course link and the
 * SR-only "view course" link label, so the same component
 * works on both `/en` and `/fr` routes.
 */
export function CourseCard({ course, displayTitle, className }: CourseCardProps) {
  const locale = useLocale();
  const t = useTranslations('Courses');
  const courseHref = `/${locale}/courses/${course.slug}`;
  const title = displayTitle ?? course.title;
  const initials = (title ?? '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Card className={cn('flex h-full flex-col', className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-lg">{title}</CardTitle>
            <CardDescription className="mt-1 line-clamp-1">
              {course.level ?? '—'} · {course.subject ?? '—'}
            </CardDescription>
          </div>
          <Avatar className="h-10 w-10 shrink-0">
            {course.cover_image ? <AvatarImage src={course.cover_image} alt="" /> : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {course.subtitle && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{course.subtitle}</p>
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {course.duration_min ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {course.duration_min} min
            </span>
          ) : null}
          <Badge variant="outline" className="text-[10px]">
            <BookOpen className="mr-1 h-3 w-3" aria-hidden="true" />
            {course.level ?? t('allLevels')}
          </Badge>
        </div>
        <span className="font-heading text-lg font-semibold text-foreground">
          {formatCents(course.price_cents, course.currency)}
        </span>
      </CardFooter>
      <Link
        href={courseHref}
        className="sr-only"
        aria-label={t('viewCourse', { title })}
      >
        {t('viewCourse', { title })}
      </Link>
      <Link
        href={courseHref}
        className="absolute inset-0 rounded-lg"
        aria-hidden="true"
        tabIndex={-1}
      />
    </Card>
  );
}
