import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// TASK 3 — Feature C — D-3 pool priority test.
//
// pickSubscriptionPoolFirst (services/curriculum/session-bookings.ts)
// MUST:
//   - return the subscription pool FIRST when it has remaining credits
//     and is active.
//   - fall back to the pack pool when no subscription pool exists
//     or the subscription pool is exhausted.
//   - return null when neither pool exists (PAYG fallback).
//
// The function PICKs the grant id; the fn_consume_pack_credit
// trigger (migration 20260825000001) does the atomic debit.
//
// RLS-respecting: it uses the cookie-authenticated server client.
// =====================================================================

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Per-call from() shape: each entry is `{ kind, ... }` where
// kind is one of 'sub', 'pack', or 'empty'. We dispatch by the
// order of calls: subscription pool lookup comes first, then
// pack pool lookup.
type Result =
  | { kind: 'sub'; data: unknown; error?: null }
  | { kind: 'pack'; data: unknown; error?: null }
  | { kind: 'empty'; data: null; error?: null }
  | { kind: 'error'; data: null; error: { code: string; message: string } };

const fromMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({ from: fromMock }),
  ),
}));

const { pickSubscriptionPoolFirst } = await import(
  '@/services/curriculum/session-bookings'
);

const STUDENT_ID = 'student_uuid';

function setupResults(results: Result[]) {
  let fromIndex = 0;
  fromMock.mockImplementation((table: string): Record<string, unknown> => {
    if (table !== 'session_grants') {
      throw new Error(`unexpected table ${table}`);
    }
    const idx = fromIndex++;
    const result = results[Math.min(idx, results.length - 1)] ?? {
      kind: 'empty',
      data: null,
    };
    const data = result.kind === 'error' ? null : (result as { data: unknown }).data;
    const error = result.kind === 'error' ? (result as { error: unknown }).error : null;
    const payload = { data, error };
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gt: () => ({
                maybeSingle: () => Promise.resolve(payload),
              }),
              maybeSingle: () => Promise.resolve(payload),
            }),
          }),
        }),
      }),
    };
  });
}

beforeEach(() => {
  fromMock.mockReset();
});

describe('pickSubscriptionPoolFirst — D-3 priority', () => {
  it('returns subscription pool FIRST when both pools have remaining credits', async () => {
    setupResults([
      {
        kind: 'sub',
        data: {
          id: 'sub_pool',
          total_credits: 4,
          consumed_credits: 1,
          status: 'active',
        },
      },
      // pack lookup must NOT be reached — function returns on sub hit.
    ]);

    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toEqual({ grantId: 'sub_pool', source: 'subscription' });
    // Only ONE from() call (subscription lookup); the pack lookup
    // is skipped because the subscription pool is active + has credits.
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to pack pool when subscription pool is exhausted', async () => {
    setupResults([
      {
        kind: 'sub',
        data: {
          id: 'sub_pool',
          total_credits: 4,
          consumed_credits: 4, // exhausted
          status: 'active',
        },
      },
      {
        kind: 'pack',
        data: {
          id: 'pack_pool',
          total_credits: 10,
          consumed_credits: 5,
          status: 'active',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      },
    ]);

    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toEqual({ grantId: 'pack_pool', source: 'pack' });
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to pack pool when no subscription pool exists', async () => {
    setupResults([
      { kind: 'empty', data: null },
      {
        kind: 'pack',
        data: {
          id: 'pack_pool',
          total_credits: 10,
          consumed_credits: 5,
          status: 'active',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      },
    ]);

    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toEqual({ grantId: 'pack_pool', source: 'pack' });
  });

  it('falls back to pack pool when subscription pool is not active (cancelled / suspended)', async () => {
    setupResults([
      {
        kind: 'sub',
        data: {
          id: 'sub_pool',
          total_credits: 4,
          consumed_credits: 1,
          status: 'cancelled', // D-1: cancelled pool is excluded
        },
      },
      {
        kind: 'pack',
        data: {
          id: 'pack_pool',
          total_credits: 10,
          consumed_credits: 0,
          status: 'active',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      },
    ]);

    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toEqual({ grantId: 'pack_pool', source: 'pack' });
  });

  it('returns null when neither pool exists (PAYG fallback)', async () => {
    setupResults([
      { kind: 'empty', data: null },
      { kind: 'empty', data: null },
    ]);
    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toBeNull();
  });

  it('returns null when pack pool is expired (expires_at in the past)', async () => {
    setupResults([
      { kind: 'empty', data: null },
      {
        kind: 'pack',
        data: {
          id: 'pack_pool',
          total_credits: 10,
          consumed_credits: 0,
          status: 'active',
          expires_at: '2020-01-01T00:00:00.000Z', // expired
        },
      },
    ]);
    const result = await pickSubscriptionPoolFirst(STUDENT_ID);
    expect(result).toBeNull();
  });
});
