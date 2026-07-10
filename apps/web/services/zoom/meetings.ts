import 'server-only';
import { zoomFetch } from '@/lib/zoom/client';

/**
 * `services/zoom/meetings.ts` — typed wrappers over the Zoom
 * Server-to-Server REST API for the meetings a tutor's module
 * sessions live in.
 *
 * Why this layer
 * --------------
 * `lib/zoom/client.ts` is the raw token + fetch helper. This
 * module is the *typed* surface: every method takes a strongly-
 * shaped input and returns a strongly-shaped output. The
 * `n8n/workflows/module-booking-to-zoom.json` workflow calls
 * these via an n8n HTTP node when the Sprint C path needs to
 * create / delete / update a meeting. The Next.js app does NOT
 * call Zoom directly on the booking path — n8n does — but
 * having a typed service in `services/zoom/` keeps the API
 * shape documented and unit-testable.
 */

export interface CreateMeetingInput {
  /** Zoom user id of the host (the tutor). */
  hostUserId: string;
  topic:      string;
  agenda?:    string;
  /** ISO 8601 start time, e.g. `2026-08-01T14:00:00Z`. */
  startTime:  string;
  /** Duration in minutes. */
  durationMin: number;
  /** IANA timezone, e.g. `Europe/Paris`. */
  timezone:   string;
}

export interface ZoomMeeting {
  id:        number;
  uuid:      string;
  host_id:   string;
  topic:     string;
  type:      number;
  start_time: string;
  duration:  number;
  timezone:  string;
  join_url:  string;
  start_url: string;
  password:  string;
}

/**
 * Create a scheduled Zoom meeting for `hostUserId`.
 * The `start_url` is the host-only join URL (never returned to
 * students). The `join_url` is what goes into the
 * `meeting_links` row + the confirmation email.
 */
export async function createMeeting(input: CreateMeetingInput): Promise<ZoomMeeting> {
  return zoomFetch<ZoomMeeting>(`/users/${encodeURIComponent(input.hostUserId)}/meetings`, {
    method: 'POST',
    body: JSON.stringify({
      topic:      input.topic,
      type:       2, // Scheduled meeting
      start_time: input.startTime,
      duration:   input.durationMin,
      timezone:   input.timezone,
      agenda:     input.agenda,
      settings: {
        join_before_host:        false,
        waiting_room:            true,
        mute_upon_entry:         true,
        audio:                   'voip',
        auto_recording:         'none',
      },
    }),
  });
}

/** Delete a meeting. Idempotent — a 404 is treated as success. */
export async function deleteMeeting(meetingId: number | string): Promise<void> {
  try {
    await zoomFetch<void>(`/meetings/${encodeURIComponent(String(meetingId))}`, {
      method: 'DELETE',
    });
  } catch (e) {
    if (e instanceof Error && /404/.test(e.message)) return;
    throw e;
  }
}

/** Patch meeting metadata (topic, start time, duration). */
export async function updateMeeting(
  meetingId: number | string,
  patch: Partial<Pick<CreateMeetingInput, 'topic' | 'startTime' | 'durationMin' | 'agenda'>>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.topic       !== undefined) body.topic       = patch.topic;
  if (patch.startTime   !== undefined) body.start_time  = patch.startTime;
  if (patch.durationMin !== undefined) body.duration    = patch.durationMin;
  if (patch.agenda      !== undefined) body.agenda      = patch.agenda;
  if (Object.keys(body).length === 0) return;
  await zoomFetch<void>(`/meetings/${encodeURIComponent(String(meetingId))}`, {
    method: 'PATCH',
    body:   JSON.stringify(body),
  });
}
