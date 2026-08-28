import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 8 — N-3 cursor pagination for the notifications feed.
//
// Verifies:
//   - the service returns `nextCursor: null` on an under-filled page
//   - the service returns `nextCursor: string` on a full page (one
//     more row was fetched as the lookahead)
//   - `cursor` and `before` both narrow the result
//   - the SQL builder feeds PostgREST the right predicate for the
//     cursor case (smoke check on the chained query)
// =====================================================================

const mockFrom = vi.fn();
const { listMyNotifications } = await import('@/services/notifications');

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

// ----- Helpers -----------------------------------------------------------

interface CapturedQuery {
  selectArgs?: unknown;
  orderArgs?: unknown[];
  limitArg?: number;
  isCalls: Array<{ column: string; value: unknown }>;
  ltCalls: Array<{ column: string; value: unknown }>;
  orCalls: Array<{ expr: string }>;
}

function buildChain(
  payload: { data?: unknown; error?: unknown },
  capture: CapturedQuery,
): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  self.select = (...args: unknown[]) => {
    capture.selectArgs = args;
    return self;
  };
  self.order = (...args: unknown[]) => {
    capture.orderArgs = args;
    return self;
  };
  self.limit = (n: number) => {
    capture.limitArg = n;
    return self;
  };
  self.is = (column: string, value: unknown) => {
    capture.isCalls.push({ column, value });
    return self;
  };
  self.lt = (column: string, value: unknown) => {
    capture.ltCalls.push({ column, value });
    return self;
  };
  self.or = (expr: string) => {
    capture.orCalls.push({ expr });
    return self;
  };
  const result = { data: payload.data ?? null, error: payload.error ?? null };
  self.then = (onFulfilled: (v: typeof result) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return self;
}

const SAMPLE_NOTIFICATION = (id: string, sentAt: string) => ({
  id,
  user_id: 'u-1',
  type: 'booking_reminder',
  channel: 'in_app',
  subject: null,
  body: null,
  payload: {},
  read_at: null,
  sent_at: sentAt,
  created_at: sentAt,
});

describe('listMyNotifications — cursor pagination', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns nextCursor=null when the page is not full', async () => {
    const capture: CapturedQuery = { isCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain(
        {
          data: [
            SAMPLE_NOTIFICATION('n-1', '2026-01-02T00:00:00.000Z'),
            SAMPLE_NOTIFICATION('n-2', '2026-01-01T00:00:00.000Z'),
          ],
        },
        capture,
      ),
    );
    const { data, nextCursor } = await listMyNotifications({ limit: 20 });
    expect(data).toHaveLength(2);
    expect(nextCursor).toBeNull();
  });

  it('returns nextCursor when the +1 lookahead row exists', async () => {
    const capture: CapturedQuery = { isCalls: [], ltCalls: [], orCalls: [] };
    // limit=2 + lookahead → 3 rows; we expect data length 2 + cursor.
    const data = [
      SAMPLE_NOTIFICATION('n-3', '2026-02-03T00:00:00.000Z'),
      SAMPLE_NOTIFICATION('n-2', '2026-02-02T00:00:00.000Z'),
      SAMPLE_NOTIFICATION('n-1', '2026-02-01T00:00:00.000Z'),
    ];
    mockFrom.mockImplementation(() => buildChain({ data }, capture));
    const res = await listMyNotifications({ limit: 2 });
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).not.toBeNull();
    expect(capture.limitArg).toBe(3); // limit + 1 lookahead
  });

  it('emits the .or() predicate when `cursor` is supplied', async () => {
    const capture: CapturedQuery = { isCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain({ data: [] }, capture),
    );
    // Use a real encoded cursor so `resolveCursor` decodes
    // successfully and the .or() branch is taken.
    const { encodeCursor } = await import('@/lib/validations/cursor');
    const real = encodeCursor({
      ts: '2026-01-01T00:00:00.000Z',
      id: 'cursor-id',
    });
    await listMyNotifications({ limit: 5, cursor: real });
    expect(capture.orCalls).toHaveLength(1);
    expect(capture.orCalls[0]?.expr).toMatch(/^sent_at\.lt\./);
    expect(capture.orCalls[0]?.expr).toMatch(/and\(sent_at\.eq\./);
  });

  it('emits the .lt() predicate when only `before` is supplied (back-compat)', async () => {
    const capture: CapturedQuery = { isCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain({ data: [] }, capture),
    );
    await listMyNotifications({ limit: 5, before: '2026-01-01T00:00:00.000Z' });
    expect(capture.ltCalls).toHaveLength(1);
    expect(capture.ltCalls[0]?.column).toBe('sent_at');
    expect(capture.orCalls).toHaveLength(0);
  });
});