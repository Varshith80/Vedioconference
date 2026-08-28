import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 8 — R-1 + R-2 Resources delivery surface — pure-schema
// tests for the new admin resource Zod schemas.
//
// Coverage:
//   - resourceVisibilitySchema
//       * accepts the three documented values
//       * rejects unknown strings
//   - adminResourceCreateSchema
//       * requires title / file_name / file_path
//       * accepts the visibility enum
//       * coerces size_bytes to integer
//       * rejects non-UUID course_id / tutor_id
//       * rejects oversized title / file_name
//   - adminResourceEditSchema
//       * allows every field to be omitted
//       * still validates individual fields when present
// =====================================================================

const {
  resourceVisibilitySchema,
  adminResourceCreateSchema,
  adminResourceEditSchema,
} = await import('@/lib/validations/admin-catalog');

const UUID = '11111111-1111-1111-1111-111111111111';

describe('resourceVisibilitySchema', () => {
  it.each(['public', 'enrolled', 'private'])(
    'accepts %s',
    (v) => {
      const r = resourceVisibilitySchema.safeParse(v);
      expect(r.success).toBe(true);
    },
  );

  it('rejects unknown visibility strings', () => {
    const r = resourceVisibilitySchema.safeParse('shared');
    expect(r.success).toBe(false);
  });
});

describe('adminResourceCreateSchema', () => {
  const valid = {
    title: 'Chapitre 5 — fiche',
    file_name: 'fiche.pdf',
    file_path: 'resources/fiche.pdf',
    visibility: 'enrolled',
  };

  it('accepts the minimal valid payload', () => {
    const r = adminResourceCreateSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('requires title', () => {
    const r = adminResourceCreateSchema.safeParse({ ...valid, title: '' });
    expect(r.success).toBe(false);
  });

  it('requires file_name', () => {
    const r = adminResourceCreateSchema.safeParse({ ...valid, file_name: '' });
    expect(r.success).toBe(false);
  });

  it('requires file_path', () => {
    const r = adminResourceCreateSchema.safeParse({ ...valid, file_path: '' });
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID course_id', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      course_id: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('accepts UUID course_id', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      course_id: UUID,
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-UUID tutor_id', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      tutor_id: 'not-a-uuid',
    });
    expect(r.success).toBe(false);
  });

  it('coerces size_bytes from string', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      size_bytes: '1234',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.size_bytes).toBe(1234);
  });

  it('rejects negative size_bytes', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      size_bytes: -5,
    });
    expect(r.success).toBe(false);
  });

  it('rejects oversized title', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      title: 'x'.repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid visibility', () => {
    const r = adminResourceCreateSchema.safeParse({
      ...valid,
      visibility: 'team-only',
    });
    expect(r.success).toBe(false);
  });
});

describe('adminResourceEditSchema', () => {
  it('accepts an empty object (no fields provided)', () => {
    const r = adminResourceEditSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('still validates a provided field', () => {
    const r = adminResourceEditSchema.safeParse({ title: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a partial update', () => {
    const r = adminResourceEditSchema.safeParse({
      title: 'Renamed',
      visibility: 'public',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.title).toBe('Renamed');
      expect(r.data.visibility).toBe('public');
    }
  });
});