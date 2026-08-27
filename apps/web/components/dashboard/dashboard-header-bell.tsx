import * as React from 'react';
import { getLocale } from 'next-intl/server';
import { requireProfile } from '@/hooks/use-require-user';
import {
  listMyNotifications,
  getMyUnreadCount,
  formatRelativeTime,
} from '@/services/notifications';
import { NotificationBell } from '@/components/dashboard/notification-bell';

// =====================================================================
// Sprint 7 — Server wrapper for the notification bell that mounts
// in `DashboardHeader`.
//
// Why an RSC wrapper?
// -------------------
// The bell is a client component (it needs the dropdown primitive
// and a 60s polling timer). Mounting it directly in a server
// component would force us to pass the unread count + preview as
// async props, which is awkward in the header. The RSC wrapper:
//
//   1. Resolves the locale and the signed-in user.
//   2. Reads the unread count + last-5 preview via the service.
//   3. Renders the client bell with the pre-rendered values so
//      the badge is correct on first paint (no flash).
//
// RLS scopes both reads to the signed-in user — the bell cannot
// leak another user's notifications.
// =====================================================================

const PREVIEW_LIMIT = 5;

export async function DashboardHeaderBell() {
  // If the user is not signed in, return nothing — the surrounding
  // shell already redirects them to /auth/login. Calling
  // `requireProfile()` here would throw a NEXT_REDIRECT inside a
  // server component, which Next 15 surfaces as a dev-overlay
  // console error. Returning `null` is silent and correct.
  let signedIn = false;
  try {
    await requireProfile();
    signedIn = true;
  } catch {
    signedIn = false;
  }
  if (!signedIn) return null;
  const locale = await getLocale();
  const [unread, preview] = await Promise.all([
    getMyUnreadCount(),
    listMyNotifications({ limit: PREVIEW_LIMIT }),
  ]);
  return (
    <NotificationBell
      locale={locale}
      initialUnreadCount={unread}
      initialPreview={preview.map((n) => ({
        id: n.id,
        type: n.type,
        subject: n.subject,
        body: n.body,
        sent_at: n.sent_at,
        unread: n.unread,
      }))}
      feedHref={`/${locale}/dashboard/notifications`}
    />
  );
}

// Re-export the relative-time formatter so RSC pages can format
// previews using the same string the client component falls back
// to. Keeps the SSR + CSR output identical.
export { formatRelativeTime };
