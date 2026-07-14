import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 3.5 smoke test for `POST /api/session-bookings` —
 * the v2 unit-of-booking endpoint.
 */

// Mocks must come before the route import.
const mockAuthUser = vi.fn();
const mockCreateBooking = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(),
}));

const mockPublicEnv = vi.fn();
const mockServerEnv = vi.fn();
vi.mock('@/lib/env', () => ({
  publicEnv: mockPublicEnv,
  serverEnv: mockServerEnv,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('@/services/curriculum/session-bookings', () => ({
  createSessionBooking: mockCreateBooking,
}));

const { POST } = await import('@/app/api/session-bookings/route');
import { NextRequest as NextRequestCtor } from 'next/server';

interface Row { data: unknown; error: null }

function tableQueue(responses: Row[]) {
  let i = 0;
  return (_table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'limit', 'single', 'maybeSingle'];
    for (const m of methods) (chain as Record<string, unknown>)[m] = vi.fn(() => chain);
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve: (r: Row) => void) => {
          resolve(responses[i++] ?? { data: null, error: null });
        };
      },
    });
    return chain;
  };
}

const SESSION_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  chapter: { course_id: 'c1' },
};
const CT_ROW = { tutor_id: 't1' };
const BOOKING_ROW = {
  id: '33333333-3333-3333-3333-333333333333',
  student_id: 'u1',
  session_id: SESSION_ROW.id,
  session_grant_id: '22222222-2222-2222-2222-222222222222',
  tutor_id: 't1',
  scheduled_start: '2026-08-01T10:00:00Z',
  scheduled_end: '2026-08-01T11:00:00Z',
  status: 'scheduled',
};

const VALID_BODY = {
  session_id: SESSION_ROW.id,
  session_grant_id: '22222222-2222-2222-2222-222222222222',
  scheduled_start: '2026-08-01T10:00:00Z',
  scheduled_end: '2026-08-01T11:00:00Z',
};

function makeReq(body: unknown): InstanceType<typeof NextRequestCtor> {
  const headers = new Headers({ 'content-type': 'application/json' });
  return new NextRequestCtor('http://localhost:3000/api/session-bookings', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function loadServerMockMocked(from: (table: string) => unknown) {
  const { createSupabaseServerClientUntyped } = await import('@/lib/supabase/server');
  (createSupabaseServerClientUntyped as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    auth: { getUser: mockAuthUser },
    from,
  });
}

describe('POST /api/session-bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.mockReset();
    mockCreateBooking.mockReset();
    mockFetch.mockReset();
    mockPublicEnv.mockReturnValue({ NEXT_PUBLIC_N8N_BOOKING_WEBHOOK: '' });
  });

  it('returns 401 when the user is not signed in', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: null } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 400 on an invalid body (missing scheduled_end)', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    await loadServerMockMocked(tableQueue([]));
    const res = await POST(makeReq({ session_id: SESSION_ROW.id }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the session does not exist', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    await loadServerMockMocked(
      tableQueue([{ data: null, error: null }]),
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 409 no_tutor_for_course when no tutor is assigned to the course', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    await loadServerMockMocked(
      tableQueue([
        { data: SESSION_ROW, error: null },
        { data: null, error: null },
      ]),
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('no_tutor_for_course');
  });

  it('returns 409 grant_inactive when the service reports the grant is not active', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreateBooking.mockResolvedValue({ kind: 'grant_not_active' });
    await loadServerMockMocked(
      tableQueue([
        { data: SESSION_ROW, error: null },
        { data: CT_ROW, error: null },
      ]),
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('grant_inactive');
  });

  it('returns 201 with a session_booking_id on success', async () => {
    mockAuthUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockCreateBooking.mockResolvedValue({ kind: 'ok', booking: BOOKING_ROW });
    await loadServerMockMocked(
      tableQueue([
        { data: SESSION_ROW, error: null },
        { data: CT_ROW, error: null },
      ]),
    );
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { session_booking_id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.session_booking_id).toBe(BOOKING_ROW.id);
  });
});
