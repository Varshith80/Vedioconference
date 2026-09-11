import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { runReminderWindow } from '@/services/admin/reminders';

// =====================================================================
// Sprint 5 Slice E — `POST /api/cron/send-reminders`.
//
// Operator-facing scheduled job. The route is provider-agnostic:
// any HTTP-capable scheduler (Vercel Cron, an external cron service,
// GitHub Actions scheduled workflow, or a plain `cron` + curl on
// the operator's host) can call it. The route does NOT introduce
// a new SaaS dependency — the scheduler itself is a deployment-time
// choice the operator makes, and the contract is just "POST with
// `x-webhook-secret` matching `N8N_WEBHOOK_SECRET`."
//
// Why the secret is shared with the n8n webhook
// ---------------------------------------------
// The `N8N_WEBHOOK_SECRET` is the project's existing "shared
// secret for inbound system calls" convention. It is already
// provisioned in every deployment via `lib/env.ts`, and the
// n8n webhook (`/api/webhooks/n8n`) enforces the same constant.
// Reusing it keeps the security boundary identical and avoids
// introducing a new env var.
//
// What this route actually does
// -----------------------------
// 1. Validates `x-webhook-secret` (401 otherwise).
// 2. Calls `runReminderWindow('24h')` and `runReminderWindow('1h')`
//    in parallel.
// 3. Each window scans `session_bookings` for the upcoming
//    window and POSTs a `reminder_dispatch` event to
//    `/api/webhooks/n8n` with a stable `event_id`.
//
// What this route does NOT do
// ----------------------------
//   - Does NOT render or send any email. Email rendering lives in
//     n8n (per CLAUDE.md §2.3 — "n8n is the only system that
//     calls external APIs on the booking path"). The cron is the
//     dispatcher; n8n is the renderer.
//   - Does NOT modify the booking state machine, the grant state
//     machine, or any subscription/pack/cancellation policy.
//     (Those decisions — E-1, E-2, E-3 — remain BLOCKED.)
//   - Does NOT require a database migration.
//
// Idempotency / dedup
// -------------------
// Two-tiered:
//   1. `webhook_events.event_id` UNIQUE — the cron mints a
//      deterministic `reminder-<window>-<booking_id>` event id
//      per booking. A second tick returns `{ duplicate: true }`
//      and is recorded as a `duplicate` outcome (not a send).
//   2. `notifications` UNIQUE(`user_id`, `type`,
//      `payload->>'booking_id'`, `channel`) — a safety net inside
//      the `reminder_dispatch` case of the n8n webhook.
// =====================================================================

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ---- Auth: shared-secret in `x-webhook-secret` ---------------
    // The route accepts the same secret the n8n webhook does. This
    // is the existing project convention for inbound system calls.
    // We refuse to reveal which secret is expected by rejecting the
    // request immediately if the env var is unset — that means a
    // misconfigured deployment cannot be probed for whether the
    // route exists.
    const expected = serverEnv().N8N_WEBHOOK_SECRET;
    if (!expected) {
      logger.warn('cron send-reminders called but N8N_WEBHOOK_SECRET is unset');
      throw Unauthorized('Cron is not configured.');
    }
    const provided = req.headers.get('x-webhook-secret');
    if (provided !== expected) {
      throw Unauthorized('Invalid cron secret.');
    }

    // ---- Run both windows in a single tick -----------------------
    // The 24h and 1h windows are independent; we run them in
    // parallel because each only hits Supabase + the n8n webhook
    // (no shared mutable state on our side).
    const admin = createSupabaseAdminClient();
    const [r24, r1h] = await Promise.all([
      runReminderWindow('24h', { admin }),
      runReminderWindow('1h',  { admin }),
    ]);

    const summary = {
      twentyFourHour: r24,
      oneHour: r1h,
      total: {
        considered: r24.considered + r1h.considered,
        dispatched: r24.dispatched + r1h.dispatched,
        duplicate:  r24.duplicate  + r1h.duplicate,
        skipped:    r24.skipped    + r1h.skipped,
        failed:     r24.failed     + r1h.failed,
      },
      ran_at: new Date().toISOString(),
    };

    logger.info('cron send-reminders done', {
      dispatched: summary.total.dispatched,
      duplicate:  summary.total.duplicate,
      skipped:    summary.total.skipped,
      failed:     summary.total.failed,
    });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return errorResponse(e);
  }
}
