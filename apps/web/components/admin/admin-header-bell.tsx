import * as React from 'react';
import { getLocale } from 'next-intl/server';
import { requireAdmin } from '@/hooks/use-require-user';
import {
  listMyNotifications,
  getMyUnreadCount,
} from '@/services/notifications';
import { NotificationBell } from '@/components/dashboard/notification-bell';

// =====================================================================
// Sprint 7 — Server wrapper for the notification bell that mounts
// in `AdminHeader`.
//
// Mirrors `DashboardHeaderBell` exactly, except:
//   * `requireAdmin()` gates the bell on the admin role guard (a
//     super_admin who happens to be viewing their own profile
//     would also pass — admins see their OWN notifications only,
//     scoped by RLS).
//   * The feed href points at `/admin/notifications` so the "see
//     all" link lands on the admin surface.
//
// The admin role-guard is the SAME `requireAdmin()` the rest of
// /admin uses — there is no separate gating path for the bell.
// =====================================================================

const PREVIEW_LIMIT = 5;

export async function AdminHeaderBell() {
  let signedIn = false;
  try {
    await requireAdmin();
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
  const previewItems = preview.data;
  return (
    <NotificationBell
      locale={locale}
      initialUnreadCount={unread}
      initialPreview={previewItems.map((n) => ({
        id: n.id,
        type: n.type,
        subject: n.subject,
        body: n.body,
        sent_at: n.sent_at,
        unread: n.unread,
      }))}
      feedHref={`/${locale}/admin/notifications`}
    />
  );
}
