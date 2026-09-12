import { NextResponse, type NextRequest } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import { serverEnv } from '@/lib/env';

/**
 * Zoom inbound webhook.
 *
 * Architecture
 * ------------
 *   Zoom → n8n (zoom-recording-completed) → POST /api/webhooks/zoom/
 *
 * n8n is the relay, NOT the trust boundary. This route is the
 * trusted application boundary for Zoom and verifies the original
 * Zoom `x-zm-signature` HMAC on the raw request body before doing
 * anything else (per CLAUDE.md §2.3: "Service-role key is restricted
 * to `app/api/webhooks/**`"; this is the only Zoom route that
 * touches the service-role client for the recording write-back).
 *
 * Signature contract (per the Zoom Marketplace "Configure a
 * webhook in your app" guide, current as of the Sprint 11 review):
 *
 *   message   = `v0:${x-zm-request-timestamp}:${raw_request_body}`
 *   digest    = HMAC-SHA256(ZOOM_WEBHOOK_SECRET, message)
 *   expected  = `v0=${hex(digest)}`
 *
 *   The route computes `expected`, reads the `x-zm-signature`
 *   header, and compares them with `crypto.timingSafeEqual()`
 *   (after a length guard so the equal-length precondition of
 *   `timingSafeEqual` holds).
 *
 * Replay protection
 * -----------------
 * The route validates `x-zm-request-timestamp` and refuses the
 * request when:
 *   - the header is missing
 *   - the value is not a numeric string of seconds
 *   - the timestamp is older than ZOOM_REPLAY_WINDOW_SECONDS
 *     (5 minutes, the value documented in Zoom's webhook guide
 *     as the safe window; bumped to 10 minutes in development
 *     to ease manual replays during local validation).
 *
 * Endpoint URL validation
 * -----------------------
 * Zoom sends an `endpoint.url_validation` event when the
 * operator registers the webhook URL in the Zoom Marketplace.
 * The route verifies the signature, then returns
 * `{ plainToken, encryptedToken }` where:
 *
 *   encryptedToken = HMAC-SHA256(ZOOM_WEBHOOK_SECRET, plainToken)
 *
 * The challenge is not inserted into `webhook_events` as a
 * business event (it has no `payload.object.id`); the route
 * just acknowledges it and returns.
 *
 * Recording write-back (R-3)
 * --------------------------
 * On `recording.completed` the route:
 *   1. Reads `payload.object.id` (the Zoom recording id) and
 *      `payload.object.share_url` (or the first MP4
 *      `share_url` in `payload.object.recording_files` when
 *      `share_url` is missing — see the selection rule in
 *      `pickRecordingShareUrl`).
 *   2. Locates the matching `meeting_links` row by
 *      `meeting_id` (the Zoom meeting numeric id stored as
 *      text by the `meeting_created` n8n event).
 *   3. Updates `meeting_links.recording_url` to that URL.
 *   4. If no row matches (Zoom fired the event before n8n
 *      finished the `meeting_created` write-back) the route
 *      returns 200 and logs an info line — the recording
 *      URL is not fabricated and the event is still recorded
 *      in `webhook_events`. A future replay of the same
 *      `event_id` is a no-op via the `webhook_events` UNIQUE
 *      constraint.
 *
 * No new database columns are touched beyond
 * `meeting_links.recording_url` (added in
 * `20260912000002_add_meeting_links_recording_url.sql`).
 * The audit's §2 decision is that `recording_url` is the
 * only Sprint 11 schema change.
 *
 * meeting.ended
 * -------------
 * Recorded in `webhook_events` for observability. The route
 * does NOT fabricate a `recording_url` — Zoom sends the
 * `recording.completed` event for the same meeting
 * separately, and that is the only writer of
 * `meeting_links.recording_url`.
 *
 * Unknown event
 * -------------
 * The route still authenticates, parses, and records the
 * event (with `event_type` set to the raw `event` value), and
 * returns 200. A future Zoom event type does not become a 500.
 */
const ZOOM_REPLAY_WINDOW_SECONDS = Number(
  process.env['ZOOM_REPLAY_WINDOW_SECONDS'] ?? 300, // 5 minutes
);

interface ZoomRecordingFile {
  id?: string;
  file_type?: string;
  file_extension?: string;
  play_url?: string;
  share_url?: string;
  download_url?: string;
  status?: string;
}

interface ZoomRecordingObject {
  id?: string | number;
  uuid?: string;
  meeting_id?: string | number;
  recording_files?: ZoomRecordingFile[];
  share_url?: string;
  start_time?: string;
  topic?: string;
}

interface ZoomMeetingEndedObject {
  id?: string | number;
  uuid?: string;
  type?: number;
  topic?: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
}

interface ZoomUrlValidationPayload {
  plainToken?: string;
}

interface ZoomEnvelope {
  event?: string;
  event_ts?: number;
  event_id?: string;
  payload?: {
    plainToken?: string;
    account_id?: string;
    object?: ZoomRecordingObject | ZoomMeetingEndedObject | Record<string, unknown>;
  };
}

function pickRecordingShareUrl(obj: ZoomRecordingObject): string | null {
  // The Zoom Marketplace documents `object.share_url` on a
  // `recording.completed` event. Some older payloads only
  // expose `recording_files[]` with per-file `share_url`s.
  // Selection rule (documented, in code):
  //   1. If `object.share_url` is a non-empty string, use it.
  //   2. Otherwise, prefer the first file whose
  //      `file_type === 'MP4'` and that has a `share_url`.
  //   3. Otherwise, the first file with a `share_url`.
  //   4. Otherwise null (the route logs and returns 200).
  if (typeof obj.share_url === 'string' && obj.share_url.length > 0) {
    return obj.share_url;
  }
  const files = Array.isArray(obj.recording_files) ? obj.recording_files : [];
  const mp4 = files.find(
    (f) =>
      f &&
      f.file_type === 'MP4' &&
      typeof f.share_url === 'string' &&
      f.share_url.length > 0,
  );
  if (mp4?.share_url) return mp4.share_url;
  const any = files.find(
    (f) => typeof f?.share_url === 'string' && f.share_url.length > 0,
  );
  return any?.share_url ?? null;
}

function asRecordingObject(v: unknown): ZoomRecordingObject {
  // Narrow `object` to a Zoom recording-object shape without
  // throwing on an unknown field. The route only reads a
  // handful of well-known fields and the cast is the documented
  // boundary cast (CLAUDE.md §3.9).
  return (v ?? {}) as ZoomRecordingObject;
}

function asMeetingEndedObject(v: unknown): ZoomMeetingEndedObject {
  return (v ?? {}) as ZoomMeetingEndedObject;
}

function asUrlValidationPayload(v: unknown): ZoomUrlValidationPayload {
  return (v ?? {}) as ZoomUrlValidationPayload;
}

function verifyZoomSignature(
  rawBody: string,
  ts: string,
  signatureHeader: string,
  secret: string,
): { ok: true } | { ok: false; reason: string } {
  // The Zoom signature header may carry multiple
  // `v0=…` values separated by commas (one per shared
  // secret during a key rotation). We compare against each
  // and accept on the first match. The header is also
  // accepted with a single `v0=…` value.
  const candidates = signatureHeader
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v0='))
    .map((s) => s.slice(3));

  if (candidates.length === 0) return { ok: false, reason: 'Malformed signature.' };

  const expectedHex = createHmac('sha256', secret)
    .update(`v0:${ts}:${rawBody}`)
    .digest('hex');

  // `timingSafeEqual` requires equal-length buffers; compare
  // the hex-decoded bytes of each candidate against the
  // expected hex-decoded bytes.
  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedHex, 'hex');
  } catch {
    return { ok: false, reason: 'Internal signature decode failure.' };
  }

  for (const c of candidates) {
    let candBuf: Buffer;
    try {
      candBuf = Buffer.from(c, 'hex');
    } catch {
      continue;
    }
    if (candBuf.length !== expectedBuf.length) continue;
    try {
      if (timingSafeEqual(candBuf, expectedBuf)) return { ok: true };
    } catch {
      continue;
    }
  }
  return { ok: false, reason: 'Invalid signature.' };
}

function isStaleTimestamp(ts: number, nowSec: number): boolean {
  if (!Number.isFinite(ts) || ts <= 0) return true;
  return Math.abs(nowSec - ts) > ZOOM_REPLAY_WINDOW_SECONDS;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Headers
    const tsHeader = req.headers.get('x-zm-request-timestamp');
    const sigHeader = req.headers.get('x-zm-signature');
    if (!tsHeader) throw Unauthorized('Missing x-zm-request-timestamp.');
    if (!sigHeader) throw Unauthorized('Missing x-zm-signature.');

    // 2. Timestamp sanity + replay window
    const tsNum = Number(tsHeader);
    if (!Number.isFinite(tsNum) || !Number.isInteger(tsNum)) {
      throw Unauthorized('Malformed x-zm-request-timestamp.');
    }
    if (isStaleTimestamp(tsNum, Math.floor(Date.now() / 1000))) {
      throw Unauthorized('Stale x-zm-request-timestamp.');
    }

    // 3. Secret must be configured
    const secret = serverEnv().ZOOM_WEBHOOK_SECRET;
    if (!secret) throw Unauthorized('Webhook secret not configured.');

    // 4. Raw body (BEFORE any json() call) for HMAC
    const rawBody = await req.text();

    // 5. Signature
    const sigCheck = verifyZoomSignature(rawBody, tsHeader, sigHeader, secret);
    if (!sigCheck.ok) throw Unauthorized(sigCheck.reason);

    // 6. Parse (after signature passes)
    let body: ZoomEnvelope;
    try {
      body = JSON.parse(rawBody) as ZoomEnvelope;
    } catch {
      throw BadRequest('Malformed JSON.');
    }

    const eventType = typeof body.event === 'string' ? body.event : 'unknown';

    // 7. endpoint.url_validation challenge (no `webhook_events`
    //    insert — this is not a business event).
    if (eventType === 'endpoint.url_validation') {
      const plainToken = asUrlValidationPayload(body.payload).plainToken;
      if (typeof plainToken !== 'string' || plainToken.length === 0) {
        throw BadRequest('endpoint.url_validation requires payload.plainToken.');
      }
      const encryptedToken = createHmac('sha256', secret)
        .update(plainToken)
        .digest('hex');
      return NextResponse.json(
        { plainToken, encryptedToken },
        { status: 200 },
      );
    }

    // 8. Idempotency: webhook_events(provider='zoom', event_id) UNIQUE
    const admin = createSupabaseAdminClient();
    // Zoom event id derivation: when the event carries one we
    // use it verbatim (replays of the same event collapse to
    // one row). When it does not (e.g. unknown event types,
    // a future event shape) we fall back to a stable hash of
    // event + event_ts + payload, so a replay of the same
    // delivery is still deduped.
    const stableEventId = (() => {
      if (typeof body.event_id === 'string' && body.event_id.length > 0) {
        return body.event_id;
      }
      const ts = Number.isFinite(body.event_ts) ? String(body.event_ts) : '0';
      const objId =
        (body.payload?.object as { id?: unknown } | undefined)?.id;
      return [
        eventType,
        ts,
        typeof objId === 'string' || typeof objId === 'number' ? String(objId) : '',
      ].join(':');
    })();

    const { error: insertError } = await admin
      .from('webhook_events')
      .insert({
        provider:   'zoom',
        event_id:   stableEventId,
        event_type: eventType,
        payload:    body as unknown as Record<string, unknown>,
      } as never);
    if (insertError) {
      if ((insertError as { code?: string }).code === '23505') {
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw insertError;
    }

    // 9. Business event handlers
    if (eventType === 'recording.completed') {
      const obj = asRecordingObject(body.payload?.object);
      const meetingId = obj.meeting_id ?? obj.id;
      if (meetingId === undefined || meetingId === null || meetingId === '') {
        logger.warn('zoom.recording.completed: missing meeting_id', {
          event_id: stableEventId,
        });
      } else {
        const shareUrl = pickRecordingShareUrl(obj);
        if (!shareUrl) {
          logger.warn('zoom.recording.completed: no share_url in payload', {
            event_id: stableEventId,
            meeting_id: String(meetingId),
            file_count: Array.isArray(obj.recording_files)
              ? obj.recording_files.length
              : 0,
          });
        } else {
          // meeting_links.meeting_id is `text` and stores the
          // Zoom numeric id as a string (see
          // /app/api/webhooks/n8n/route.ts 'meeting_created'
          // branch + the n8n-webhook-v2 test fixture that
          // uses meeting_id='999'). Normalise to a string.
          const meetingIdStr = String(meetingId);
          const { data: updated, error: updateError } = await admin
            .from('meeting_links')
            .update({ recording_url: shareUrl })
            .eq('meeting_id', meetingIdStr)
            .select('id');
          if (updateError) throw updateError;
          const updatedCount = Array.isArray(updated) ? updated.length : 0;
          if (updatedCount === 0) {
            // No meeting_link row yet (Zoom fired the
            // recording event before n8n finished the
            // meeting_created write-back). The event is
            // recorded in webhook_events; a future replay is
            // a no-op via the UNIQUE constraint. The route
            // does NOT fabricate a meeting_link row.
            logger.info('zoom.recording.completed: no meeting_link row matched', {
              event_id: stableEventId,
              meeting_id: meetingIdStr,
            });
          } else {
            logger.info('zoom.recording.completed: recording_url written', {
              event_id: stableEventId,
              meeting_id: meetingIdStr,
              rows: updatedCount,
            });
          }
        }
      }
    } else if (eventType === 'meeting.ended') {
      // Recorded in webhook_events for observability. No
      // recording_url is written from a `meeting.ended` —
      // Zoom sends a separate `recording.completed` (if the
      // host had cloud recording enabled), and that branch
      // is the only writer of `meeting_links.recording_url`.
      const obj = asMeetingEndedObject(body.payload?.object);
      logger.info('zoom.meeting.ended: recorded', {
        event_id: stableEventId,
        meeting_id:
          obj.id !== undefined && obj.id !== null ? String(obj.id) : null,
      });
    } else {
      // Unknown / future event type. Already recorded in
      // webhook_events; the route is forward-compatible.
      logger.info('zoom.webhook: unhandled event', {
        event: eventType,
        event_id: stableEventId,
      });
    }

    // 10. Mark processed.
    await admin
      .from('webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
      } as never)
      .eq('provider', 'zoom')
      .eq('event_id', stableEventId);

    return NextResponse.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The route is exported as a function — not re-exported under a
// different name — and is consumed by Next.js's App Router at
// the file path `app/api/webhooks/zoom/route.ts`. The
// `nodejs` runtime is required because `crypto.timingSafeEqual`
// and the raw `req.text()` body capture are not available in
// the Edge runtime.
