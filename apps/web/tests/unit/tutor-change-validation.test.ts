import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 6 — Zod validation tests for the tutor-change-request
// slice. Pure-schema tests, no I/O.
//
// Coverage:
//   - createTutorChangeRequestSchema
//       * rejects missing/invalid UUID
//       * rejects oversized student_reason
//       * accepts empty/missing reason
//   - adminProposeAlternativesSchema
//       * rejects < 1 or > 3 ids
//       * accepts 1, 2, 3 ids
//       * rejects non-UUID members
//   - studentSelectAlternativeSchema
//       * rejects invalid UUID
//       * accepts valid UUID
//   - adminResolveRequestSchema
//       * accepts admin_notes only
//       * accepts selected_tutor_id only
//       * accepts both
//       * rejects oversized admin_notes
// =====================================================================

const {
  createTutorChangeRequestSchema,
  adminProposeAlternativesSchema,
  studentSelectAlternativeSchema,
  adminResolveRequestSchema,
} = await import('@/lib/validations/tutor-change');

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';
const UUID_D = '44444444-4444-4444-4444-444444444444';

describe('createTutorChangeRequestSchema', () => {
  it('rejects missing session_booking_id', () => {
    const r = createTutorChangeRequestSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID session_booking_id', () => {
    const r = createTutorChangeRequestSchema.safeParse({
      session_booking_id: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid UUID with no reason', () => {
    const r = createTutorChangeRequestSchema.safeParse({
      session_booking_id: UUID_A,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.session_booking_id).toBe(UUID_A);
      expect(r.data.student_reason).toBeUndefined();
    }
  });

  it('accepts a valid UUID with a reason', () => {
    const r = createTutorChangeRequestSchema.safeParse({
      session_booking_id: UUID_A,
      student_reason: 'I would like a tutor more focused on this topic.',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an oversized student_reason', () => {
    const r = createTutorChangeRequestSchema.safeParse({
      session_booking_id: UUID_A,
      student_reason: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });
});

describe('adminProposeAlternativesSchema', () => {
  it('rejects an empty list', () => {
    const r = adminProposeAlternativesSchema.safeParse({
      alternative_tutor_ids: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects more than 3 alternatives', () => {
    const r = adminProposeAlternativesSchema.safeParse({
      alternative_tutor_ids: [UUID_A, UUID_B, UUID_C, UUID_D],
    });
    expect(r.success).toBe(false);
  });

  it('accepts exactly 1 alternative', () => {
    const r = adminProposeAlternativesSchema.safeParse({
      alternative_tutor_ids: [UUID_A],
    });
    expect(r.success).toBe(true);
  });

  it('accepts exactly 3 alternatives', () => {
    const r = adminProposeAlternativesSchema.safeParse({
      alternative_tutor_ids: [UUID_A, UUID_B, UUID_C],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a non-UUID member', () => {
    const r = adminProposeAlternativesSchema.safeParse({
      alternative_tutor_ids: [UUID_A, 'oops'],
    });
    expect(r.success).toBe(false);
  });
});

describe('studentSelectAlternativeSchema', () => {
  it('rejects invalid UUID', () => {
    const r = studentSelectAlternativeSchema.safeParse({
      selected_tutor_id: 'nope',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a valid UUID', () => {
    const r = studentSelectAlternativeSchema.safeParse({
      selected_tutor_id: UUID_A,
    });
    expect(r.success).toBe(true);
  });
});

describe('adminResolveRequestSchema', () => {
  it('accepts admin_notes only', () => {
    const r = adminResolveRequestSchema.safeParse({
      admin_notes: 'Cancelled by ops.',
    });
    expect(r.success).toBe(true);
  });

  it('accepts selected_tutor_id only', () => {
    const r = adminResolveRequestSchema.safeParse({
      selected_tutor_id: UUID_A,
    });
    expect(r.success).toBe(true);
  });

  it('accepts both fields', () => {
    const r = adminResolveRequestSchema.safeParse({
      admin_notes: 'Re-pointed',
      selected_tutor_id: UUID_A,
    });
    expect(r.success).toBe(true);
  });

  it('rejects oversized admin_notes', () => {
    const r = adminResolveRequestSchema.safeParse({
      admin_notes: 'x'.repeat(2001),
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid selected_tutor_id', () => {
    const r = adminResolveRequestSchema.safeParse({
      selected_tutor_id: 'oops',
    });
    expect(r.success).toBe(false);
  });
});
