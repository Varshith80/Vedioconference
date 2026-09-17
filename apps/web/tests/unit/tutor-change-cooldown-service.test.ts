import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6.5 — Feature G cooldown service tests.
//
// `recordSuccessfulTutorChange` is the only writer of
// `student_tutor_change_events`. It uses the service-role admin
// client. We mock that client and assert the three contract paths:
//   - happy path → { ok: true, changedAt }
//   - SQLSTATE 23505 (unique violation on request_id) →
//     { ok: false, code: 'already_recorded' }
//   - any other error → { ok: false, code: 'unknown' }
// Plus: a defensive no-op when fromTutorId === toTutorId.
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

// Import after the mock.
import { recordSuccessfulTutorChange } from '@/services/student/tutor-change-cooldown';

const baseInput = {
  studentId: '11111111-1111-1111-1111-111111111111',
  bookingId: '22222222-2222-2222-2222-222222222222',
  fromTutorId: '33333333-3333-3333-3333-333333333333',
  toTutorId: '44444444-4444-4444-4444-444444444444',
  requestId: '55555555-5555-5555-5555-555555555555',
};

describe('recordSuccessfulTutorChange', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockSelect.mockReset();
  });

  it('returns ok=true on a successful insert', async () => {
    const changedAtIso = '2026-09-15T12:00:00.000Z';
    mockSelect.mockReturnValue({
      single: () => Promise.resolve({ data: { changed_at: changedAtIso }, error: null }),
    });
    // The chain is `insert(...).select(...).single()` so `insert`
    // must return an object with `select`.
    mockInsert.mockReturnValue({
      select: mockSelect,
    });

    const result = await recordSuccessfulTutorChange(baseInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changedAt.toISOString()).toBe(changedAtIso);
    }
    expect(mockInsert).toHaveBeenCalledOnce();
    const payload = mockInsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.student_id).toBe(baseInput.studentId);
    expect(payload.booking_id).toBe(baseInput.bookingId);
    expect(payload.from_tutor_id).toBe(baseInput.fromTutorId);
    expect(payload.to_tutor_id).toBe(baseInput.toTutorId);
    expect(payload.request_id).toBe(baseInput.requestId);
  });

  it('maps SQLSTATE 23505 (unique violation on request_id) to already_recorded', async () => {
    mockSelect.mockReturnValue({
      single: () =>
        Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_student_tutor_change_events_request_id"' },
        }),
    });
    mockInsert.mockReturnValue({ select: mockSelect });

    const result = await recordSuccessfulTutorChange(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('already_recorded');
    }
  });

  it('maps a generic insert error to unknown', async () => {
    mockSelect.mockReturnValue({
      single: () =>
        Promise.resolve({
          data: null,
          error: { code: 'P0001', message: 'unexpected' },
        }),
    });
    mockInsert.mockReturnValue({ select: mockSelect });

    const result = await recordSuccessfulTutorChange(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown');
    }
  });

  it('maps a thrown insert to unknown (no surface crash)', async () => {
    mockInsert.mockImplementation(() => {
      throw new Error('network down');
    });

    const result = await recordSuccessfulTutorChange(baseInput);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unknown');
    }
  });

  it('returns already_recorded (no DB call) when fromTutorId === toTutorId', async () => {
    const result = await recordSuccessfulTutorChange({
      ...baseInput,
      toTutorId: baseInput.fromTutorId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('already_recorded');
    }
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
