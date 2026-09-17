import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6.5 — Feature G cooldown race-safety / idempotency contract.
//
// This is the contract test for the at-most-once primitive. We do
// not need to run a real Postgres: we mock the admin client's
// insert path and assert that a retried `recordSuccessfulTutorChange`
// for the same `request_id` is a no-op (the SQLSTATE 23505 branch).
//
// Real DB-level idempotency is enforced by:
//   - UNIQUE INDEX uq_student_tutor_change_events_request_id
//     (migration 20260915000001_student_tutor_change_events.sql)
//   - the BEFORE INSERT trigger
//     `trg_student_tutor_change_events_cooldown`
// Both are documented in the migration header and are verified
// locally by the migration-apply step.
// =====================================================================

const mockInsert = vi.fn();
const mockSelect = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert: mockInsert,
      select: mockSelect,
    }),
  }),
}));

import { recordSuccessfulTutorChange } from '@/services/student/tutor-change-cooldown';

const baseInput = {
  studentId: '11111111-1111-1111-1111-111111111111',
  bookingId: '22222222-2222-2222-2222-222222222222',
  fromTutorId: '33333333-3333-3333-3333-333333333333',
  toTutorId: '44444444-4444-4444-4444-444444444444',
  requestId: '55555555-5555-5555-5555-555555555555',
};

describe('Sprint 6.5 — cooldown idempotency contract', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
  });

  it('a successful insert followed by a retry resolves to exactly one persisted event', async () => {
    // First call: succeeds (returns changed_at).
    // Second call: would-be-duplicate → SQLSTATE 23505 → already_recorded.
    mockSelect
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: { changed_at: '2026-09-15T12:00:00.000Z' },
            error: null,
          }),
      })
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: null,
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "uq_student_tutor_change_events_request_id"',
            },
          }),
      });
    mockInsert.mockReturnValue({ select: mockSelect });

    const first = await recordSuccessfulTutorChange(baseInput);
    expect(first.ok).toBe(true);

    const second = await recordSuccessfulTutorChange(baseInput);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe('already_recorded');
    }

    // The insert was attempted twice (the second attempt hit the
    // UNIQUE constraint and was rejected by the DB layer).
    expect(mockInsert).toHaveBeenCalledTimes(2);
    // The same payload was sent both times (request_id is the
    // idempotency key).
    expect(mockInsert.mock.calls[0]?.[0]).toEqual(mockInsert.mock.calls[1]?.[0]);
  });

  it('parallel calls for the same request_id resolve to exactly one ok=true', async () => {
    // Simulate two parallel writers racing on the same request_id.
    // One wins (ok=true), the other hits 23505 (ok=false,
    // already_recorded). This is the application-level mirror of
    // the DB-level UNIQUE race.
    mockSelect
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: { changed_at: '2026-09-15T12:00:00.000Z' },
            error: null,
          }),
      })
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }),
      });
    mockInsert.mockReturnValue({ select: mockSelect });

    const [a, b] = await Promise.all([
      recordSuccessfulTutorChange(baseInput),
      recordSuccessfulTutorChange(baseInput),
    ]);

    const oks = [a, b].filter((r) => r.ok);
    const dups = [a, b].filter((r) => !r.ok && r.code === 'already_recorded');
    expect(oks).toHaveLength(1);
    expect(dups).toHaveLength(1);
  });

  it('the cooldown START event is keyed by request_id, not by booking_id', async () => {
    // Two different request_ids for the same booking must produce
    // two separate events. The idempotency primitive is
    // request_id, not booking_id — a student could in theory
    // change tutors twice on the same booking, but each would
    // require its own tutor_change_request row.
    mockSelect
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: { changed_at: '2026-09-15T12:00:00.000Z' },
            error: null,
          }),
      })
      .mockReturnValueOnce({
        single: () =>
          Promise.resolve({
            data: { changed_at: '2026-09-15T13:00:00.000Z' },
            error: null,
          }),
      });
    mockInsert.mockReturnValue({ select: mockSelect });

    const r1 = await recordSuccessfulTutorChange(baseInput);
    const r2 = await recordSuccessfulTutorChange({
      ...baseInput,
      requestId: '66666666-6666-6666-6666-666666666666',
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(mockInsert).toHaveBeenCalledTimes(2);

    const payload1 = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    const payload2 = mockInsert.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(payload1.request_id).toBe(baseInput.requestId);
    expect(payload2.request_id).toBe('66666666-6666-6666-6666-666666666666');
    expect(payload1.booking_id).toBe(payload2.booking_id);
  });
});
