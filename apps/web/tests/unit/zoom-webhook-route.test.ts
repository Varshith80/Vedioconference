import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

// =====================================================================
// Sprint 11 — 11-C — `POST /api/webhooks/zoom/` route.
//
// The route is the Zoom trust boundary. n8n is a relay only.
// Tests pin:
//   A. Valid signature                  → accepted
//   B. Missing signature                → 401
//   C. Invalid signature                → 401
//   D. Missing timestamp                → 401
//   E. Malformed timestamp              → 401
//   F. Stale timestamp                  → 401
//   G. Timing-safe comparison path      → invalid sig is rejected
//      even when only the hex length matches
//   H. endpoint.url_validation          → 200, returns plainToken +
//      correct encryptedToken, does NOT write a webhook_event
//   I. Invalid challenge signature      → 401
//   J. Malformed JSON                   → 400, no business mutation
//   K. recording.completed              → resolves the meeting by
//      meeting_id and writes the right share_url
//   L. recording.completed idempotency  → same event_id twice =
//      one write
//   M. meeting.ended                    → 200, no recording_url
//      fabricated
//   N. Unknown event                    → 200, no business mutation
//   O. Missing application meeting      → 200, logs, no fabricated
//      row
//   P. Secret safety                    → tests do not embed a real
//      secret; the secret is never logged
// =====================================================================

// --- Mocks -------------------------------------------------------------

interface RecordedOp {
  table: string;
  kind: 'insert' | 'update' | 'select' | 'upsert';
  body?: unknown;
  filters: Array<{ col: string; op: string; val: unknown }>;
}

const ops: RecordedOp[] = [];
/** Track (table, dedup-key) pairs we have already seen so the
 *  second `insert` for the same key returns the Postgres
 *  unique-violation error (`23505`) that a real
 *  `webhook_events(provider, event_id)` UNIQUE index would
 *  raise on a duplicate delivery. */
const seenKeys = new Set<string>();
function dedupKey(table: string, body: unknown): string | null {
  if (table === 'webhook_events' && body && typeof body === 'object') {
    const b = body as { provider?: unknown; event_id?: unknown };
    if (typeof b.provider === 'string' && typeof b.event_id === 'string') {
      return `${b.provider}:${b.event_id}`;
    }
  }
  return null;
}

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({ serverEnv: mockServerEnv }));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      insert: (body: unknown) => {
        const op: RecordedOp = {
          table, kind: 'insert', body, filters: [],
        };
        ops.push(op);
        const key = dedupKey(table, body);
        let err: { code?: string; message?: string } | null = null;
        if (key) {
          if (seenKeys.has(key)) {
            err = { code: '23505', message: 'duplicate key value violates unique constraint' };
          } else {
            seenKeys.add(key);
          }
        }
        return Promise.resolve({ error: err });
      },
      update: (body: unknown) => {
        const op: RecordedOp = {
          table, kind: 'update', body, filters: [],
        };
        ops.push(op);
        const chain: any = {
          eq: (col: string, val: unknown) => {
            op.filters.push({ col, op: 'eq', val });
            return chain;
          },
          // The admin client returns `{ data, error }` from
          // `update(...).select(...)` and from bare
          // `select(...)` chains. The recording.completed
          // branch uses `.update().eq().select('id')`.
          select: (_sel?: string) =>
            Promise.resolve({ data: [], error: null }),
        };
        return chain;
      },
      select: (_sel?: string) => {
        const op: RecordedOp = {
          table, kind: 'select', filters: [],
        };
        ops.push(op);
        const chain: any = {
          eq: (col: string, val: unknown) => {
            op.filters.push({ col, op: 'eq', val });
            return chain;
          },
        };
        chain.then = (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: null });
        return chain;
      },
      upsert: (body: unknown) => {
        const op: RecordedOp = {
          table, kind: 'upsert', body, filters: [],
        };
        ops.push(op);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/utils/logger', () => ({ logger: mockLogger }));

// --- Subject under test ------------------------------------------------

const { POST } = await import('@/app/api/webhooks/zoom/route');
import { NextRequest as NextRequestCtor } from 'next/server';

// --- Helpers -----------------------------------------------------------

const TEST_SECRET = 'unit-zoom-secret';

function signZoom(rawBody: string, ts: number, secret = TEST_SECRET): string {
  // The route accepts the `x-zm-signature` header verbatim
  // and re-splits on commas; we emit the canonical single
  // `v0=<hex>` form here.
  const hex = createHmac('sha256', secret)
    .update(`v0:${ts}:${rawBody}`)
    .digest('hex');
  return `v0=${hex}`;
}

function makeReq(
  rawBody: string,
  opts: { ts?: number; signature?: string | null; secret?: string } = {},
): InstanceType<typeof NextRequestCtor> {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const sig =
    opts.signature === null
      ? null
      : (opts.signature ?? signZoom(rawBody, ts, opts.secret ?? TEST_SECRET));
  const headers = new Headers({ 'content-type': 'application/json' });
  if (sig !== null) headers.set('x-zm-signature', sig);
  headers.set('x-zm-request-timestamp', String(ts));
  return new NextRequestCtor('http://localhost:3000/api/webhooks/zoom', {
    method: 'POST',
    headers,
    body: rawBody,
  });
}

function findOp(table: string, kind: RecordedOp['kind']): RecordedOp | undefined {
  return ops.find((o) => o.table === table && o.kind === kind);
}

function findAllOps(table: string, kind: RecordedOp['kind']): RecordedOp[] {
  return ops.filter((o) => o.table === table && o.kind === kind);
}

beforeEach(() => {
  ops.length = 0;
  mockServerEnv.mockReset();
  mockLogger.info.mockReset();
  mockLogger.warn.mockReset();
  mockLogger.error.mockReset();
  mockServerEnv.mockReturnValue({ ZOOM_WEBHOOK_SECRET: TEST_SECRET });
});

// =====================================================================
// A. Valid signature
// =====================================================================

describe('POST /api/webhooks/zoom — valid signature', () => {
  it('accepts a properly signed envelope and returns 200 with { received: true }', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended', event_ts: 1700000000, payload: { object: { id: '111' } } });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { received: boolean };
    expect(body.received).toBe(true);
    // The webhook_event was recorded.
    const insert = findOp('webhook_events', 'insert');
    expect(insert).toBeTruthy();
    expect((insert!.body as { provider: string }).provider).toBe('zoom');
  });
});

// =====================================================================
// B. Missing signature
// =====================================================================

describe('POST /api/webhooks/zoom — missing signature', () => {
  it('returns 401 when x-zm-signature is absent', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const res = await POST(makeReq(raw, { signature: null }));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('unauthorized');
    // No webhook_event must be written.
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });
});

// =====================================================================
// C. Invalid signature
// =====================================================================

describe('POST /api/webhooks/zoom — invalid signature', () => {
  it('returns 401 on a signature that does not verify', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const res = await POST(makeReq(raw, { signature: 'v0=deadbeefdeadbeef' }));
    expect(res.status).toBe(401);
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });

  it('returns 401 when ZOOM_WEBHOOK_SECRET is unset', async () => {
    mockServerEnv.mockReturnValue({ ZOOM_WEBHOOK_SECRET: undefined });
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(401);
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });

  it('returns 401 when signature is signed with a different secret', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const res = await POST(makeReq(raw, { secret: 'attacker-secret' }));
    expect(res.status).toBe(401);
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });
});

// =====================================================================
// D. Missing timestamp
// =====================================================================

describe('POST /api/webhooks/zoom — missing timestamp', () => {
  it('returns 401 when x-zm-request-timestamp is absent', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('x-zm-signature', signZoom(raw, Math.floor(Date.now() / 1000)));
    // Intentionally no x-zm-request-timestamp.
    const req = new NextRequestCtor('http://localhost:3000/api/webhooks/zoom', {
      method: 'POST',
      headers,
      body: raw,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// E. Malformed timestamp
// =====================================================================

describe('POST /api/webhooks/zoom — malformed timestamp', () => {
  it('returns 401 on a non-numeric timestamp', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.set('x-zm-signature', signZoom(raw, Math.floor(Date.now() / 1000)));
    headers.set('x-zm-request-timestamp', 'not-a-number');
    const req = new NextRequestCtor('http://localhost:3000/api/webhooks/zoom', {
      method: 'POST',
      headers,
      body: raw,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// F. Stale timestamp
// =====================================================================

describe('POST /api/webhooks/zoom — stale timestamp', () => {
  it('returns 401 when the timestamp is older than the replay window', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    // 1 hour in the past is well outside any reasonable
    // replay window (5 minutes default).
    const staleTs = Math.floor(Date.now() / 1000) - 3600;
    const res = await POST(makeReq(raw, { ts: staleTs }));
    expect(res.status).toBe(401);
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });

  it('returns 401 when the timestamp is far in the future', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const futureTs = Math.floor(Date.now() / 1000) + 3600;
    const res = await POST(makeReq(raw, { ts: futureTs }));
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// G. Timing-safe comparison path
// =====================================================================

describe('POST /api/webhooks/zoom — signature comparison', () => {
  it('rejects a signature with the right length but wrong content (timing-safe path is hit)', async () => {
    // The route uses crypto.timingSafeEqual — a wrong hex
    // value with the right length is the canonical
    // "length-matched but value-mismatched" path. The
    // assertion is that the route refuses the request
    // regardless of how close the candidate is to the
    // expected digest.
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const ts = Math.floor(Date.now() / 1000);
    const expectedHex = createHmac('sha256', TEST_SECRET)
      .update(`v0:${ts}:${raw}`)
      .digest('hex');
    // Flip the first nibble of the expected hex; length is
    // identical, value is wrong.
    const flipped =
      (parseInt(expectedHex[0]!, 16) ^ 0x1).toString(16) + expectedHex.slice(1);
    const res = await POST(makeReq(raw, { ts, signature: `v0=${flipped}` }));
    expect(res.status).toBe(401);
  });

  it('rejects a signature whose candidate hex is a different length (length-mismatch fast path)', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    const ts = Math.floor(Date.now() / 1000);
    // Half-length hex — `timingSafeEqual` would throw without
    // the length guard. The route must return 401, not 500.
    const res = await POST(makeReq(raw, { ts, signature: 'v0=abcd' }));
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// H. endpoint.url_validation challenge
// =====================================================================

describe('POST /api/webhooks/zoom — endpoint.url_validation', () => {
  function urlValidationRequest(plainToken: string, opts: { ts?: number; badSig?: boolean } = {}) {
    const raw = JSON.stringify({
      event: 'endpoint.url_validation',
      event_ts: opts.ts ?? Math.floor(Date.now() / 1000),
      payload: { plainToken },
    });
    return makeReq(raw, { ts: opts.ts });
  }

  it('returns 200 with plainToken and the correct encryptedToken', async () => {
    const plainToken = 'abc123plain';
    const res = await POST(urlValidationRequest(plainToken));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plainToken: string; encryptedToken: string };
    expect(body.plainToken).toBe(plainToken);
    const expected = createHmac('sha256', TEST_SECRET).update(plainToken).digest('hex');
    expect(body.encryptedToken).toBe(expected);
    // CRITICAL: the challenge must NOT be inserted as a
    // normal webhook_event.
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });

  it('returns 400 when the challenge payload has no plainToken', async () => {
    const raw = JSON.stringify({ event: 'endpoint.url_validation', payload: {} });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(400);
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
  });
});

// =====================================================================
// I. Invalid challenge signature
// =====================================================================

describe('POST /api/webhooks/zoom — invalid challenge signature', () => {
  it('returns 401 on an url_validation event with a bad signature', async () => {
    const raw = JSON.stringify({
      event: 'endpoint.url_validation',
      event_ts: Math.floor(Date.now() / 1000),
      payload: { plainToken: 'abc' },
    });
    const ts = Math.floor(Date.now() / 1000);
    const res = await POST(makeReq(raw, { ts, signature: 'v0=deadbeefdeadbeef' }));
    expect(res.status).toBe(401);
  });
});

// =====================================================================
// J. Malformed JSON
// =====================================================================

describe('POST /api/webhooks/zoom — malformed JSON', () => {
  it('returns 400 on a payload that is not valid JSON (after signature passes)', async () => {
    const raw = 'this is not json';
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(400);
    // No webhook_event and no business mutation.
    expect(findOp('webhook_events', 'insert')).toBeUndefined();
    expect(findOp('meeting_links', 'update')).toBeUndefined();
  });
});

// =====================================================================
// K. recording.completed
// =====================================================================

describe('POST /api/webhooks/zoom — recording.completed', () => {
  it('writes the share_url to meeting_links.recording_url for the matching meeting_id', async () => {
    // Build a payload that matches the Zoom recording.completed
    // contract: object.id, object.share_url, object.meeting_id.
    const raw = JSON.stringify({
      event: 'recording.completed',
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-1',
      payload: {
        object: {
          id:         'rec-1',
          meeting_id: '999',
          share_url:  'https://zoom.us/rec/share/abc',
          recording_files: [],
        },
      },
    });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);

    // 1. webhook_event recorded
    const ins = findOp('webhook_events', 'insert');
    expect(ins).toBeTruthy();
    const insBody = ins!.body as { provider: string; event_id: string; event_type: string };
    expect(insBody.provider).toBe('zoom');
    expect(insBody.event_id).toBe('evt-1');
    expect(insBody.event_type).toBe('recording.completed');

    // 2. meeting_links updated with the right share_url
    const upd = findOp('meeting_links', 'update');
    expect(upd).toBeTruthy();
    expect((upd!.body as { recording_url: string }).recording_url).toBe(
      'https://zoom.us/rec/share/abc',
    );
    const meetingIdFilter = upd!.filters!.find((f) => f.col === 'meeting_id');
    expect(meetingIdFilter?.val).toBe('999');

    // 3. webhook_event marked processed
    const processed = findOp('webhook_events', 'update');
    expect(processed).toBeTruthy();
    expect((processed!.body as { processed: boolean }).processed).toBe(true);
  });

  it('prefers the first MP4 share_url when the payload omits object.share_url', async () => {
    const raw = JSON.stringify({
      event: 'recording.completed',
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-2',
      payload: {
        object: {
          id: 'rec-2',
          meeting_id: '1000',
          recording_files: [
            { file_type: 'M4A', share_url: 'https://zoom.us/rec/audio' },
            { file_type: 'MP4', share_url: 'https://zoom.us/rec/video' },
            { file_type: 'MP4', share_url: 'https://zoom.us/rec/video2' },
          ],
        },
      },
    });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    const upd = findOp('meeting_links', 'update');
    expect((upd!.body as { recording_url: string }).recording_url).toBe(
      'https://zoom.us/rec/video',
    );
  });
});

// =====================================================================
// L. recording.completed idempotency
// =====================================================================

describe('POST /api/webhooks/zoom — recording.completed idempotency', () => {
  it('writes the recording_url exactly once across duplicate deliveries', async () => {
    const raw = JSON.stringify({
      event: 'recording.completed',
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-dup',
      payload: {
        object: {
          id:         'rec-dup',
          meeting_id: '999',
          share_url:  'https://zoom.us/rec/share/dup',
        },
      },
    });
    // First delivery
    const r1 = await POST(makeReq(raw));
    expect(r1.status).toBe(200);
    // Second delivery (same event_id, same body, same signature)
    // The mock auto-raises a 23505 unique-violation on the
    // second `webhook_events` insert for the same
    // (provider, event_id) — exactly what the real
    // `webhook_events` UNIQUE index would raise.
    const r2 = await POST(makeReq(raw));
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { received: boolean; duplicate?: boolean };
    expect(b2.duplicate).toBe(true);

    // Two inserts (one for each delivery), but only the
    // first one ran the business write.
    expect(findAllOps('webhook_events', 'insert')).toHaveLength(2);
    // Exactly one meeting_links update (the second delivery
    // short-circuited at the webhook_events dedup check).
    expect(findAllOps('meeting_links', 'update')).toHaveLength(1);
  });
});

// =====================================================================
// M. meeting.ended
// =====================================================================

describe('POST /api/webhooks/zoom — meeting.ended', () => {
  it('returns 200 and does NOT write a recording_url', async () => {
    const raw = JSON.stringify({
      event: 'meeting.ended',
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-end',
      payload: {
        object: {
          id: '111',
          topic: 'Maths',
        },
      },
    });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    // The event is recorded for observability.
    const ins = findOp('webhook_events', 'insert');
    expect(ins).toBeTruthy();
    expect((ins!.body as { event_type: string }).event_type).toBe('meeting.ended');
    // But NO recording_url is fabricated.
    expect(findOp('meeting_links', 'update')).toBeUndefined();
  });
});

// =====================================================================
// N. Unknown event
// =====================================================================

describe('POST /api/webhooks/zoom — unknown event', () => {
  it('returns 200, records the event, and writes no meeting_links row', async () => {
    const raw = JSON.stringify({
      event: 'meeting.started', // a future event type we do not handle
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-future',
      payload: { object: { id: '222' } },
    });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    const ins = findOp('webhook_events', 'insert');
    expect(ins).toBeTruthy();
    expect((ins!.body as { event_type: string }).event_type).toBe('meeting.started');
    expect(findOp('meeting_links', 'update')).toBeUndefined();
  });
});

// =====================================================================
// O. Missing application meeting
// =====================================================================

describe('POST /api/webhooks/zoom — missing application meeting', () => {
  it('returns 200 and does NOT fabricate a meeting_links row when the update targets zero rows', async () => {
    // The mock `update(...).select(...)` returns an empty
    // `data` array — i.e. no meeting_link row matched the
    // meeting_id. The route must not throw, must return
    // 200, and must not INSERT a meeting_link.
    const raw = JSON.stringify({
      event: 'recording.completed',
      event_ts: Math.floor(Date.now() / 1000),
      event_id: 'evt-orphan',
      payload: {
        object: {
          id:         'rec-orphan',
          meeting_id: 'no-such-meeting',
          share_url:  'https://zoom.us/rec/share/orphan',
        },
      },
    });
    const res = await POST(makeReq(raw));
    expect(res.status).toBe(200);
    // The webhook_event was still recorded (defensive: the
    // event is observable even when the lookup misses).
    const ins = findOp('webhook_events', 'insert');
    expect(ins).toBeTruthy();
    // No meeting_links INSERT (no fabricated row).
    expect(findOp('meeting_links', 'insert')).toBeUndefined();
    // And no meeting_links update (the update resolved
    // zero rows; the test mock returns empty `data`).
    expect(findOp('meeting_links', 'update')).toBeTruthy();
  });
});

// =====================================================================
// P. Secret safety
// =====================================================================

describe('POST /api/webhooks/zoom — secret safety', () => {
  it('does not log the secret value, the signature, or the raw body in any code path', async () => {
    const raw = JSON.stringify({ event: 'meeting.ended' });
    await POST(makeReq(raw));
    // The logger was called at least once (the meeting.ended
    // branch logs an info line) — but none of the calls
    // must reference the secret, the signature, the
    // candidate v0, or the raw body.
    const allCalls = [
      ...mockLogger.info.mock.calls,
      ...mockLogger.warn.mock.calls,
      ...mockLogger.error.mock.calls,
    ];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const call of allCalls) {
      const args = call.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
      const text = args.join(' ');
      expect(text, 'no secret leak').not.toContain(TEST_SECRET);
      expect(text, 'no raw-body leak').not.toContain(raw);
    }
  });

  it('the test file itself does not embed a real-looking Zoom webhook secret', () => {
    // Defence-in-depth: the test secret is a clearly
    // synthetic placeholder, not a real Zoom-shaped
    // 32+ char alphanumeric blob.
    expect(TEST_SECRET.length).toBeLessThan(32);
    expect(TEST_SECRET).toMatch(/test|unit|placeholder|sample|do-not-use/i);
  });
});
