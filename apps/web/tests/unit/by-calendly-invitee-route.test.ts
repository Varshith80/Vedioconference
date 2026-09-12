import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 10 — I-1 — `POST /api/enrollments/by-calendly-invitee` test.
//
// Verifies the booking-context resolver: the route is the only
// safe way for n8n to ask "what session_booking does this
// Calendly invitee correspond to?" without n8n holding a Supabase
// service-role key for direct reads.
//
// Coverage matrix:
//   - Authentication (secret unset / missing / wrong / right).
//   - Body validation (Zod schema).
//   - 404 when no session_bookings row matches.
//   - 409 when the supplied calendly_event_uri doesn't match.
//   - Privacy (response does NOT include the student's email).
//   - Happy path returns the full context shape.
// =====================================================================

const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  serverEnv: mockServerEnv,
}));

// Admin client stub. We use a tiny in-memory registry of table
// responses so the test can script the v2 join:
// session_bookings → sessions → chapters → courses
// plus profiles / tutors / meeting_links.
const tableResponses: Array<{ table: string; data: unknown; error: null | { message: string } }> = [];
let tableIdx = 0;

interface Chain {
  select: (cols?: string) => Chain;
  eq:    (col: string, val: unknown) => Chain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
}

function makeChain(): Chain {
  return {
    select: () => makeChain(),
    eq:    () => makeChain(),
    maybeSingle: async () => {
      const next = tableResponses[tableIdx++];
      if (!next) return { data: null, error: null };
      return { data: next.data, error: next.error };
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from: (table: string) => makeChain() })),
}));

const { POST } = await import('@/app/api/enrollments/by-calendly-invitee/route');
import { NextRequest as NextRequestCtor } from 'next/server';

const INVITEE_URI = 'https://api.calendly.com/scheduled_events/abc/invitees/xyz';
const EVENT_URI   = 'https://api.calendly.com/scheduled_events/abc';

function makeReq(body: unknown, secret = 'shh'): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-webhook-secret': secret,
  });
  return new NextRequestCtor('http://localhost:3000/api/enrollments/by-calendly-invitee', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
}

describe('POST /api/enrollments/by-calendly-invitee — auth', () => {
  beforeEach(() => {
    mockServerEnv.mockReset();
    tableResponses.length = 0;
    tableIdx = 0;
  });

  it('returns 401 when N8N_WEBHOOK_SECRET is unset', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: undefined });
    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the x-webhook-secret header is missing', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    const headers = new Headers({ 'content-type': 'application/json' });
    const req = new NextRequestCtor('http://localhost:3000/api/enrollments/by-calendly-invitee', {
      method: 'POST', headers, body: JSON.stringify({ calendly_invitee_uri: INVITEE_URI }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when the x-webhook-secret header does not match', async () => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI }, 'wrong'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/enrollments/by-calendly-invitee — body validation', () => {
  beforeEach(() => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    tableResponses.length = 0;
    tableIdx = 0;
  });

  it('returns 400 when calendly_invitee_uri is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when calendly_invitee_uri is not a URL', async () => {
    const res = await POST(makeReq({ calendly_invitee_uri: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when calendly_event_uri is supplied but not a URL', async () => {
    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI, calendly_event_uri: 'oops' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/enrollments/by-calendly-invitee — resolution', () => {
  beforeEach(() => {
    mockServerEnv.mockReturnValue({ N8N_WEBHOOK_SECRET: 'shh' });
    tableResponses.length = 0;
    tableIdx = 0;
  });

  it('returns 404 when no session_bookings row matches the invitee', async () => {
    // The first query is the session_bookings lookup; the chain
    // is called via .select(...).eq(...).maybeSingle() — we only
    // need to return null for the booking row.
    tableResponses.push({ table: 'session_bookings', data: null, error: null });
    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 409 when the supplied calendly_event_uri does not match the row', async () => {
    tableResponses.push({
      table: 'session_bookings',
      data: {
        id: 'b1', session_id: 's1', session_grant_id: 'g1',
        student_id: 'stu1', tutor_id: 'tut1',
        scheduled_start: '2026-09-12T10:00:00Z',
        scheduled_end:   '2026-09-12T11:00:00Z',
        timezone: 'Europe/Paris',
        calendly_event_uri: 'https://api.calendly.com/scheduled_events/different',
        session: { title: 'Algèbre', duration_min: 60, chapter: { title: 'Chap 1', course: { title: 'Maths' } } },
      },
      error: null,
    });
    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI, calendly_event_uri: EVENT_URI }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('conflict');
  });

  it('returns the full context on the happy path (no student email leaked)', async () => {
    tableResponses.push({
      table: 'session_bookings',
      data: {
        id: 'b1', session_id: 's1', session_grant_id: 'g1',
        student_id: 'stu1', tutor_id: 'tut1',
        scheduled_start: '2026-09-12T10:00:00Z',
        scheduled_end:   '2026-09-12T11:00:00Z',
        timezone: 'Europe/Paris',
        calendly_event_uri: EVENT_URI,
        session: { title: 'Algèbre', duration_min: 60, chapter: { title: 'Chap 1', course: { title: 'Maths' } } },
      },
      error: null,
    });
    // Student profile
    tableResponses.push({ table: 'profiles', data: { full_name: 'Élise Martin' }, error: null });
    // Tutor row (carries profile_id)
    tableResponses.push({ table: 'tutors', data: { profile_id: 'prof2' }, error: null });
    // Tutor profile
    tableResponses.push({ table: 'profiles', data: { full_name: 'M. Dupont' }, error: null });
    // meeting_link (already exists)
    tableResponses.push({ table: 'meeting_links', data: { join_url: 'https://zoom.us/j/999' }, error: null });

    const res = await POST(makeReq({ calendly_invitee_uri: INVITEE_URI, calendly_event_uri: EVENT_URI }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    const d = body.data;
    expect(d.session_booking_id).toBe('b1');
    expect(d.session_id).toBe('s1');
    expect(d.session_grant_id).toBe('g1');
    expect(d.student_id).toBe('stu1');
    expect(d.tutor_id).toBe('tut1');
    expect(d.session_title).toBe('Algèbre');
    expect(d.course_title).toBe('Maths');
    expect(d.student_name).toBe('Élise Martin');
    expect(d.tutor_name).toBe('M. Dupont');
    expect(d.scheduled_start).toBe('2026-09-12T10:00:00Z');
    expect(d.scheduled_end).toBe('2026-09-12T11:00:00Z');
    expect(d.timezone).toBe('Europe/Paris');
    expect(d.duration_min).toBe(60);
    expect(d.join_url).toBe('https://zoom.us/j/999');
    // PRIVACY: the response must NOT include any email field.
    expect(JSON.stringify(body)).not.toMatch(/email/i);
  });

  it('happy path without a pre-existing meeting_link returns join_url=null', async () => {
    tableResponses.push({
      table: 'session_bookings',
      data: {
        id: 'b2', session_id: 's1', session_grant_id: 'g1',
        student_id: 'stu1', tutor_id: null,
        scheduled_start: '2026-09-12T10:00:00Z',
        scheduled_end:   '2026-09-12T11:00:00Z',
        timezone: 'Europe/Paris',
        calendly_event_uri: null,
        session: { title: 'Algèbre', duration_min: 60, chapter: { title: 'Chap 1', course: { title: 'Maths' } } },
      },
      error: null,
    });
    tableResponses.push({ table: 'profiles', data: { full_name: 'Élise' }, error: null });
    // No tutor — no tutors / tutor-profile queries.
    tableResponses.push({ table: 'meeting_links', data: null, error: null });

    const res = await POST(makeReq({ calendly_invitee_uri: 'https://api.calendly.com/scheduled_events/abc/invitees/qq' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { join_url: string | null; tutor_id: string | null; tutor_name: string | null } };
    expect(body.data.join_url).toBeNull();
    expect(body.data.tutor_id).toBeNull();
    expect(body.data.tutor_name).toBeNull();
  });
});
