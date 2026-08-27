import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import {
  ApiError,
  Forbidden,
  NotFound,
  describeError,
  rlsErrorToForbidden,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { ListNotificationsQuery } from '@/lib/validations/notifications';

// =====================================================================
// Sprint 7 — M5.2 In-app Notification Feed — service layer.
//
// Architecture
// ------------
// - All reads + writes go through the RLS-respecting SSR Supabase
//   client (`createSupabaseServerClientUntyped`). The user is
//   always identified by `auth.uid()`.
// - RLS policies on `public.notifications`:
//     * SELECT  → `auth.uid() = user_id or public.is_admin()`
//     * UPDATE  → same (with check)
//     * INSERT  → `public.is_admin() or user_id = auth.uid()`
//   This means a user cannot read, mark, or modify another user's
//   notifications; the database enforces it.
// - Read helpers are `cache()`-wrapped so multiple RSC pages in the
//   same render share one roundtrip (matches the pattern in
//   services/student/tutor-change.ts).
// - Write helpers are NOT cache()-wrapped and throw typed ApiErrors
//   (matches the pattern in services/admin/tutor-change.ts).
// - Type-safety note: the untyped Supabase factory returns
//   `never`-typed chains for tables not in the hand-maintained
//   `Database` type. We use `as never` casts at the boundary (CLAUDE
//   §3.9, documented escape hatch in services/admin/tutors.ts) and
//   re-cast rows at the consumer. This keeps the route layer and
//   the RSC pages free of `any`.
//
// Out of scope for this slice (explicitly not invented)
// ------------------------------------------------------
// - No new SaaS (Sentry / Upstash stay out per CLAUDE §2.4).
// - No email mirror — the in-app notification is the only delivery
//   channel. Email rendering stays in n8n (CLAUDE §2.3).
// - No notification preferences / mute — the user does not get to
//   pick which types they receive; the platform sends all of them
//   in-app. (If the client later wants preferences, that is a
//   separate slice.)
// =====================================================================

/** All currently-known notification types. Free-form `text` in DB,
 *  but we narrow here so the UI can render a stable icon + label
 *  per type. New types fall through to the generic "system" icon. */
export type NotificationType =
  | 'booking_reminder'
  | 'tutor_change_sla_breach'
  | string; // forward-compatible: the DB accepts any text type.

/** Row shape returned by the `notifications` select. */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  sent_at: string;
  created_at: string;
}

/** Strongly-typed shape consumed by the RSC dashboard / admin / API. */
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  subject: string | null;
  body: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  sent_at: string;
  created_at: string;
  /** Derived: true when `read_at === null`. */
  unread: boolean;
}

const NOTIFICATION_SELECT = [
  'id',
  'user_id',
  'type',
  'channel',
  'subject',
  'body',
  'payload',
  'read_at',
  'sent_at',
  'created_at',
].join(', ');

/** Default page size. Kept in sync with the Zod query schema's max. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    channel: row.channel,
    subject: row.subject ?? null,
    body: row.body ?? null,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    read_at: row.read_at ?? null,
    sent_at: row.sent_at,
    created_at: row.created_at,
    unread: row.read_at === null || row.read_at === undefined,
  };
}

/** Pure helper. Exported for unit tests. */
export function formatRelativeTime(
  iso: string,
  now: number = Date.now(),
  locale: string = 'en',
): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diffSec = Math.round((now - t) / 1000);
  if (diffSec < 0) {
    // Future timestamp — clamp to "just now" so the UI never
    // shows a negative duration. This can happen when a server
    // clock is slightly ahead of the DB clock.
    return formatUnit(0, 'justNow', locale);
  }
  // A 0-second delta is "just now" by convention — never
  // "0 seconds ago" or "0 minutes ago".
  if (diffSec === 0) return formatUnit(0, 'justNow', locale);
  if (diffSec < 60) return formatUnit(diffSec, 'seconds', locale);
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return formatUnit(diffMin, 'minutes', locale);
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return formatUnit(diffHour, 'hours', locale);
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return formatUnit(diffDay, 'days', locale);
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return formatUnit(diffWeek, 'weeks', locale);
  // Older than ~5 weeks — fall back to the absolute date.
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

interface RelativeUnit {
  /** Singular key used in messages (when count === 1). */
  one: string;
  /** Plural key used in messages (when count !== 1). */
  many: string;
  /** Zero / "just now" key (when count === 0). */
  zero: string;
}

const UNITS_EN: Record<string, RelativeUnit> = {
  justNow: { one: 'just now', many: 'just now', zero: 'just now' },
  seconds: { one: '1 second ago', many: '{n} seconds ago', zero: 'just now' },
  minutes: { one: '1 minute ago', many: '{n} minutes ago', zero: 'just now' },
  hours:   { one: '1 hour ago',   many: '{n} hours ago',   zero: 'just now' },
  days:    { one: '1 day ago',    many: '{n} days ago',    zero: 'today' },
  weeks:   { one: '1 week ago',   many: '{n} weeks ago',   zero: 'this week' },
};

const UNITS_FR: Record<string, RelativeUnit> = {
  justNow: { one: "à l'instant", many: "à l'instant", zero: "à l'instant" },
  seconds: { one: 'il y a 1 seconde', many: 'il y a {n} secondes', zero: "à l'instant" },
  minutes: { one: 'il y a 1 minute',  many: 'il y a {n} minutes',  zero: "à l'instant" },
  hours:   { one: 'il y a 1 heure',   many: 'il y a {n} heures',   zero: "à l'instant" },
  days:    { one: 'il y a 1 jour',    many: 'il y a {n} jours',    zero: "aujourd'hui" },
  weeks:   { one: 'il y a 1 semaine', many: 'il y a {n} semaines', zero: 'cette semaine' },
};

function formatUnit(
  count: number,
  unitKey: keyof typeof UNITS_EN,
  locale: string,
): string {
  const table = locale.startsWith('fr') ? UNITS_FR : UNITS_EN;
  const unit = table[unitKey];
  // `unit` is the result of an index access on a `Record`; with
  // `noUncheckedIndexedAccess: true` it is `RelativeUnit | undefined`.
  // The lookup is exhaustive over the keys we actually pass — fall
  // back to the English string so a missing key never throws.
  if (!unit) {
    const fallback = UNITS_EN[unitKey];
    if (!fallback) return String(count);
    const t = count === 1 ? fallback.one : fallback.many;
    return t.replace('{n}', String(count));
  }
  const template = count === 1 ? unit.one : unit.many;
  return template.replace('{n}', String(count));
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export interface ListNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  before?: string;
}

/** List the signed-in user's own notifications, newest first. */
export const listMyNotifications = cache(
  async (
    opts: ListNotificationsOptions = {},
  ): Promise<ReadonlyArray<Notification>> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const limit = clampLimit(opts.limit ?? DEFAULT_LIMIT);
      let query = supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .order('sent_at', { ascending: false })
        .limit(limit);
      if (opts.unreadOnly === true) {
        query = query.is('read_at', null);
      }
      if (opts.before) {
        query = query.lt('sent_at', opts.before);
      }
      const { data, error } = await query;
      if (error) {
        logger.warn('listMyNotifications failed', { error: describeError(error) });
        return [];
      }
      const rows = (data ?? []) as ReadonlyArray<NotificationRow>;
      return rows.map(rowToNotification);
    } catch (e) {
      logger.warn('listMyNotifications threw', { error: describeError(e) });
      return [];
    }
  },
);

/** Unread count for the bell badge. Cheap — uses `count: 'exact'`,
 *  `head: true` so the body is not transferred. */
export const getMyUnreadCount = cache(
  async (): Promise<number> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) {
        logger.warn('getMyUnreadCount failed', { error: describeError(error) });
        return 0;
      }
      return typeof count === 'number' ? count : 0;
    } catch (e) {
      logger.warn('getMyUnreadCount threw', { error: describeError(e) });
      return 0;
    }
  },
);

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  const i = Math.trunc(n);
  if (i < 1) return 1;
  if (i > MAX_LIMIT) return MAX_LIMIT;
  return i;
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

/**
 * Mark a single notification as read for the signed-in user.
 * RLS guarantees the user can only update their own row; the
 * service still re-checks ownership defensively so a future RLS
 * regression does not leak ownership logic to the route layer.
 */
export async function markAsRead(id: string): Promise<Notification> {
  const supabase = await createSupabaseServerClientUntyped();

  // Load the row first so we can return the post-update shape and
  // verify ownership explicitly.
  const { data: existing, error: loadErr } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    logger.error('markAsRead load failed', {
      id,
      error: describeError(loadErr),
    });
    throw new ApiError(500, 'server_error', 'Unable to load notification.');
  }
  if (!existing) throw NotFound('Notification not found.');
  const row = existing as unknown as NotificationRow;

  // Ownership check — the SSR client runs as auth.uid() so RLS has
  // already filtered, but we re-check for defence-in-depth.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== row.user_id) {
    throw Forbidden('You do not own this notification.');
  }

  // No-op when already read — avoid the UPDATE roundtrip and the
  // trigger noise.
  if (row.read_at) return rowToNotification(row);

  const { data: updated, error: updateErr } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() } as never)
    .eq('id', id)
    .select(NOTIFICATION_SELECT)
    .single();

  if (updateErr || !updated) {
    const rls = rlsErrorToForbidden(updateErr, 'mark notification as read');
    if (rls) throw rls;
    logger.error('markAsRead update failed', {
      id,
      error: describeError(updateErr),
    });
    throw new ApiError(500, 'server_error', 'Unable to mark notification as read.');
  }
  return rowToNotification(updated as unknown as NotificationRow);
}

/**
 * Mark every unread notification for the signed-in user as read.
 * Returns the number of rows updated. RLS scopes the UPDATE to
 * the caller's own rows — they cannot accidentally (or
 * deliberately) mark someone else's notifications.
 */
export async function markAllAsRead(): Promise<{ updated: number }> {
  const supabase = await createSupabaseServerClientUntyped();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'unauthorized', 'Sign in required.');

  const nowIso = new Date().toISOString();
  // PostgREST does not return the affected row count for UPDATE;
  // we count by issuing a follow-up SELECT of the rows we just
  // touched (read_at IS NULL OR read_at < nowIso — i.e. the rows
  // we may have flipped). For practical purposes this is bounded
  // by the user's recent activity.
  const { error: updateErr } = await supabase
    .from('notifications')
    .update({ read_at: nowIso } as never)
    .is('read_at', null);

  if (updateErr) {
    const rls = rlsErrorToForbidden(updateErr, 'mark all notifications as read');
    if (rls) throw rls;
    logger.error('markAllAsRead update failed', {
      error: describeError(updateErr),
    });
    throw new ApiError(
      500,
      'server_error',
      'Unable to mark all notifications as read.',
    );
  }

  // Best-effort follow-up count — we count rows whose read_at is
  // now >= nowIso. If this fails (e.g. clock skew), we still
  // return a success with `updated: 0` rather than failing the
  // request — the UPDATE succeeded.
  try {
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .gte('read_at', nowIso);
    return { updated: typeof count === 'number' ? count : 0 };
  } catch (e) {
    logger.warn('markAllAsRead count failed', { error: describeError(e) });
    return { updated: 0 };
  }
}

// Re-export the input type so route handlers can pull both
// schemas from the same module if they prefer.
export type { ListNotificationsQuery };
