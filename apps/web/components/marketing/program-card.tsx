import * as React from 'react';
import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Program } from '@/types/domain';

interface ProgramCardProps {
  program: Program;
  /** Number of published courses under this program (for the
   *  "view courses" badge). */
  courseCount?: number;
  /** Optional grade count (only the high_school program has grades). */
  gradeCount?: number;
  /** Locale-prefixed path the card links to (e.g. `/en/levels/high-school`). */
  href: string;
}

/**
 * Marketing card for an academic program. Used on the `/levels`
 * index and the dashboard "my programs" list. Pure presentational.
 */
export function ProgramCard({ program, courseCount, gradeCount, href }: ProgramCardProps) {
  return (
    <Card className="flex h-full flex-col transition-shadow hover:shadow-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary"
          >
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-lg">{program.title}</CardTitle>
            <CardDescription className="mt-1">
              {program.subtitle ?? program.description ?? ''}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {program.description ? (
          <p className="line-clamp-3 text-sm text-muted-foreground">{program.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {typeof courseCount === 'number' ? (
            <span>
              {courseCount} {courseCount === 1 ? 'course' : 'courses'}
            </span>
          ) : null}
          {typeof gradeCount === 'number' && gradeCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {gradeCount} {gradeCount === 1 ? 'grade' : 'grades'}
              </span>
            </>
          ) : null}
        </div>
      </CardContent>
      <Link
        href={href}
        className="absolute inset-0 rounded-lg"
        aria-label={`View ${program.title}`}
        aria-hidden="true"
        tabIndex={-1}
      />
    </Card>
  );
}
