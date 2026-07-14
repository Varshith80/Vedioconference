import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the Sprint 3.6 admin overview service. The
// service issues 7 parallel `from(...).select(...)` queries
// and aggregates the results. We mock the untyped server
// client so the queries return canned data; the test asserts
// the aggregations (revenue / refunds) and the table counts
// are right.

// ----- Mocks ------------------------------------------------------------

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { getOverviewCounters } from '@/services/admin/overview';

// ----- Helpers -----------------------------------------------------------

// Each call to .from(TABLE) returns a thenable chainable
// object whose final awaited shape is `{ data, error }`. The
// `eq` chain only matters for the profiles query (role =
// 'student'). We resolve with the canned data when the
// caller awaits the chain.
function buildChain(data: ReadonlyArray<Record<string, unknown>>, error: unknown = null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    then: (resolve: (v: { data: ReadonlyArray<Record<string, unknown>>; error: unknown }) => void) =>
      resolve({ data, error }),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
  mockSelect.mockReset();
  mockEq.mockReset();
});

// ----- Tests ------------------------------------------------------------

describe('getOverviewCounters', () => {
  it('returns the table counts and zeroes for revenue / refunds when all tables are empty', async () => {
    // Empty responses for all 7 tables.
    mockFrom.mockImplementation(() => buildChain([]));
    const out = await getOverviewCounters();
    expect(out).toEqual({
      studentsCount: 0,
      coursesCount: 0,
      chaptersCount: 0,
      sessionsCount: 0,
      sessionGrantsCount: 0,
      sessionBookingsCount: 0,
      revenueCents: 0,
      refundsCents: 0,
    });
  });

  it('sums succeeded payments linked to a session_grant into revenueCents', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payments') {
        return buildChain([
          { id: 'p1', status: 'succeeded', amount_cents: 1000,  session_grant_id: 'g1' },
          { id: 'p2', status: 'succeeded', amount_cents: 2500,  session_grant_id: 'g2' },
          { id: 'p3', status: 'succeeded', amount_cents: 5000,  session_grant_id: null }, // v1 — excluded
          { id: 'p4', status: 'pending',   amount_cents: 9999,  session_grant_id: 'g3' }, // not succeeded
        ]);
      }
      return buildChain([]);
    });
    const out = await getOverviewCounters();
    expect(out.revenueCents).toBe(3500); // 1000 + 2500
  });

  it('sums refunded payments linked to a session_grant into refundsCents', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payments') {
        return buildChain([
          { id: 'p1', status: 'refunded', amount_cents: 1200, session_grant_id: 'g1' },
          { id: 'p2', status: 'refunded', amount_cents: 800,  session_grant_id: 'g2' },
          { id: 'p3', status: 'refunded', amount_cents: 9999, session_grant_id: null }, // v1 — excluded
        ]);
      }
      return buildChain([]);
    });
    const out = await getOverviewCounters();
    expect(out.refundsCents).toBe(2000);
  });

  it('counts rows for each catalog table', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_grants')    return buildChain([{ id: 'g1' }, { id: 'g2' }]);
      if (table === 'session_bookings')  return buildChain([{ id: 'b1' }]);
      if (table === 'students' || table === 'profiles') return buildChain([{ id: 's1' }, { id: 's2' }, { id: 's3' }]);
      if (table === 'courses')           return buildChain([{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }]);
      if (table === 'chapters')          return buildChain([{ id: 'ch1' }, { id: 'ch2' }]);
      if (table === 'sessions')          return buildChain([{ id: 'se1' }]);
      return buildChain([]);
    });
    const out = await getOverviewCounters();
    expect(out).toEqual({
      studentsCount: 3,
      coursesCount: 4,
      chaptersCount: 2,
      sessionsCount: 1,
      sessionGrantsCount: 2,
      sessionBookingsCount: 1,
      revenueCents: 0,
      refundsCents: 0,
    });
  });

  it('returns zeros for the counters that errored (does not throw)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'payments') {
        return buildChain([], { message: 'timeout' });
      }
      return buildChain([{ id: 'x' }]);
    });
    const out = await getOverviewCounters();
    // The students table is queried with .eq('role', 'student'); the
    // mock chain exposes .eq() as a no-op that resolves to data.
    expect(out.sessionGrantsCount).toBe(1);
    expect(out.revenueCents).toBe(0);
    expect(out.refundsCents).toBe(0);
  });
});
