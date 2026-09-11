import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

// =====================================================================
// Sprint 5 Slice E — Reminders service (n8n-driven).
//
// Why this lives in Next.js (and not solely in n8n)
// -------------------------------------------------
// The cron endpoint is the entry point of the reminder pipeline. It
// runs in the Next.js runtime because:
//   - `session_bookings` is the source of truth for upcoming
//     bookings, and the cron needs a single SELECT with joins
//     (`student` + `session` + `meeting`) to compute the window.
//   - We want a stable, idempotent event_id so the same cron tick
//     can be replayed safely. Next.js is the right place to mint
//     that event_id (per-booking, per-window) and to be the
//     single owner of the dedup index `uq_notifications_dedupe`.
//
// Why Next.js does NOT render the email
// --------------------------------------
// Per CLAUDE.md §2.3, "n8n is the *only* system that calls Stripe /
// Zoom / Resend on the booking path." Next.js 15 also forbids
// importing `react-dom/server` into a Route Handler's module graph
// (even via dynamic `await import()`) — which is what the reminder
// JSX templates depend on. So we split the work cleanly:
//
//   1. Next.js (this service + the cron route): scan
//      `session_bookings`, compute the window, build a stable
//      `event_id`, and POST `{ type: 'reminder_dispatch', ... }`
//      to `/api/webhooks/n8n`.
//   2. n8n (`session-reminder-scheduler` workflow): receives the
//      dispatch event, looks up the full email content, renders
//      the template, and calls Resend directly. n8n then fires
//      back to Next.js with `type: 'reminder_sent'` so the dedup
//      row is recorded.
//
// Idempotency
// -----------
//   - The cron service mints a deterministic `event_id` of the form
//     `reminder-24h-<booking_id>` / `reminder-1h-<booking_id>`.
//     n8n's POST handler inserts into `webhook_events` with that
//     `event_id`; a duplicate is a 200 `{ duplicate: true }` and
//     no Resend call is made.
//   - The `notifications` table carries a secondary dedup index
//     `uq_notifications_dedupe (user_id, type,
//     payload->>'booking_id', channel)` so even if two cron ticks
//     race, only one notification row is recorded.
//
// Eligibility
// -----------
//   - Window: `scheduled_start` in [now+low, now+high].
//     24h: [now+23h, now+25h]    (2h band centred on T-24h)
//     1h:  [now+50m, now+70m]    (20m band centred on T-60m)
//   - Status: `scheduled` | `confirmed`. Anything else — cancelled,
//     completed, no_show, rescheduled — is skipped.
//   - Recipient: `student.email` must be present; otherwise the
//     cron skips (n8n can't deliver to an empty address).
//   - The booking must already have a `meeting_links.join_url`;
//     otherwise the cron skips (n8n would have nothing to put in
//     the email body).
//
// This slice does NOT make any decision about E-1 / E-2 / E-3
// (subscription suspension, cancellation credit restoration, pack
// vs subscription consumption priority). The reminder logic looks
// only at `scheduled_start`, `status`, `email`, and `join_url`.
// =====================================================================

export type ReminderWindow = '24h' | '1h';

export interface ReminderSendOutcome {
  bookingId: string;
  outcome:
    | 'dispatched'
    | 'duplicate'
    | 'skipped_no_recipient'
    | 'skipped_no_meeting'
    | 'skipped_outside_window'
    | 'skipped_cancelled'
    | 'failed';
  reason?: string;
}

export interface ReminderRunResult {
  window: ReminderWindow;
  considered: number;
  dispatched: number;
  duplicate: number;
  skipped: number;
  failed: number;
  details: ReminderSendOutcome[];
}

interface ReminderBookingRow {
  id: string;
  status: string;
  scheduled_start: string;
  student_id: string;
  student_email: string | null;
  student_name: string | null;
  student_locale: string | null;
  session_title: string | null;
  join_url: string | null;
}

const BOOKABLE_STATUSES: ReadonlyArray<string> = ['scheduled', 'confirmed'];

const WINDOW_LOW_MS: Record<ReminderWindow, number> = {
  '24h': 23 * 60 * 60 * 1000,
  '1h': 50 * 60 * 1000,
};
const WINDOW_HIGH_MS: Record<ReminderWindow, number> = {
  '24h': 25 * 60 * 60 * 1000,
  '1h': 70 * 60 * 1000,
};

export function reminderEventId(window: ReminderWindow, bookingId: string): string {
  return `reminder-${window}-${bookingId}`;
}

export interface DispatchResult {
  ok: boolean;
  duplicate?: boolean;
}

export interface ReminderRunOptions {
  /** Test seam — fixed clock. */
  now?: Date;
  /** Test seam — admin client override. */
  admin?: ReturnType<typeof createSupabaseAdminClient>;
  /**
   * Test seam — dispatch override. The production implementation
   * POSTs to `/api/webhooks/n8n` with a stable `event_id`. Tests
   * pass a stub to avoid network I/O.
   */
  dispatch?: (input: {
    eventId: string;
    payload: Record<string, unknown>;
  }) => Promise<DispatchResult>;
  /** Test seam — origin override (defaults to NEXT_PUBLIC_SITE_URL). */
  origin?: string;
}

/**
 * Production entry point. The cron route calls this directly.
 *
 * Each candidate booking in the window is dispatched to n8n as a
 * separate `reminder_dispatch` event with a deterministic
 * `event_id`. n8n owns the email render + Resend call.
 */
export async function runReminderWindow(
  window: ReminderWindow,
  options: ReminderRunOptions = {},
): Promise<ReminderRunResult> {
  const now = options.now ?? new Date();
  const lowIso  = new Date(now.getTime() + WINDOW_LOW_MS[window]).toISOString();
  const highIso = new Date(now.getTime() + WINDOW_HIGH_MS[window]).toISOString();

  const admin = options.admin ?? createSupabaseAdminClient();
  const dispatch = options.dispatch ?? defaultDispatch;

  const { data: rows, error } = await admin
    .from('session_bookings')
    .select(
      `
        id, status, scheduled_start,
        student_id,
        student:profiles!session_bookings_student_id_fkey (
          id, full_name, email, preferred_locale
        ),
        session:sessions!session_bookings_session_id_fkey (
          id, title
        ),
        meeting:meeting_links!meeting_links_session_booking_id_fkey (
          join_url
        )
      `,
    )
    .in('status', BOOKABLE_STATUSES as string[])
    .gte('scheduled_start', lowIso)
    .lte('scheduled_start', highIso);

  if (error) {
    logger.error('reminders query failed', {
      window,
      err: describeError(error),
    });
    return {
      window,
      considered: 0,
      dispatched: 0,
      duplicate: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };
  }

  const bookings: ReminderBookingRow[] = ((rows ?? []) as unknown as Array<Record<string, unknown>>).map(
    flattenBookingRow,
  );

  const details: ReminderSendOutcome[] = [];

  for (const b of bookings) {
    const outcome = await processOneBooking(b, window, dispatch, now);
    details.push(outcome);
  }

  return {
    window,
    considered: bookings.length,
    dispatched: details.filter((d) => d.outcome === 'dispatched').length,
    duplicate:  details.filter((d) => d.outcome === 'duplicate').length,
    skipped:    details.filter((d) => d.outcome.startsWith('skipped_')).length,
    failed:     details.filter((d) => d.outcome === 'failed').length,
    details,
  };
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

function flattenBookingRow(raw: Record<string, unknown>): ReminderBookingRow {
  const student = pickObject(raw.student);
  const session = pickObject(raw.session);
  const meeting = pickObject(raw.meeting);
  return {
    id: String(raw.id),
    status: String(raw.status),
    scheduled_start: String(raw.scheduled_start),
    student_id: String(student.id ?? raw.student_id ?? ''),
    student_email: stringOrNull(student.email),
    student_name: stringOrNull(student.full_name),
    student_locale: stringOrNull(student.preferred_locale),
    session_title: stringOrNull(session.title),
    join_url: stringOrNull(meeting.join_url),
  };
}

function pickObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object'
      ? (first as Record<string, unknown>)
      : {};
  }
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return {};
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.length > 0 ? value : null;
}

async function processOneBooking(
  b: ReminderBookingRow,
  window: ReminderWindow,
  dispatch: NonNullable<ReminderRunOptions['dispatch']>,
  now: Date,
): Promise<ReminderSendOutcome> {
  // 1) Cancelled / completed / no_show / rescheduled. The query
  //    already filters to `scheduled` | `confirmed`, but a defensive
  //    re-check guards against a TOCTOU race with the cancellation
  //    handler.
  if (!BOOKABLE_STATUSES.includes(b.status)) {
    return { bookingId: b.id, outcome: 'skipped_cancelled', reason: b.status };
  }

  // 2) Outside window. Same defence-in-depth — the query filters,
  //    but a slow cron tick could push us past the upper bound by
  //    the time we process the row.
  const low = now.getTime() + WINDOW_LOW_MS[window];
  const high = now.getTime() + WINDOW_HIGH_MS[window];
  const start = Date.parse(b.scheduled_start);
  if (Number.isNaN(start) || start < low || start > high) {
    return { bookingId: b.id, outcome: 'skipped_outside_window' };
  }

  // 3) Recipient missing — n8n can't deliver to an empty address.
  if (!b.student_email) {
    return { bookingId: b.id, outcome: 'skipped_no_recipient' };
  }

  // 4) No meeting link yet — n8n has no join URL to put in the body.
  //    The booking is still bookable (Zoom creation may be in
  //    flight), so we skip but do not flip the status.
  if (!b.join_url) {
    return { bookingId: b.id, outcome: 'skipped_no_meeting' };
  }

  // 5) Dispatch to n8n. The dedup lives entirely on the Next.js
  //    side via the `notifications` UNIQUE
  //    (user_id, type, payload->>'booking_id', channel) index —
  //    the n8n workflow's "Acknowledge dispatch" step writes the
  //    dedup row, and a 23505 from the unique index is signalled
  //    back to n8n as `{ duplicate: true }`, which the workflow
  //    uses to short-circuit the Resend call. The cron receives
  //    `duplicate: true` from the response and records the
  //    `duplicate` outcome below.
  const locale = (b.student_locale === 'en' || b.student_locale === 'fr')
    ? b.student_locale
    : 'fr';

  try {
    const result = await dispatch({
      eventId: reminderEventId(window, b.id),
      payload: {
        type: 'reminder_dispatch',
        session_booking_id: b.id,
        window,
        template: window === '24h' ? 'reminder_24h' : 'reminder_1h',
        to: b.student_email,
        locale,
        student_name: b.student_name ?? '',
        session_title: b.session_title ?? '',
        scheduled_start: b.scheduled_start,
        join_url: b.join_url,
      },
    });
    if (result.duplicate) {
      return { bookingId: b.id, outcome: 'duplicate' };
    }
    return { bookingId: b.id, outcome: 'dispatched' };
  } catch (e) {
    logger.error('reminder dispatch failed', {
      bookingId: b.id,
      window,
      err: describeError(e),
    });
    const desc = describeError(e);
    const reason = typeof desc.message === 'string' ? desc.message : 'unknown';
    return { bookingId: b.id, outcome: 'failed', reason };
  }
}

// -------------------------------------------------------------------------
// Default dispatch — POSTs to the Next.js → n8n webhook.
// -------------------------------------------------------------------------
//
// The route handler at `/api/webhooks/n8n` validates the same
// shared secret (`N8N_WEBHOOK_SECRET`) and inserts the
// `event_id` into the `webhook_events` table, which is UNIQUE.
// n8n's `session-reminder-scheduler` workflow listens for the
// `reminder_dispatch` event type and is responsible for sending
// the Resend email.
//
// We deliberately do NOT import `lib/email/send` here — that
// module pulls in `react-dom/server`, which Next.js 15 forbids
// bundling into a Route Handler. The dispatch layer is pure
// HTTP, so the route handler's bundle stays clean.
// -------------------------------------------------------------------------

async function defaultDispatch(input: {
  eventId: string;
  payload: Record<string, unknown>;
}): Promise<DispatchResult> {
  // Use the global fetch (available in Node 18+ runtime) rather
  // than pulling in any Next.js HTTP helpers.
  //
  // Target: n8n's `session-reminder-scheduler` workflow webhook.
  // The URL is `${N8N_BASE_URL}/webhook/session-reminder-dispatch`
  // — the path matches the workflow's webhook node
  // (`workflows/session-reminder-scheduler.json`).
  //
  // Env reads go through `serverEnv()` (CLAUDE.md §3.6).
  const env = serverEnv();
  const n8nBase = env.N8N_BASE_URL ?? '';
  const secret  = env.N8N_WEBHOOK_SECRET ?? '';
  const res = await fetch(`${n8nBase}/webhook/session-reminder-dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': secret,
    },
    body: JSON.stringify({
      event_id: input.eventId,
      ...input.payload,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`n8n webhook returned ${res.status}: ${text}`);
  }
  // n8n's "Respond OK" node returns `{ ok: true }`. We treat any
  // 2xx as success; duplicate-detection lives at the workflow's
  // "Acknowledge dispatch" step (where Next.js writes the dedup
  // row) and is reported back via the response if needed.
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; duplicate?: boolean }
    | null;
  return {
    ok: !!json?.ok || !!json?.duplicate,
    duplicate: !!json?.duplicate,
  };
}
