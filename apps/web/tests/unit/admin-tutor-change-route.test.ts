import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6 — Admin-side GET /api/admin/tutor-change-requests
// + PATCH /api/admin/tutor-change-requests/[id]/alternatives.
// =====================================================================

const mockRequireAdminRoute = vi.fn();
const mockGetAllRequests = vi.fn();
const mockProposeAlternatives = vi.fn();

vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));

vi.mock('@/services/admin/tutor-change', () => ({
  getAllRequests: mockGetAllRequests,
  proposeAlternatives: mockProposeAlternatives,
}));

const { GET } = await import('@/app/api/admin/tutor-change-requests/route');
const { PATCH: PATCH_ALTS } = await import(
  '@/app/api/admin/tutor-change-requests/[id]/alternatives/route'
);

const REQUEST_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_UUID = '22222222-2222-2222-2222-222222222222';
const TUTOR_UUID = '33333333-3333-3333-3333-333333333333';
const BOOKING_UUID = '44444444-4444-4444-4444-444444444444';

// Helper: cross-fetch `Request` doesn't carry `nextUrl`/`cookies`,
// so we synthesise a minimal NextRequest surface by hand. We do
// NOT import `next/server` here because Vitest's module resolution
// can pull in runtime-only bits; the `as never` cast at the call
// site keeps the type-checker happy and the test surface minimal.
function buildGetRequest(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function buildPatchRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function asNextRequest(req: Request): unknown {
  // Attach a `nextUrl` shaped like the WHATWG URL the route reads.
  // Other NextRequest properties (cookies, headers) are not used by
  // the routes under test.
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);
  return req;
}

describe('GET /api/admin/tutor-change-requests', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockGetAllRequests.mockReset();
  });

  it('returns 401 when requireAdminRoute throws', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('Sign in.'));
    const res = await GET(
      asNextRequest(
        buildGetRequest('http://localhost/api/admin/tutor-change-requests'),
      ) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with the full list when no status filter is provided', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    mockGetAllRequests.mockResolvedValue([]);
    const res = await GET(
      asNextRequest(
        buildGetRequest('http://localhost/api/admin/tutor-change-requests'),
      ) as never,
    );
    expect(res.status).toBe(200);
    expect(mockGetAllRequests).toHaveBeenCalledWith(undefined);
  });

  it('forwards a valid status filter', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    mockGetAllRequests.mockResolvedValue([]);
    const res = await GET(
      asNextRequest(
        buildGetRequest(
          'http://localhost/api/admin/tutor-change-requests?status=pending',
        ),
      ) as never,
    );
    expect(res.status).toBe(200);
    expect(mockGetAllRequests).toHaveBeenCalledWith('pending');
  });

  it('rejects an invalid status filter with 400', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const res = await GET(
      asNextRequest(
        buildGetRequest(
          'http://localhost/api/admin/tutor-change-requests?status=bogus',
        ),
      ) as never,
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/tutor-change-requests/[id]/alternatives', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockProposeAlternatives.mockReset();
  });

  it('returns 422 when alternative_tutor_ids is empty', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const res = await PATCH_ALTS(
      buildPatchRequest(
        `http://localhost/api/admin/tutor-change-requests/${REQUEST_ID}/alternatives`,
        { alternative_tutor_ids: [] },
      ) as never,
      { params: Promise.resolve({ id: REQUEST_ID }) },
    );
    expect(res.status).toBe(422);
    expect(mockProposeAlternatives).not.toHaveBeenCalled();
  });

  it('returns 422 when alternative_tutor_ids exceeds 3', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const res = await PATCH_ALTS(
      buildPatchRequest(
        `http://localhost/api/admin/tutor-change-requests/${REQUEST_ID}/alternatives`,
        {
          alternative_tutor_ids: [
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            'cccccccc-cccc-cccc-cccc-cccccccccccc',
            'dddddddd-dddd-dddd-dddd-dddddddddddd',
          ],
        },
      ) as never,
      { params: Promise.resolve({ id: REQUEST_ID }) },
    );
    expect(res.status).toBe(422);
  });

  it('returns 200 on a valid proposal', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const nowIso = new Date().toISOString();
    mockProposeAlternatives.mockResolvedValue({
      id: REQUEST_ID,
      student_id: STUDENT_UUID,
      session_booking_id: BOOKING_UUID,
      current_tutor_id: TUTOR_UUID,
      status: 'alternatives_proposed',
      requested_at: nowIso,
      sla_deadline: nowIso,
      responded_at: nowIso,
      proposed_alternative_tutor_ids: [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ],
      selected_tutor_id: null,
      student_reason: null,
      admin_notes: null,
      created_at: nowIso,
      updated_at: nowIso,
      overdue: false,
    });

    const res = await PATCH_ALTS(
      buildPatchRequest(
        `http://localhost/api/admin/tutor-change-requests/${REQUEST_ID}/alternatives`,
        {
          alternative_tutor_ids: [
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          ],
        },
      ) as never,
      { params: Promise.resolve({ id: REQUEST_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { status: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe('alternatives_proposed');
  });
});
