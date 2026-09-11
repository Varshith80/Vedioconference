import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, LineChart, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/dashboard/progress-bar';
import { EmptyState } from '@/components/shared/empty-state';
import type { StudentProgressSummary } from '@/services/student/progress';

interface ProgressOverviewProps {
  locale: string;
  summary: StudentProgressSummary;
  copy: {
    title: string;
    subline: string;
    emptyTitle: string;
    emptyDescription: string;
    sessionsPurchased: (count: number) => string;
    sessionsCompleted: (count: number) => string;
    sessionsScheduled: (count: number) => string;
    percent: (percent: number) => string;
    viewAll: string;
  };
}

/**
 * Real learning progress for the student dashboard home.
 *
 * One `Card` per program the student has any grant for,
 * with a count of purchased / completed / scheduled
 * sessions and a percent-complete meter. The card links
 * into the existing programs page so the user can drill
 * down into a per-session list.
 */
export function ProgressOverview({
  locale,
  summary,
  copy,
}: ProgressOverviewProps) {
  if (!summary.hasAny) {
    return (
      <EmptyState
        icon={<LineChart className="h-6 w-6" aria-hidden={true} />}
        title={copy.emptyTitle}
        description={copy.emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      {summary.programs.map((p) => {
        const purchasedLabel = copy.sessionsPurchased(p.purchased);
        const completedLabel = copy.sessionsCompleted(p.completed);
        const scheduledLabel = copy.sessionsScheduled(
          Math.max(0, p.booked - p.completed),
        );
        const percentLabel = copy.percent(p.percent);
        const isPack = p.program.id === '__pack__';
        return (
          <Card key={p.program.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base sm:text-lg">
                <span className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden="true" />
                  <span className="truncate">{p.program.title}</span>
                </span>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {percentLabel}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProgressBar
                value={p.percent}
                label={`${p.program.title} — ${percentLabel}`}
                className="mt-1"
              />
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Purchased
                  </dt>
                  <dd className="mt-1 text-base font-medium text-foreground">
                    {purchasedLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Completed
                  </dt>
                  <dd className="mt-1 text-base font-medium text-foreground">
                    {completedLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground/80">
                    Scheduled
                  </dt>
                  <dd className="mt-1 text-base font-medium text-foreground">
                    {scheduledLabel}
                  </dd>
                </div>
              </dl>
              {!isPack && (
                <div className="mt-4">
                  <Link
                    href={`/${locale}/dashboard/programs`}
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copy.viewAll}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
