import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 7 — M5.2 Notification feed route tests.
//
// Sprint 8 — N-3: the GET handler now accepts an opaque `cursor`
// parameter and forwards `{data, nextCursor}` from the service.
// The existing `before` parameter is preserved for back-compat.
//
// Coverage:
//   GET  /api/notifications
//     - 401 when no signed-in user
//     - 200 forwards limit/unread_only/before/cursor to the service
//     - 422 on invalid query (limit out of range, bad before)
//     - 200 wraps service payload in { ok, data, nextCursor }
//   POST /api/notifications/[id]/read
//     - 401 when no signed-in user
//     - 422 when path id is not a UUID
//     - 200 forwards id to the service
//   POST /api/notifications/read-all
//     - 401 when no signed-in user (delegated to service)
//     - 200 forwards to the service
// =====================================================================

const mockAuthGetUser = vi.fn();
const mockListMyNotifications = vi.fn();
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({
    from: mockFrom,
    auth: { getUser: mockAuthGetUser },
  }),
}));

vi.mock('@/services/notifications', () => ({
  listMyNotifications: mockListMyNotifications,
  markAsRead: mockMarkAsRead,
  markAllAsRead: mockMarkAllAsRead,
}));

const { GET } = await import('@/app/api/notifications/route');
const { POST: POST_READ } = await import(
  '@/app/api/notifications/[id]/read/route'
);
const { POST: POST_READ_ALL } = await import(
  '@/app/api/notifications/read-all/route'
);

const USER_UUID = '11111111-1111-1111-1111-111111111111';
const NOTIF_UUID = '22222222-2222-2222-2222-222222222222';

function buildGet(url: string): Request {
  return new Request(url, { method: 'GET' });
}
function buildPost(url: string, body: unknown = {}): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function asNextRequest(req: Request): unknown {
  (req as unknown as { nextUrl: URL }).nextUrl = new URL(req.url);
  return req;
}

describe('GET /api/notifications', () => {
  beforeEach(() => {
    mockAuthGetUser.mockReset();
    mockListMyNotifications.mockReset();
  });

  it('returns 401 when no signed-in user', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/notifications')) as never,
    );
    expect(res.status).toBe(401);
    expect(mockListMyNotifications).not.toHaveBeenCalled();
  });

  it('forwards parsed query to the service on a valid request', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockListMyNotifications.mockResolvedValue({ data: [], nextCursor: null });
    const res = await GET(
      asNextRequest(
        buildGet(
          'http://localhost/api/notifications?limit=5&unread_only=true&before=2026-08-27T00:00:00.000Z',
        ),
      ) as never,
    );
    expect(res.status).toBe(200);
    expect(mockListMyNotifications).toHaveBeenCalledWith({
      limit: 5,
      unreadOnly: true,
      before: '2026-08-27T00:00:00.000Z',
      cursor: undefined,
    });
  });

  it('forwards an opaque cursor when supplied', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockListMyNotifications.mockResolvedValue({ data: [], nextCursor: null });
    await GET(
      asNextRequest(
        buildGet(
          'http://localhost/api/notifications?limit=5&cursor=eyJ0cyI6IjIwMjYtMDgtMjVUMDA6MDA6MDAuMDAwWiIsImlkIjoiYWJjIn0',
        ),
      ) as never,
    );
    expect(mockListMyNotifications).toHaveBeenCalledWith({
      limit: 5,
      unreadOnly: undefined,
      before: undefined,
      cursor:
        'eyJ0cyI6IjIwMjYtMDgtMjVUMDA6MDA6MDAuMDAwWiIsImlkIjoiYWJjIn0',
    });
  });

  it('returns 200 with empty list when nothing is provided', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockListMyNotifications.mockResolvedValue({ data: [], nextCursor: null });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/notifications')) as never,
    );
    expect(res.status).toBe(200);
    expect(mockListMyNotifications).toHaveBeenCalledWith({
      limit: undefined,
      unreadOnly: undefined,
      before: undefined,
      cursor: undefined,
    });
  });

  it('returns 422 on an out-of-range limit', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/notifications?limit=500')) as never,
    );
    expect(res.status).toBe(422);
    expect(mockListMyNotifications).not.toHaveBeenCalled();
  });

  it('returns 422 on a bad before timestamp', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    const res = await GET(
      asNextRequest(
        buildGet('http://localhost/api/notifications?before=not-a-date'),
      ) as never,
    );
    expect(res.status).toBe(422);
    expect(mockListMyNotifications).not.toHaveBeenCalled();
  });

  it('returns 200 with the service payload', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockListMyNotifications.mockResolvedValue({
      data: [
        {
          id: NOTIF_UUID,
          user_id: USER_UUID,
          type: 'booking_reminder',
          channel: 'in_app',
          subject: null,
          body: null,
          payload: {},
          read_at: null,
          sent_at: '2026-08-27T10:00:00.000Z',
          created_at: '2026-08-27T10:00:00.000Z',
          unread: true,
        },
      ],
      nextCursor: 'eyJ0cyI6IjIwMjYtMDgtMjVUMDA6MDA6MDAuMDAwWiIsImlkIjoibm90aWYtMSJ9',
    });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/notifications')) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: ReadonlyArray<{ id: string; unread: boolean }>;
      nextCursor: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe(NOTIF_UUID);
    expect(body.data[0]?.unread).toBe(true);
    expect(body.nextCursor).not.toBeNull();
  });

  it('returns 200 with null nextCursor when no more pages', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockListMyNotifications.mockResolvedValue({ data: [], nextCursor: null });
    const res = await GET(
      asNextRequest(buildGet('http://localhost/api/notifications')) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nextCursor: string | null };
    expect(body.nextCursor).toBeNull();
  });

  it('returns 400 on a malformed cursor', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    const res = await GET(
      asNextRequest(
        buildGet('http://localhost/api/notifications?cursor=!!not-base64!!'),
      ) as never,
    );
    expect(res.status).toBe(400);
    expect(mockListMyNotifications).not.toHaveBeenCalled();
  });
});

describe('POST /api/notifications/[id]/read', () => {
  beforeEach(() => {
    mockAuthGetUser.mockReset();
    mockMarkAsRead.mockReset();
  });

  it('returns 401 when no signed-in user', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST_READ(
      buildPost(`http://localhost/api/notifications/${NOTIF_UUID}/read`) as never,
      { params: Promise.resolve({ id: NOTIF_UUID }) },
    );
    expect(res.status).toBe(401);
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it('returns 422 when the path id is not a UUID', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    const res = await POST_READ(
      buildPost('http://localhost/api/notifications/nope/read') as never,
      { params: Promise.resolve({ id: 'nope' }) },
    );
    expect(res.status).toBe(422);
    expect(mockMarkAsRead).not.toHaveBeenCalled();
  });

  it('forwards the id to the service on a valid request', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: USER_UUID } } });
    mockMarkAsRead.mockResolvedValue({
      id: NOTIF_UUID,
      user_id: USER_UUID,
      type: 'booking_reminder',
      channel: 'in_app',
      subject: null,
      body: null,
      payload: {},
      read_at: '2026-08-27T10:00:00.000Z',
      sent_at: '2026-08-27T10:00:00.000Z',
      created_at: '2026-08-27T10:00:00.000Z',
      unread: false,
    });
    const res = await POST_READ(
      buildPost(`http://localhost/api/notifications/${NOTIF_UUID}/read`) as never,
      { params: Promise.resolve({ id: NOTIF_UUID }) },
    );
    expect(res.status).toBe(200);
    expect(mockMarkAsRead).toHaveBeenCalledWith(NOTIF_UUID);
  });
});

describe('POST /api/notifications/read-all', () => {
  beforeEach(() => {
    mockAuthGetUser.mockReset();
    mockMarkAllAsRead.mockReset();
  });

  it('returns 401 when no signed-in user (delegated)', async () => {
    // The route does not call auth itself; the service does. The
    // service mock rejects with the typed 401 envelope.
    mockMarkAllAsRead.mockRejectedValue(
      new (await import('@/lib/utils/errors')).ApiError(
        401,
        'unauthorized',
        'Sign in required.',
      ),
    );
    const res = await POST_READ_ALL(
      buildPost('http://localhost/api/notifications/read-all') as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 with the count payload', async () => {
    mockMarkAllAsRead.mockResolvedValue({ updated: 3 });
    const res = await POST_READ_ALL(
      buildPost('http://localhost/api/notifications/read-all') as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { updated: number } };
    expect(body.ok).toBe(true);
    expect(body.data.updated).toBe(3);
  });
});
