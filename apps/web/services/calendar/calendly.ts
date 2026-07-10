import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * `services/calendar/calendly.ts` — typed wrappers over the
 * Calendly REST API. We do not depend on a Calendly SDK; the
 * REST surface is small enough to wrap directly.
 *
 * Why no SDK
 * ----------
 * The Calendly personal-access-token REST API has a stable v2
 * surface documented at https://developer.calendly.com. The
 * official community SDKs are not maintained at the same
 * cadence as the API. Wrapping the endpoints we use is
 * cheaper, more transparent, and version-locked.
 *
 * Auth
 * ----
 * Every request is `Authorization: Bearer <CALENDLY_PERSONAL_TOKEN>`.
 * The token is read from `serverEnv()` lazily on the first call.
 */
const DEFAULT_BASE = 'https://api.calendly.com';

interface CalendlyFetchOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
}

async function calendlyFetch<T>(path: string, opts: CalendlyFetchOptions = {}): Promise<T> {
  const env = serverEnv();
  if (!env.CALENDLY_PERSONAL_TOKEN) {
    throw new Error('CALENDLY_PERSONAL_TOKEN is not configured.');
  }
  const base = DEFAULT_BASE;
  const url = new URL(path, base);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const response = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      'authorization': `Bearer ${env.CALENDLY_PERSONAL_TOKEN}`,
      'content-type':  'application/json',
      'accept':        'application/json',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '<unreadable>');
    throw new Error(`Calendly ${opts.method ?? 'GET'} ${path} failed: ${response.status} ${text.slice(0, 500)}`);
  }
  return await response.json() as T;
}

/* ---------------------------------------------------------------- */
/* Types                                                            */
/* ---------------------------------------------------------------- */

export interface CalendlyEventType {
  uri:            string;
  name:           string;
  duration:       number;     // minutes
  scheduling_url: string;      // public URL — used by the embed
  active:         boolean;
  kind:           'solo' | 'group';
  type:           'StandardEventType' | 'AdhocEventType';
}

export interface CalendlyInvitee {
  uri:           string;
  email:         string;
  name:          string;
  status:        string;
  event:         string;      // event URI
  scheduled_event: {
    uri:           string;
    start_time:    string;
    end_time:      string;
    location:      { type: string; location?: string } | null;
  };
}

interface CalendlyListResponse<T> {
  collection: ReadonlyArray<T>;
  pagination: { count: number; next_page: string | null };
}

/* ---------------------------------------------------------------- */
/* Endpoints                                                        */
/* ---------------------------------------------------------------- */

/** Fetch a single event type by URI. */
export async function getEventType(uri: string): Promise<CalendlyEventType> {
  return calendlyFetch<CalendlyEventType>(`/event_types/${encodeURIComponent(uri)}`);
}

/**
 * Fetch a Calendly invitee (a booked session) by its URI.
 * Used by the webhook to look up the actual scheduled time
 * for the invitee (Calendly's webhook payload includes the
 * invitee URI; the time + status are on the invitee resource).
 */
export async function getInvitee(uri: string): Promise<CalendlyInvitee> {
  return calendlyFetch<CalendlyInvitee>(`/scheduled_events/${encodeURIComponent(uri)}/invitees`);
}
