import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6.5 — Feature G cooldown route tests.
//
// The route layer (POST /api/student/tutor-change-requests) catches
// the `TutorChangeCooldownActiveError` thrown by `assertNoCooldown`
// (inside `createRequest`) and translates it to HTTP 409 with the
// required envelope: `{ error: { code: 'tutor_change_cooldown_active',
// details: { next_eligible_at, remaining_ms, last_changed_at } } }`.
//
// The route delegates to `createRequest` from `@/services/student/
// tutor-change`. That service internally calls `assertNoCooldown`
// before any booking lookup, so we exercise the envelope via the
// `createRequest` mock (the route never calls `assertNoCooldown`
// directly — the service does).
//
// We exercise three paths:
//   - cooldown ACTIVE → 409 with the envelope
//   - cooldown NOT ACTIVE → 201 (delegate behaviour unchanged)
//   - trigger P0001 (service gate bypassed) → 409 with parsed
//     remaining_ms (belt-and-braces backstop)
// =====================================================================

const mockCreateRequest = vi.fn();
const mockAuthGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({
    from: vi.fn(),
    auth: { getUser: mockAuthGetUser },
  }),
}));

vi.mock('@/services/student/tutor-change', () => ({
  createRequest: mockCreateRequest,
}));

const { POST } = await import('@/app/api/student/tutor-change-requests/route');

const STUDENT_UUID = '11111111-1111-1111-1111-111111111111';
const BOOKING_UUID = '22222222-2222-2222-2222-222222222222';

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/student/tutor-change-requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/student/tutor-change-requests — Sprint 6.5 cooldown envelope', () => {
  beforeEach(() => {
    mockCreateRequest.mockReset();
    mockAuthGetUser.mockReset();
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: STUDENT_UUID } } });
  });

  it('returns 409 with the cooldown envelope when assertNoCooldown (inside createRequest) throws', async () => {
    // Simulate the service-layer gate: createRequest internally
    // calls assertNoCooldown, which throws the discriminated error.
    mockCreateRequest.mockRejectedValue({
      code: 'tutor_change_cooldown_active',
      message: 'tutor_change_cooldown_active',
      details: {
        next_eligible_at: '2026-09-16T12:00:00.000Z',
        remaining_ms: 86_400_000,
        last_changed_at: '2026-09-15T12:00:00.000Z',
      },
    });

    const res = await POST(buildRequest({ session_booking_id: BOOKING_UUID }) as never);
    expect(res.status).toBe(409);

    const body = (await res.json()) as {
      error: {
        code: string;
        message: string;
        details: {
          next_eligible_at: string;
          remaining_ms: number;
          last_changed_at: string;
        };
      };
    };

    expect(body.error.code).toBe('tutor_change_cooldown_active');
    expect(body.error.details.next_eligible_at).toBe('2026-09-16T12:00:00.000Z');
    expect(body.error.details.remaining_ms).toBe(86_400_000);
    expect(body.error.details.last_changed_at).toBe('2026-09-15T12:00:00.000Z');
    // The error bubbled out of createRequest (which already
    // attempted the gate internally) → the booking INSERT was
    // short-circuited.
    expect(mockCreateRequest).toHaveBeenCalledOnce();
  });

  it('returns 409 when the SQL trigger raises P0001 (belt-and-braces backstop)', async () => {
    // Service gate bypassed → trigger fires P0001 with the
    // structured message. Route must still produce the 409.
    mockCreateRequest.mockRejectedValue(
      Object.assign(new Error('tutor_change_cooldown_active:86400000'), {
        code: 'P0001',
      }),
    );

    const res = await POST(buildRequest({ session_booking_id: BOOKING_UUID }) as never);
    expect(res.status).toBe(409);

    const body = (await res.json()) as {
      error: {
        code: string;
        details: { remaining_ms: number; next_eligible_at: string; last_changed_at: string | null };
      };
    };

    expect(body.error.code).toBe('tutor_change_cooldown_active');
    expect(body.error.details.remaining_ms).toBe(86_400_000);
    expect(body.error.details.last_changed_at).toBeNull();
  });

  it('returns 201 when the cooldown gate passes and the service succeeds', async () => {
    const nowIso = new Date().toISOString();
    mockCreateRequest.mockResolvedValue({
      id: 'request-1',
      student_id: STUDENT_UUID,
      session_booking_id: BOOKING_UUID,
      current_tutor_id: '33333333-3333-3333-3333-333333333333',
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

    const res = await POST(buildRequest({ session_booking_id: BOOKING_UUID }) as never);
    expect(res.status).toBe(201);
    expect(mockCreateRequest).toHaveBeenCalledOnce();
  });

  it('returns 401 when there is no signed-in user (cooldown never fires)', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(buildRequest({ session_booking_id: BOOKING_UUID }) as never);
    expect(res.status).toBe(401);
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });
});
