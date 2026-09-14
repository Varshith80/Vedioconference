'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * TASK 3 — Feature C: Monthly Support card on the student dashboard.
 *
 * Renders the current Monthly Support subscription state. The
 * server pre-resolves the data (RLS-respecting) and passes a
 * serialisable `state` to this client component. The client
 * component owns ONLY the cancel action and the locale-aware
 * copy.
 *
 * States
 * ------
 *   - `none`             — the student has no Monthly Support
 *                          subscription. The card is hidden by
 *                          the parent RSC; this component is only
 *                          mounted when a subscription exists.
 *   - `active`           — the subscription is current. Card
 *                          shows the period end + the cancel CTA.
 *   - `active_cancelling`— the student has already requested
 *                          cancel-at-period-end. Card shows the
 *                          scheduled end date. Cancel CTA is
 *                          disabled.
 *   - `past_due`         — the most recent invoice failed. Card
 *                          shows the grace period end (5 days
 *                          from past_due_at). Current-period
 *                          credits remain consumable (D-1).
 *   - `cancelled`        — the subscription is finalised. Card
 *                          shows the cancellation date. No CTA.
 *
 * D-1 invariant: the card never tells the student that their
 * current-period credits are gone during past_due / grace.
 *
 * D-2 invariant: the cancel CTA sets cancel_at_period_end=true.
 * No immediate cancellation. The finalisation happens at
 * current_period_end (the period-refresh path).
 */

export type MonthlySubscriptionState =
  | { kind: 'active'; current_period_end: string }
  | {
      kind: 'active_cancelling';
      current_period_end: string;
      cancelled_at: string | null;
    }
  | {
      kind: 'past_due';
      current_period_end: string;
      grace_period_ends_at: string | null;
    }
  | { kind: 'cancelled'; cancelled_at: string | null };

export interface MonthlySubscriptionCardProps {
  initial: MonthlySubscriptionState;
}

export function MonthlySubscriptionCard({ initial }: MonthlySubscriptionCardProps) {
  const t = useTranslations('Dashboard.home.monthly');
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onCancel() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/student/subscription', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: { code?: string; message?: string } }
        | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error?.message ?? t('cancelError'));
        setSubmitting(false);
        return;
      }
      // Refresh the RSC so the card reflects the new state.
      router.refresh();
    } catch {
      setError(t('cancelError'));
    } finally {
      setSubmitting(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (initial.kind === 'cancelled') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('cancelledTitle')}</CardTitle>
          <CardDescription>{t('cancelledSubline')}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (initial.kind === 'past_due') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('pastDueTitle')}</CardTitle>
          <CardDescription>
            {initial.grace_period_ends_at
              ? t('pastDueSublineWithGrace', {
                  date: formatDate(initial.grace_period_ends_at),
                })
              : t('pastDueSubline')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('pastDueCurrentPeriodNote', {
              date: formatDate(initial.current_period_end),
            })}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (initial.kind === 'active_cancelling') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('activeCancellingTitle')}</CardTitle>
          <CardDescription>
            {t('activeCancellingSubline', {
              date: formatDate(initial.current_period_end),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('activeCancellingNote', {
              date: formatDate(initial.current_period_end),
            })}
          </p>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            disabled
            aria-disabled={true}
          >
            <Repeat className="mr-2 h-4 w-4" aria-hidden={true} />
            {t('cancelPending')}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // active
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('activeTitle')}</CardTitle>
        <CardDescription>
          {t('activeSubline', { date: formatDate(initial.current_period_end) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t('activeNote')}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden={true} />
              {t('cancelling')}
            </>
          ) : (
            <>
              <Repeat className="mr-2 h-4 w-4" aria-hidden={true} />
              {t('cancelCta')}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
