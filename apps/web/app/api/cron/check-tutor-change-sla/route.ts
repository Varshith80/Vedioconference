import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/utils/api';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { Unauthorized, describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';
import { getOverduePendingRequests } from '@/services/admin/tutor-change';

// =====================================================================
// Sprint 6 — `POST /api/cron/check-tutor-change-sla`.
//
// Operator-facing scheduled job. Provider-agnostic: any HTTP-capable
// scheduler (Vercel Cron, an external cron service, GitHub Actions,
// plain `cron` + curl) can call it. The contract is the same as
// the existing `POST /api/cron/send-reminders` route: a POST with
// `x-webhook-secret` matching `N8N_WEBHOOK_SECRET` (the project's
// existing shared secret for inbound system calls).
//
// What it does
// ------------
// 1. Validates `x-webhook-secret` (401 otherwise).
// 2. Calls `getOverduePendingRequests()` — returns every
//    `tutor_change_requests` row where
//    `status = 'pending' AND sla_deadline < now()`.
// 3. For each overdue row, inserts a `notifications` row with
//    `type = 'tutor_change_sla_breach'` addressed to the admin
//    audience. Idempotency is enforced by the partial unique
//    index `uq_notifications_tutor_change_sla` keyed on
//    `(user_id, type, payload->>'request_id', channel)` — a second
//    tick for the same request gets a 23505 and is reported as
//    `duplicate`, NOT a new breach alert.
//
// What it does NOT do
// -------------------
//   - Does NOT send email. Email rendering lives in n8n (per
//     CLAUDE.md §2.3 — "n8n is the only system that calls
//     external APIs on the booking path"). This cron is the
//     dispatcher of in-app admin notifications; an n8n workflow
//     is responsible for any email side. We do NOT introduce that
//     workflow in this slice.
//   - Does NOT mutate `tutor_change_requests`. The status remains
//     `pending` — only the admin's manual response or the
//     selection-by-student ends the timer.
//   - Does NOT auto-propose alternatives. Auto-proposing requires
//     a tutor-pool + matching policy that the client has not yet
//     confirmed. The cron only flags breaches; the admin still
//     drives the resolution.
// =====================================================================

export const dynamic = 'force-dynamic';

/** Type for in-app admin notification (the only audience we notify). */
const SLA_BREACH_TYPE = 'tutor_change_sla_breach';

interface NotificationInsert {
  user_id: string;
  type: string;
  channel: 'in_app';
  subject: string;
  body: string;
  payload: Record<string, unknown>;
}

interface ScanSummary {
  considered: number;
  inserted: number;
  duplicate: number;
  failed: number;
  ran_at: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // ---- Auth: shared-secret in `x-webhook-secret` ---------------
    const expected = serverEnv().N8N_WEBHOOK_SECRET;
    if (!expected) {
      logger.warn(
        'cron check-tutor-change-sla called but N8N_WEBHOOK_SECRET is unset',
      );
      throw Unauthorized('Cron is not configured.');
    }
    const provided = req.headers.get('x-webhook-secret');
    if (provided !== expected) {
      throw Unauthorized('Invalid cron secret.');
    }

    // ---- Scan overdue pending requests ----------------------------
    const overdue = await getOverduePendingRequests();

    const admin = createSupabaseAdminClient();
    const summary: ScanSummary = {
      considered: overdue.length,
      inserted: 0,
      duplicate: 0,
      failed: 0,
      ran_at: new Date().toISOString(),
    };

    // ---- Fan out the inserts --------------------------------------
    // Each insert is independent; we run them sequentially because
    // (a) the volume per tick is small (<= a handful of breaches
    // per cron interval), and (b) we want the unique-violation
    // accounting to be deterministic per row.
    for (const req of overdue) {
      const row: NotificationInsert = {
        // The breach is addressed to the STUDENT (the one whose
        // SLA was breached). The student dashboard will surface
        // the breach and they can choose to nudge via the UI. A
        // future enhancement may also notify the admin audience;
        // that requires a separate notification mirror which we
        // do not invent in this slice.
        user_id: req.student_id,
        type: SLA_BREACH_TYPE,
        channel: 'in_app',
        subject: 'Your tutor change request has passed the 24h SLA.',
        body:
          'Your tutor change request has not been actioned within the 24-hour response window. ' +
          'You may follow up via the dashboard or contact support if no response is received within the next business day.',
        payload: {
          request_id: req.id,
          session_booking_id: req.session_booking_id,
          current_tutor_id: req.current_tutor_id,
          sla_deadline: req.sla_deadline,
        },
      };

      const { error } = await admin.from('notifications').insert(row);
      if (!error) {
        summary.inserted += 1;
        continue;
      }
      const msg = describeError(error);
      const msgStr = typeof msg === 'string' ? msg : String(msg);
      // Unique-violation on `uq_notifications_tutor_change_sla`
      // — the breach was already recorded. Count as duplicate,
      // not failure.
      if (/uq_notifications_tutor_change_sla|duplicate key value/u.test(msgStr)) {
        summary.duplicate += 1;
        continue;
      }
      summary.failed += 1;
      logger.error('SLA breach notification insert failed', {
        requestId: req.id,
        error: msg,
      });
    }

    logger.info('cron check-tutor-change-sla done', { ...summary });

    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return errorResponse(e);
  }
}
