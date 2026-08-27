import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { isLocale } from '@/i18n';
import { requireAdmin } from '@/hooks/use-require-user';
import { Container } from '@/components/shared/container';
import { Section } from '@/components/shared/section';
import { NotificationsList } from '@/components/dashboard/notifications-list';
import { BRAND } from '@/lib/constants/brand';
import {
  listMyNotifications,
  formatRelativeTime,
} from '@/services/notifications';

// =====================================================================
// Sprint 7 — /admin/notifications — admin's own notification feed.
//
// Mirrors /dashboard/notifications but lives under the admin
// surface. RLS scopes the read to the signed-in admin — the
// page shows the admin's OWN notifications (system notifications
// addressed to the admin user), not every notification in the
// system. The `notifications` table is intentionally per-user;
// there is no admin-only broadcast table in this slice.
//
// The bell's "See all" link points here, so this page is the
// canonical landing spot for admin notification triage.
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
    alternates: { canonical: `/${locale}/admin/notifications` },
    robots: { index: false, follow: false },
  };
}

export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  // Authoritative admin gate. The middleware also redirects
  // non-admins; this is defence-in-depth.
  await requireAdmin();

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
        <div className="mt-6">
          <NotificationsList initialItems={preview} locale={locale} />
        </div>
      </Container>
    </Section>
  );
}
