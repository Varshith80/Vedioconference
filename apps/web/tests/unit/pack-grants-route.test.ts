import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Phase 1 — Feature B: API route tests for
//   GET  /api/admin/pack-grants
//   GET  /api/admin/pack-grants/[id]
//   GET  /api/admin/pack-grants/[id]/refund-preview
//   POST /api/admin/pack-grants/[id]/refund
//
// Authorization: 401 anonymous, 403 non-admin, 200/404/409/422
// for the actual flows. We mock requireAdminRoute + the
// service layer.
// =====================================================================

const mockRequireAdmin = vi.fn();
const mockExecutePackRefund = vi.fn();
const mockGetPackGrantById = vi.fn();
const mockCalculatePackRefundPreview = vi.fn();
const mockListPackGrants = vi.fn();

vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: () => mockRequireAdmin(),
}));

vi.mock('@/services/admin/pack-grants', () => ({
  executePackRefund: (...args: unknown[]) => mockExecutePackRefund(...args),
  getPackGrantById: (...args: unknown[]) => mockGetPackGrantById(...args),
  calculatePackRefundPreview: (...args: unknown[]) => mockCalculatePackRefundPreview(...args),
  listPackGrants: () => mockListPackGrants(),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: () => ({
    N8N_ENROLLMENT_WEBHOOK_URL: 'https://n8n.test/webhook/enrollment-refunded',
    N8N_WEBHOOK_SECRET: 'secret-abc',
  }),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { GET: listGet } = await import('@/app/api/admin/pack-grants/route');
const { GET: detailGet } = await import('@/app/api/admin/pack-grants/[id]/route');
const { GET: previewGet } = await import('@/app/api/admin/pack-grants/[id]/refund-preview/route');
const { POST: refundPost } = await import('@/app/api/admin/pack-grants/[id]/refund/route');

const ADMIN_CTX = {
  user: { id: 'admin-1' },
  profile: { id: 'admin-1', role: 'admin' },
  supabase: {} as never,
};

function req(url: string, method: 'GET' | 'POST' = 'GET'): Request {
  return new Request(url, { method });
}

/** Next 15 App Router hands routes a `NextRequest`, which
 *  is a `Request` with `nextUrl` attached. The audit-logs
 *  test established this helper. */
function asNextRequest(r: Request): never {
  (r as unknown as { nextUrl: URL }).nextUrl = new URL(r.url);
  return r as never;
}

beforeEach(() => {
  mockRequireAdmin.mockReset();
  mockExecutePackRefund.mockReset();
  mockGetPackGrantById.mockReset();
  mockCalculatePackRefundPreview.mockReset();
  mockListPackGrants.mockReset();
});

describe('GET /api/admin/pack-grants', () => {
  it('returns 401 when the user is not signed in', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdmin.mockRejectedValue(Unauthorized('You must be signed in.'));
    const res = await listGet(asNextRequest(req('http://localhost/api/admin/pack-grants')));
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin signed-in users', async () => {
    const { Forbidden } = await import('@/lib/utils/errors');
    mockRequireAdmin.mockRejectedValue(Forbidden('Only admins can perform this action.'));
    const res = await listGet(asNextRequest(req('http://localhost/api/admin/pack-grants')));
    expect(res.status).toBe(403);
  });

  it('returns 200 with the list for an admin', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockListPackGrants.mockResolvedValue([
      {
        id: 'pack-1',
        studentId: 'stu-1',
        studentName: 'Alice',
        studentEmail: 'a@x.test',
        status: 'active',
        amountCents: 29900,
        currency: 'EUR',
        totalCredits: 10,
        consumedCredits: 3,
        refundedAt: null,
        refundedAmountCents: 0,
        createdAt: '2026-06-01T00:00:00.000Z',
        expiresAt: '2026-12-01T00:00:00.000Z',
      },
    ]);
    const res = await listGet(asNextRequest(req('http://localhost/api/admin/pack-grants')));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: unknown[] };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/admin/pack-grants/[id]', () => {
  it('returns 404 when the row is missing', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockGetPackGrantById.mockResolvedValue(null);
    const res = await detailGet(asNextRequest(req('http://localhost/api/admin/pack-grants/missing')), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 200 with the row when found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockGetPackGrantById.mockResolvedValue({
      id: 'pack-1',
      studentId: 'stu-1',
      status: 'active',
      amountCents: 29900,
      totalCredits: 10,
      consumedCredits: 5,
      refundedAt: null,
      refundedAmountCents: 0,
      createdAt: '2026-06-01T00:00:00.000Z',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
    const res = await detailGet(asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1')), {
      params: Promise.resolve({ id: 'pack-1' }),
    });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/admin/pack-grants/[id]/refund-preview', () => {
  it('returns 404 when the row is missing', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockGetPackGrantById.mockResolvedValue(null);
    const res = await previewGet(
      asNextRequest(req('http://localhost/api/admin/pack-grants/missing/refund-preview')),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with the preview when found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockGetPackGrantById.mockResolvedValue({
      id: 'pack-1',
      totalCredits: 10,
      consumedCredits: 5,
      amountCents: 29900,
      status: 'active',
    });
    mockCalculatePackRefundPreview.mockReturnValue({
      kind: 'ok',
      unusedSessions: 5,
      calculatedCents: 17500,
      actualCents: 17500,
      capped: false,
    });
    const res = await previewGet(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund-preview')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { preview: { kind: string; unusedSessions?: number } };
    };
    expect(body.data.preview.kind).toBe('ok');
  });
});

describe('POST /api/admin/pack-grants/[id]/refund', () => {
  it('returns 200 with refund_status=n8n_accepted on the happy path', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({
      kind: 'ok',
      refundRequestId: 'pack-1:2026-09-13T00:00:00.000Z',
      requestedAmountCents: 17500,
      currency: 'EUR',
    });
    mockGetPackGrantById.mockResolvedValue({
      id: 'pack-1',
      status: 'active',
      refundedAt: null,
      refundedAmountCents: 0,
    } as never);
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { refund_status: string; requested_amount_cents: number; currency: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.refund_status).toBe('n8n_accepted');
    expect(body.data.requested_amount_cents).toBe(17500);
    expect(body.data.currency).toBe('EUR');
  });

  it('returns 404 when the service reports not_found', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({ kind: 'not_found' });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/missing/refund', 'POST')),
      { params: Promise.resolve({ id: 'missing' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when the service reports invalid_state', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({
      kind: 'invalid_state',
      currentStatus: 'cancelled',
    });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('returns 409 when the service reports already_refunded (race or duplicate)', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({ kind: 'already_refunded' });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(409);
  });

  it('returns 422 when the service reports refund_zero', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({ kind: 'refund_zero', unusedSessions: 0 });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(422);
  });

  it('returns 502 when the service reports webhook_failed', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({
      kind: 'webhook_failed',
      reason: 'n8n returned 500',
      refundRequestId: 'pack-1:2026-09-13T00:00:00.000Z',
    });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as {
      error: { code: string; details?: { refund_request_id?: string } };
    };
    expect(body.error.code).toBe('pack_refund_webhook_failed');
    expect(body.error.details?.refund_request_id).toBe('pack-1:2026-09-13T00:00:00.000Z');
  });

  it('returns 503 when the service reports webhook_unavailable', async () => {
    mockRequireAdmin.mockResolvedValue(ADMIN_CTX);
    mockExecutePackRefund.mockResolvedValue({
      kind: 'webhook_unavailable',
      reason: 'not_configured',
      refundRequestId: 'pack-1:2026-09-13T00:00:00.000Z',
    });
    const res = await refundPost(
      asNextRequest(req('http://localhost/api/admin/pack-grants/pack-1/refund', 'POST')),
      { params: Promise.resolve({ id: 'pack-1' }) },
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      error: { code: string; details?: { refund_request_id?: string } };
    };
    expect(body.error.code).toBe('pack_refund_webhook_unavailable');
    expect(body.error.details?.refund_request_id).toBe('pack-1:2026-09-13T00:00:00.000Z');
  });
});
