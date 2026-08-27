'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { NotificationItem } from '@/components/shared/notification-item';

// =====================================================================
// Sprint 7 — M5.2 Notification bell.
//
// Behaviour
// ---------
// - Mounts inside `DashboardHeader` (and `AdminHeader`) on the
//   right-hand cluster. The trigger is a labelled icon button.
// - The bell reads its initial state from props passed in by the
//   RSC wrapper (so the badge is correct on first paint — no
//   client-side flash). It refreshes on mount + every 60 s.
// - Opening the dropdown previews the last 5 notifications
//   (newest first). "Mark all as read" and "See all" links are
//   wired to the same endpoints the full feed uses.
//
// Authorisation
// -------------
// The bell does NOT bypass RLS. All network calls go through
// /api/notifications/* which uses the SSR Supabase client. A
// signed-out user never reaches this component because the
// surrounding `DashboardShell` / `AdminShell` redirects to
// /auth/login.
// =====================================================================

export interface NotificationBellProps {
  /** Pre-rendered, server-side unread count. Drives the badge on
   *  first paint so the user never sees "0" flicker to "3". */
  initialUnreadCount: number;
  /** Pre-rendered preview list (last 5). Drives the popover on
   *  first paint — no loading skeleton. */
  initialPreview: ReadonlyArray<{
    id: string;
    type: string;
    subject: string | null;
    body: string | null;
    sent_at: string;
    unread: boolean;
  }>;
  /** Locale for the popover's relative-time fallback. */
  locale: string;
  /** Locale-aware href to the full feed page. */
  feedHref: string;
  /** Locale-aware href to the "mark all as read" call to action. */
  /** When true, the bell is hidden behind a tabIndex trap so
   *  keyboard users can escape it. Default false. */
}

export function NotificationBell({
  initialUnreadCount,
  initialPreview,
  locale,
  feedHref,
}: NotificationBellProps) {
  const t = useTranslations('Notifications');
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const [preview, setPreview] =
    React.useState<ReadonlyArray<NotificationBellProps['initialPreview'][number]>>(
      initialPreview,
    );
  const [pending, setPending] = React.useState(false);

  // Refresh on mount + every 60s. The interval is intentionally
  // generous — we are not running a chat client, we are keeping
  // the badge from going stale. Tab visibility matters here.
  React.useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch('/api/notifications?limit=5', {
          credentials: 'same-origin',
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          ok: boolean;
          data: ReadonlyArray<NotificationBellProps['initialPreview'][number]>;
        };
        if (cancelled || !body.ok) return;
        setPreview(body.data);
        setUnreadCount(
          body.data.reduce((acc, n) => acc + (n.unread ? 1 : 0), 0),
        );
      } catch {
        // Network failure is non-fatal — the bell stays on the
        // last-known state until the next tick.
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') void refresh();
    }
    const id = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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
      setUnreadCount(0);
      setPreview((prev) => prev.map((n) => ({ ...n, unread: false })));
    } finally {
      setPending(false);
    }
  }

  async function onMarkOne(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      setPreview((prev) =>
        prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
      );
      setUnreadCount((c) => (c > 0 ? c - 1 : 0));
    } catch {
      // Non-fatal — the user can re-open the bell later.
    }
  }

  const count = Math.max(0, unreadCount);
  const ariaLabel =
    count > 0
      ? t('bell.unreadAria', { count })
      : t('bell.aria');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={true}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={ariaLabel}
          className="relative h-9 w-9"
        >
          <Bell className="h-5 w-5" aria-hidden={true} />
          {count > 0 ? (
            <span
              aria-hidden={true}
              className={cn(
                'absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none',
                'bg-[color:var(--brand-accent)] text-white',
              )}
            >
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            {t('bell.popoverTitle')}
          </DropdownMenuLabel>
          {count > 0 ? (
            <button
              type="button"
              onClick={onMarkAll}
              disabled={pending}
              className={cn(
                'text-xs font-medium text-[color:var(--brand-accent)] underline-offset-2 hover:underline',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
                pending && 'cursor-not-allowed opacity-50',
              )}
            >
              {t('actions.markAll')}
            </button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto p-2">
          {preview.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('empty')}
            </p>
          ) : (
            <ul role="list" className="flex flex-col gap-1">
              {preview.map((n) => (
                <li key={n.id}>
                  <NotificationItem
                    id={n.id}
                    type={n.type}
                    subject={n.subject}
                    body={n.body}
                    sent_at={n.sent_at}
                    unread={n.unread}
                    locale={locale}
                    onSelect={() => onMarkOne(n.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="p-2">
          <Link
            href={feedHref}
            className={cn(
              'block rounded-md px-2 py-2 text-center text-sm font-medium',
              'text-[color:var(--brand-accent)] hover:bg-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            {t('actions.seeAll')}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small wrapper used by the SSR pass: lets the RSC header include
 *  the bell without having to know about the dropdown internals. */
export function NotificationBellSsr(props: NotificationBellProps) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return <NotificationBell {...props} />;
}
