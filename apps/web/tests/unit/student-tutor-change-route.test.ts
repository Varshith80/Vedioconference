import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6 — POST /api/student/tutor-change-requests route tests.
//
// Coverage:
//   - 401 when no signed-in user
//   - 422 (Zod) on invalid body
//   - 201 on success with a payload echoed back
//
// The route does three things:
//   1. Pick up auth.uid() from the SSR client.
//   2. Parse the body with createTutorChangeRequestSchema.
//   3. Delegate to services/student/tutor-change#createRequest.
// We mock the supabase client + the service so we can drive the
// auth + Zod + delegate contract without hitting a real DB.
// =====================================================================

const mockCreateRequest = vi.fn();
const mockAuthGetUser = vi.fn();

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({
    from: mockFrom,
    auth: {
      getUser: mockAuthGetUser,
    },
  }),
}));

vi.mock('@/services/student/tutor-change', () => ({
  createRequest: mockCreateRequest,
}));

const { POST } = await import('@/app/api/student/tutor-change-requests/route');

const STUDENT_UUID = '11111111-1111-1111-1111-111111111111';
const BOOKING_UUID = '22222222-2222-2222-2222-222222222222';
const TUTOR_UUID = '33333333-3333-3333-3333-333333333333';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/student/tutor-change-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Helper: Next.js route handlers accept the cross-fetch `Request` shape
// but expect NextRequest's `nextUrl`. Casting via `as never` keeps the
// test surface minimal — we are not exercising URL-derived logic here.
function asNextRequest(req: Request): unknown {
  return req;
}

describe('POST /api/student/tutor-change-requests', () => {
  beforeEach(() => {
    mockCreateRequest.mockReset();
    mockAuthGetUser.mockReset();
  });

  it('returns 401 when there is no signed-in user', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(asNextRequest(buildRequest({ session_booking_id: BOOKING_UUID })) as never);
    expect(res.status).toBe(401);
  });

  it('returns 422 when the body fails Zod validation', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: STUDENT_UUID } } });
    const res = await POST(asNextRequest(buildRequest({ session_booking_id: 'not-a-uuid' })) as never);
    expect(res.status).toBe(422);
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it('returns 201 on a successful create', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: STUDENT_UUID } } });
    const nowIso = new Date().toISOString();
    mockCreateRequest.mockResolvedValue({
      id: 'request-1',
      student_id: STUDENT_UUID,
      session_booking_id: BOOKING_UUID,
      current_tutor_id: TUTOR_UUID,
      status: 'pending',
      requested_at: nowIso,
      sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      responded_at: null,
      proposed_alternative_tutor_ids: [],
      selected_tutor_id: null,
      student_reason: null,
      admin_notes: null,
      created_at: nowIso,
      updated_at: nowIso,
      overdue: false,
    });

    const res = await POST(
      asNextRequest(
        buildRequest({
          session_booking_id: BOOKING_UUID,
          student_reason: 'too advanced',
        }),
      ) as never,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { id: string; status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe('request-1');
    expect(body.data.status).toBe('pending');
    expect(mockCreateRequest).toHaveBeenCalledOnce();
    const arg = mockCreateRequest.mock.calls[0]?.[0] as {
      session_booking_id: string;
      student_reason?: string;
    };
    expect(arg.session_booking_id).toBe(BOOKING_UUID);
    expect(arg.student_reason).toBe('too advanced');
  });

  it('returns the service error envelope on Conflict', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: STUDENT_UUID } } });
    const { Conflict } = await import('@/lib/utils/errors');
    mockCreateRequest.mockRejectedValue(
      Conflict('You already have an open tutor-change request for this booking.'),
    );
    const res = await POST(asNextRequest(buildRequest({ session_booking_id: BOOKING_UUID })) as never);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('conflict');
  });
});
