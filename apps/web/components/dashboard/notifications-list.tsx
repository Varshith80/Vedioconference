'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { NotificationItem } from '@/components/shared/notification-item';

// =====================================================================
// Sprint 7 — M5.2 Full notification feed (client island).
//
// Behaviour
// ---------
// - Renders the full server-prefetched list on first paint (no
//   loading skeleton).
// - Tracks optimistic local state for "Mark all as read" + per-row
//   mark-as-read; on success it mirrors the new state in the UI
//   without a refetch.
// - "See all" CTA in the bell popover links to /dashboard/notifications
//   (or /admin/notifications when used in the admin surface).
//
// This component intentionally does NOT call into n8n, Resend, or
// any other SaaS — it is the read + state-management surface only.
// =====================================================================

export interface NotificationsListItem {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  sent_at: string;
  unread: boolean;
  /** Server-precomputed relative-time string (locale-aware). */
  relative_time: string;
}

export interface NotificationsListProps {
  initialItems: ReadonlyArray<NotificationsListItem>;
  locale: string;
}

export function NotificationsList({
  initialItems,
  locale,
}: NotificationsListProps) {
  const t = useTranslations('Notifications');
  const [items, setItems] = React.useState<ReadonlyArray<NotificationsListItem>>(
    initialItems,
  );
  const [pending, setPending] = React.useState(false);

  const unreadCount = React.useMemo(
    () => items.reduce((acc, n) => acc + (n.unread ? 1 : 0), 0),
    [items],
  );

  async function onMarkAll() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
    } finally {
      setPending(false);
    }
  }

  async function onMarkOne(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    );
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {
      // Best-effort — re-sync on next list refresh.
    }
  }

  return (
    <section aria-labelledby="notifications-feed-title" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="notifications-feed-title"
            className="text-2xl font-semibold sm:text-3xl"
          >
            {t('feed.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('feed.subline', { unread: unreadCount })}
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMarkAll}
            disabled={pending}
          >
            {pending ? t('actions.markAllPending') : t('actions.markAll')}
          </Button>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div
          className={cn(
            'rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground',
          )}
        >
          {t('empty')}
        </div>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem
                id={n.id}
                type={n.type}
                subject={n.subject}
                body={n.body}
                sent_at={n.sent_at}
                unread={n.unread}
                locale={locale}
                relativeTime={n.relative_time}
                onSelect={() => onMarkOne(n.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
