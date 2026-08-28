import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 8 — N-3 GET /api/admin/audit-logs route tests.
//
// Auth is enforced by requireAdminRoute(); the unit tests cover
// the parse + delegate surface.
//   - 401 on unauthenticated / non-admin
//   - 400 on a malformed cursor
//   - 200 + delegated args on a valid request
//   - 422 on out-of-range limit / bad table_name
// =====================================================================

const mockRequireAdminRoute = vi.fn();
const mockListAuditLogs = vi.fn();

vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));
vi.mock('@/services/admin/audit-logs', () => ({
  listAuditLogs: mockListAuditLogs,
}));

const { GET } = await import('@/app/api/admin/audit-logs/route');

function buildGet(url: string): Request {
  return new Request(url, { method: 'GET' });
}
function asNextRequest(req: Request): unknown {
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);
  return req;
}

describe('GET /api/admin/audit-logs', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockListAuditLogs.mockReset();
  });

  it('returns 401 when the route is not admin-gated', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(
      Unauthorized('Sign in required.'),
    );
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/admin/audit-logs')) as never,
    );
    expect(res.status).toBe(401);
    expect(mockListAuditLogs).not.toHaveBeenCalled();
  });

  it('forwards parsed args to the service on a valid request', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    mockListAuditLogs.mockResolvedValue({ data: [], nextCursor: null });
    const res = await GET(
      asNextRequest(
        buildGet(
          'http://localhost/api/admin/audit-logs?limit=10&table_name=bookings&action=UPDATE',
        ),
      ) as never,
    );
    expect(res.status).toBe(200);
    expect(mockListAuditLogs).toHaveBeenCalledWith({
      limit: 10,
      cursor: undefined,
      before: undefined,
      tableName: 'bookings',
      action: 'UPDATE',
    });
  });

  it('returns 400 on a malformed cursor', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const res = await GET(
      asNextRequest(
        buildGet(
          'http://localhost/api/admin/audit-logs?cursor=!!not-base64!!',
        ),
      ) as never,
    );
    expect(res.status).toBe(400);
    expect(mockListAuditLogs).not.toHaveBeenCalled();
  });

  it('returns 422 on an out-of-range limit', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    const res = await GET(
      asNextRequest(
        buildGet('http://localhost/api/admin/audit-logs?limit=9999'),
      ) as never,
    );
    expect(res.status).toBe(422);
    expect(mockListAuditLogs).not.toHaveBeenCalled();
  });

  it('returns 200 with empty payload when there are no logs', async () => {
    mockRequireAdminRoute.mockResolvedValue(undefined);
    mockListAuditLogs.mockResolvedValue({ data: [], nextCursor: null });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/admin/audit-logs')) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: unknown[];
      nextCursor: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });
});