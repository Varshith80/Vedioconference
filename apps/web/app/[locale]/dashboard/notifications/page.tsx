import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { Breadcrumbs } from '@/components/dashboard/breadcrumbs';
import { NotificationsList } from '@/components/dashboard/notifications-list';
import { BRAND } from '@/lib/constants/brand';
import { requireProfile } from '@/hooks/use-require-user';
import {
  listMyNotifications,
  formatRelativeTime,
} from '@/services/notifications';

// =====================================================================
// Sprint 7 — /dashboard/notifications — student full feed.
//
// Renders the SSR-prefetched list (no skeleton). The list
// component is a client island so it can do optimistic
// mark-as-read + mark-all-as-read.
//
// RLS scopes the read to the signed-in user — the page cannot
// leak another user's notifications even if the URL is shared.
// =====================================================================

const PAGE_SIZE = 50;

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Notifications' });
  return {
    title: `${t('feed.title')} — ${BRAND.name}`,
    description: t('feed.subline', { unread: 0 }),
    alternates: { canonical: `/${locale}/dashboard/notifications` },
    robots: { index: false, follow: false },
  };
}

export default async function DashboardNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // requireProfile() also redirects anonymous users — but the
  // surrounding layout already does that. This call is here for
  // defence-in-depth on any future caller that bypasses the layout.
  await requireProfile();

  const t = await getTranslations('Notifications');
  const tNav = await getTranslations('Nav');

  const items = await listMyNotifications({ limit: PAGE_SIZE });
  const preview = items.map((n) => ({
    id: n.id,
    type: n.type,
    subject: n.subject,
    body: n.body,
    sent_at: n.sent_at,
    unread: n.unread,
    relative_time: formatRelativeTime(n.sent_at, Date.now(), locale),
  }));

  return (
    <Section spacing="default" aria-labelledby="notifications-feed-title">
      <Container>
        <Breadcrumbs
          items={[
            { label: tNav('breadcrumbs.home'), href: '/' },
            {
              label: tNav('breadcrumbs.dashboard'),
              href: `/${locale}/dashboard`,
            },
            { label: t('feed.title') },
          ]}
        />
        <div className="mt-6">
          <NotificationsList initialItems={preview} locale={locale} />
        </div>
      </Container>
    </Section>
  );
}
