import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 8 — N-3 audit_logs cursor-paginated reader tests.
//
// The service is admin-gated by RLS (`audit_logs_select_admin`)
// and by the route layer. These tests pin the (ts,id) cursor
// emission and the +1 lookahead pattern.
//
//   - nextCursor=null on under-filled page
//   - nextCursor!=null on full page
//   - .or() predicate is emitted when `cursor` is supplied
//   - .lt() predicate is emitted when only `before` is supplied
//   - .eq(table_name) and .eq(action) filters are forwarded
//   - read failure degrades to { data: [], nextCursor: null }
// =====================================================================

const mockFrom = vi.fn();
const { listAuditLogs } = await import('@/services/admin/audit-logs');

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

interface CapturedQuery {
  selectArgs?: unknown;
  orderArgs?: unknown[];
  limitArg?: number;
  eqCalls: Array<{ column: string; value: unknown }>;
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
  self.eq = (column: string, value: unknown) => {
    capture.eqCalls.push({ column, value });
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

const ROW = (id: string, createdAt: string) => ({
  id,
  table_name: 'bookings',
  row_id: 'r-1',
  action: 'INSERT',
  actor_id: 'a-1',
  changes: { foo: 'bar' },
  created_at: createdAt,
});

describe('listAuditLogs — cursor pagination', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns nextCursor=null on an under-filled page', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain(
        {
          data: [
            ROW('a-1', '2026-01-02T00:00:00.000Z'),
            ROW('a-2', '2026-01-01T00:00:00.000Z'),
          ],
        },
        capture,
      ),
    );
    const res = await listAuditLogs({ limit: 20 });
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).toBeNull();
  });

  it('returns nextCursor when +1 lookahead exists', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    const data = [
      ROW('a-3', '2026-02-03T00:00:00.000Z'),
      ROW('a-2', '2026-02-02T00:00:00.000Z'),
      ROW('a-1', '2026-02-01T00:00:00.000Z'),
    ];
    mockFrom.mockImplementation(() => buildChain({ data }, capture));
    const res = await listAuditLogs({ limit: 2 });
    expect(res.data).toHaveLength(2);
    expect(res.nextCursor).not.toBeNull();
    expect(capture.limitArg).toBe(3);
  });

  it('emits the .or() predicate when cursor is supplied', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain({ data: [] }, capture),
    );
    const { encodeCursor } = await import('@/lib/validations/cursor');
    const real = encodeCursor({
      ts: '2026-01-01T00:00:00.000Z',
      id: 'cursor-id',
    });
    await listAuditLogs({ limit: 5, cursor: real });
    expect(capture.orCalls).toHaveLength(1);
    expect(capture.orCalls[0]?.expr).toMatch(/^created_at\.lt\./);
    expect(capture.orCalls[0]?.expr).toMatch(/and\(created_at\.eq\./);
    expect(capture.orCalls[0]?.expr).toMatch(/id\.lt\./);
    expect(capture.ltCalls).toHaveLength(0);
  });

  it('emits .lt() when only before is supplied (back-compat)', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain({ data: [] }, capture),
    );
    await listAuditLogs({
      limit: 5,
      before: '2026-01-01T00:00:00.000Z',
    });
    expect(capture.ltCalls).toHaveLength(1);
    expect(capture.ltCalls[0]?.column).toBe('created_at');
    expect(capture.orCalls).toHaveLength(0);
  });

  it('forwards table_name + action as .eq() filters', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain({ data: [] }, capture),
    );
    await listAuditLogs({
      limit: 5,
      tableName: 'bookings',
      action: 'UPDATE',
    });
    const cols = capture.eqCalls.map((c) => c.column);
    expect(cols).toContain('table_name');
    expect(cols).toContain('action');
    expect(capture.eqCalls.find((c) => c.column === 'table_name')?.value).toBe(
      'bookings',
    );
    expect(capture.eqCalls.find((c) => c.column === 'action')?.value).toBe(
      'UPDATE',
    );
  });

  it('maps snake_case row → camelCase entry', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain(
        {
          data: [
            {
              id: 'a-1',
              table_name: 'profiles',
              row_id: 'r-9',
              action: 'DELETE',
              actor_id: 'admin-1',
              changes: null,
              created_at: '2026-03-01T00:00:00.000Z',
            },
          ],
        },
        capture,
      ),
    );
    const res = await listAuditLogs({ limit: 5 });
    expect(res.data[0]).toEqual({
      id: 'a-1',
      tableName: 'profiles',
      rowId: 'r-9',
      action: 'DELETE',
      actorId: 'admin-1',
      changes: null,
      createdAt: '2026-03-01T00:00:00.000Z',
    });
  });

  it('degrades to empty result on a Supabase error', async () => {
    const capture: CapturedQuery = { eqCalls: [], ltCalls: [], orCalls: [] };
    mockFrom.mockImplementation(() =>
      buildChain(
        {
          data: null,
          error: { message: 'permission denied' },
        },
        capture,
      ),
    );
    const res = await listAuditLogs({ limit: 5 });
    expect(res.data).toEqual([]);
    expect(res.nextCursor).toBeNull();
  });
});