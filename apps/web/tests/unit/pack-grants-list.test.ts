import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Phase 1 — Feature B: Pack 10 admin list service smoke tests.
//
// `services/admin/pack-grants.ts::listPackGrants` is the read
// service for the new /admin/packs page. It is admin-gated by
// RLS (`session_grants_select_admin`) — the page route guards
// on `requireAdmin()` first, then uses the untyped server
// client. We mock the server client and assert:
//   - it filters by `grant_type = 'pack'`
//   - it orders by `created_at desc`
//   - it caps at 200 rows
//   - it flattens the `profiles` join into the row shape
//   - it throws on Supabase failure so the page can render the
//     `AdminFetchResult` error envelope through `safeAdminFetch()`
//
// The detail-page service (`getPackGrantById`) is intentionally
// NOT covered here — it's a single-row reader and is exercised
// by the integration tests on the detail route.
// =====================================================================

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({ from: mockFrom }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const { listPackGrants } = await import('@/services/admin/pack-grants');

interface CapturedQuery {
  selectArgs?: unknown;
  orderArgs?: unknown[];
  limitArg?: number;
  eqCalls: Array<{ column: string; value: unknown }>;
}

function buildChain(payload: { data?: unknown; error?: unknown }) {
  const capture: CapturedQuery = { eqCalls: [] };
  const result = { data: payload.data ?? null, error: payload.error ?? null };
  const chain = {
    select: (...args: unknown[]) => {
      capture.selectArgs = args;
      return chain;
    },
    order: (...args: unknown[]) => {
      capture.orderArgs = args;
      return chain;
    },
    limit: (n: number) => {
      capture.limitArg = n;
      return chain;
    },
    eq: (column: string, value: unknown) => {
      capture.eqCalls.push({ column, value });
      return chain;
    },
    then: (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
    ) => Promise.resolve(result).then(onFulfilled),
  };
  return { chain, capture };
}

const PACK_ROW = (overrides: Partial<{
  id: string;
  student_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  total_credits: number | null;
  consumed_credits: number;
  refunded_at: string | null;
  refunded_amount_cents: number;
  created_at: string;
  expires_at: string | null;
  student: { id: string; full_name: string | null; email: string | null } | null;
}> = {}) => ({
  id: 'pack-1',
  student_id: 'stu-1',
  status: 'active',
  amount_cents: 29900,
  currency: 'EUR',
  total_credits: 10,
  consumed_credits: 3,
  refunded_at: null,
  refunded_amount_cents: 0,
  created_at: '2026-06-01T00:00:00.000Z',
  expires_at: '2026-12-01T00:00:00.000Z',
  student: { id: 'stu-1', full_name: 'Alice', email: 'alice@example.com' },
  ...overrides,
});

describe('listPackGrants — smoke tests', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns [] when no Pack 10 grants exist', async () => {
    const { chain } = buildChain({ data: [] });
    mockFrom.mockImplementation(() => chain);
    const out = await listPackGrants();
    expect(out).toEqual([]);
  });

  it('queries session_grants with the pack grant_type filter', async () => {
    const { chain, capture } = buildChain({ data: [] });
    mockFrom.mockImplementation(() => chain);
    await listPackGrants();
    expect(mockFrom).toHaveBeenCalledWith('session_grants');
    const packFilter = capture.eqCalls.find((c) => c.column === 'grant_type');
    expect(packFilter).toBeDefined();
    expect(packFilter?.value).toBe('pack');
  });

  it('orders by created_at desc and caps the page at 200', async () => {
    const { chain, capture } = buildChain({ data: [] });
    mockFrom.mockImplementation(() => chain);
    await listPackGrants();
    expect(capture.orderArgs?.[0]).toBe('created_at');
    expect(capture.orderArgs?.[1]).toEqual({ ascending: false });
    expect(capture.limitArg).toBe(200);
  });

  it('flattens the profiles join into the camelCase row shape', async () => {
    const row = PACK_ROW({
      id: 'pack-42',
      student_id: 'stu-99',
      status: 'active',
      amount_cents: 29900,
      currency: 'EUR',
      total_credits: 10,
      consumed_credits: 5,
      created_at: '2026-06-15T08:00:00.000Z',
      student: {
        id: 'stu-99',
        full_name: 'Bob Liddell',
        email: 'bob@example.com',
      },
    });
    const { chain } = buildChain({ data: [row] });
    mockFrom.mockImplementation(() => chain);
    const out = await listPackGrants();
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      id: 'pack-42',
      studentId: 'stu-99',
      studentName: 'Bob Liddell',
      studentEmail: 'bob@example.com',
      status: 'active',
      amountCents: 29900,
      currency: 'EUR',
      totalCredits: 10,
      consumedCredits: 5,
      refundedAt: null,
      refundedAmountCents: 0,
      createdAt: '2026-06-15T08:00:00.000Z',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });
  });

  it('falls back to total_credits=10 when the column is null (defensive)', async () => {
    const row = PACK_ROW({ total_credits: null });
    const { chain } = buildChain({ data: [row] });
    mockFrom.mockImplementation(() => chain);
    const out = await listPackGrants();
    expect(out[0]?.totalCredits).toBe(10);
  });

  it('handles a missing profiles join (student=null)', async () => {
    const row = PACK_ROW({ student: null });
    const { chain } = buildChain({ data: [row] });
    mockFrom.mockImplementation(() => chain);
    const out = await listPackGrants();
    expect(out[0]?.studentName).toBeNull();
    expect(out[0]?.studentEmail).toBeNull();
  });

  it('throws on Supabase failure so the page can render the error envelope', async () => {
    const { chain } = buildChain({
      data: null,
      error: { message: 'connection refused' },
    });
    mockFrom.mockImplementation(() => chain);
    await expect(listPackGrants()).rejects.toBeDefined();
  });
});
