import type { Metadata } from 'next';
import { Repeat } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Heading } from '@/components/shared/heading';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import {
  MonthlySubscriptionCard,
  type MonthlySubscriptionState,
} from '@/components/dashboard/monthly-subscription-card';
import { BRAND } from '@/lib/constants/brand';
import { getCurrentUser } from '@/services/auth';
import {
  getStudentSubscription,
} from '@/services/curriculum/monthly-subscriptions';

/**
 * TASK 3 — Feature C: Monthly Support dashboard page.
 *
 *   RSC. RLS-respecting (uses getStudentSubscription).
 *
 *   - If the student has no subscription, the page renders an
 *     empty state pointing to the marketing /pricing page.
 *   - If the student has a subscription, the page renders the
 *     state-resolved <MonthlySubscriptionCard> with the four
 *     documented states (active, active_cancelling, past_due,
 *     cancelled).
 *
 *   D-1 invariant: the past_due state DOES NOT hide the
 *   current-period credit availability — the subline reinforces
 *   that the current period remains usable until current_period_end.
 *
 *   D-2 invariant: the page NEVER offers an immediate
 *   cancellation CTA — the cancel path is always end-of-period.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Dashboard.subscription' });
  return {
    title: `${t('title')} — ${BRAND.name}`,
    description: t('subline'),
    alternates: { canonical: `/${locale}/dashboard/subscription` },
    robots: { index: false, follow: false },
  };
}

// The page must reflect the latest subscription state, so we
// re-render on every request (the cancel action calls
// router.refresh() to re-trigger this RSC).
export const dynamic = 'force-dynamic';

export default async function DashboardSubscriptionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tPage = await getTranslations('Dashboard.subscription');
  const tNav = await getTranslations('Nav');

  const user = await getCurrentUser();
  const sub = user ? await getStudentSubscription(user.id) : null;
  const cardState: MonthlySubscriptionState | null = sub ? resolveState(sub) : null;

  return (
    <Section spacing="default" aria-labelledby="dashboard-subscription-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            { label: tNav('breadcrumbs.dashboard'), href: `/${locale}/dashboard` },
            { label: tPage('title') },
          ]}
        />
        <div className="mt-3">
          <Heading
            id="dashboard-subscription-title"
            level="h1"
            className="text-3xl sm:text-4xl"
          >
            {tPage('title')}
          </Heading>
          <p className="mt-2 text-base text-muted-foreground sm:text-lg">
            {tPage('subline')}
          </p>
        </div>

        {user ? (
          cardState ? (
            <div className="mt-8 max-w-2xl">
              <MonthlySubscriptionCard initial={cardState} />
            </div>
          ) : (
            <div className="mt-8 max-w-2xl">
              <p className="text-sm text-muted-foreground">{tPage('empty')}</p>
            </div>
          )
        ) : (
          <div className="mt-8 max-w-2xl">
            <p className="text-sm text-muted-foreground">{tPage('signIn')}</p>
          </div>
        )}

        <section
          aria-labelledby="dashboard-subscription-explainer-title"
          className="mt-12 max-w-2xl"
        >
          <div className="mb-4 flex items-center gap-2">
            <Repeat
              className="h-5 w-5 text-[color:var(--brand-accent)]"
              aria-hidden={true}
            />
            <Heading
              id="dashboard-subscription-explainer-title"
              level="h2"
              className="text-xl sm:text-2xl"
            >
              {tPage('explainerTitle')}
            </Heading>
          </div>
          <ul
            role="list"
            className="space-y-2 text-sm text-muted-foreground sm:text-base"
          >
            <li>• {tPage('explainerCancel')}</li>
            <li>• {tPage('explainerNoRollover')}</li>
            <li>• {tPage('explainerPastDue')}</li>
          </ul>
        </section>
      </Container>
    </Section>
  );
}

/**
 * Map the raw `StudentSubscriptionView` row into the discriminated
 * state shape the card consumes.
 *
 *   - `cancelled` status → `cancelled`.
 *   - `past_due` status   → `past_due`.
 *   - status active/trialing AND cancel_at_period_end=true →
 *     `active_cancelling`.
 *   - status active/trialing AND cancel_at_period_end=false →
 *     `active`.
 */
function resolveState(
  sub: NonNullable<Awaited<ReturnType<typeof getStudentSubscription>>>,
): MonthlySubscriptionState {
  if (sub.status === 'cancelled' || sub.status === 'incomplete_expired') {
    return { kind: 'cancelled', cancelled_at: sub.cancelled_at };
  }
  if (sub.status === 'past_due') {
    return {
      kind: 'past_due',
      current_period_end: sub.current_period_end,
      grace_period_ends_at: sub.grace_period_ends_at,
    };
  }
  if (sub.cancel_at_period_end) {
    return {
      kind: 'active_cancelling',
      current_period_end: sub.current_period_end,
      cancelled_at: sub.cancelled_at,
    };
  }
  return { kind: 'active', current_period_end: sub.current_period_end };
}
