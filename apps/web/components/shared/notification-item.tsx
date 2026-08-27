'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';

// =====================================================================
// Sprint 7 — M5.2 Notification item (single feed row).
//
// Pure presentational. Used by:
//   - components/dashboard/notification-bell.tsx (popover preview)
//   - components/dashboard/notifications-list.tsx (full feed)
//   - app/[locale]/admin/notifications/page.tsx (admin feed)
//
// The icon is derived from `type` with a generic fallback so future
// types render without breaking. The `unread` boolean drives the
// accent border and the "unread dot" — purely visual, no extra
// data fetch.
// =====================================================================

export interface NotificationItemProps {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  sent_at: string;
  unread: boolean;
  /** Optional click handler — wired to the list page's "mark as
   *  read on click" pattern. The bell popover leaves this unset. */
  onSelect?: () => void;
  /** Used for relative-time formatter (matches the SSR locale). */
  locale: string;
  /** Override the relative-time formatter (for SSR-rendered lists). */
  relativeTime?: string;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  booking_reminder: CalendarClock,
  tutor_change_sla_breach: AlertTriangle,
};

function iconFor(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Bell;
}

export function NotificationItem({
  type,
  subject,
  body,
  sent_at,
  unread,
  onSelect,
  locale,
  relativeTime,
}: NotificationItemProps) {
  const t = useTranslations('Notifications');
  const Icon = iconFor(type);
  const typeLabel = typeLabelFor(type, t);
  const Wrapper = onSelect ? 'button' : 'div';
  return (
    <Wrapper
      type={onSelect ? 'button' : undefined}
      onClick={onSelect}
      className={cn(
        'group flex w-full items-start gap-3 rounded-md border bg-card p-3 text-left transition-colors',
        unread
          ? 'border-l-[3px] border-l-[color:var(--brand-accent)]'
          : 'border-l-[3px] border-l-transparent',
        onSelect && 'cursor-pointer hover:bg-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
      aria-label={subject ?? typeLabel}
    >
      <span
        aria-hidden={true}
        className={cn(
          'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {subject ?? typeLabel}
          </p>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            dateTime={sent_at}
          >
            {relativeTime ?? formatFallback(sent_at, locale)}
          </time>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {body ?? typeLabel}
        </p>
        {unread ? (
          <span
            aria-hidden={true}
            className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--brand-accent)]"
          />
        ) : null}
      </div>
    </Wrapper>
  );
}

function typeLabelFor(type: string, t: (k: string) => string): string {
  const knownKeys = new Set(['booking_reminder', 'tutor_change_sla_breach']);
  if (knownKeys.has(type)) {
    return t(`types.${type}`);
  }
  return t('types.system');
}

/** Best-effort fallback when no SSR-formatted relative time is
 *  provided. Matches the SSR helper shape (just now / minutes /
 *  hours / days) so the rendered string is consistent between the
 *  popover (client) and the full feed (SSR). */
function formatFallback(iso: string, locale: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffSec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return locale.startsWith('fr')
      ? `il y a ${diffMin} minutes`
      : `${diffMin} minutes ago`;
  }
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) {
    return locale.startsWith('fr')
      ? `il y a ${diffHour} heures`
      : `${diffHour} hours ago`;
  }
  const diffDay = Math.floor(diffHour / 24);
  return locale.startsWith('fr')
    ? `il y a ${diffDay} jours`
    : `${diffDay} days ago`;
}
