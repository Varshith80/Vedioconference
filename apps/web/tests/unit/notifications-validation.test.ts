import { describe, it, expect } from 'vitest';

// =====================================================================
// Sprint 7 — M5.2 Notification feed Zod contracts.
//
// Pure-schema tests, no I/O. Covers:
//   - listNotificationsQuerySchema
//       * default limit
//       * limit clamp (1..100)
//       * unread_only normalisation (true/false/1/0/yes/no)
//       * before ISO 8601 enforcement
//   - markAsReadBodySchema / markAllAsReadBodySchema accept empty
//   - notificationIdParamSchema rejects non-UUID ids
// =====================================================================

const {
  listNotificationsQuerySchema,
  markAsReadBodySchema,
  markAllAsReadBodySchema,
  notificationIdParamSchema,
} = await import('@/lib/validations/notifications');

describe('listNotificationsQuerySchema', () => {
  it('returns an empty object when nothing is provided', () => {
    const r = listNotificationsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBeUndefined();
      expect(r.data.unread_only).toBeUndefined();
      expect(r.data.before).toBeUndefined();
    }
  });

  it('parses a valid limit + unread_only=true + before', () => {
    const r = listNotificationsQuerySchema.safeParse({
      limit: '10',
      unread_only: 'true',
      before: '2026-08-27T12:00:00.000Z',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(10);
      expect(r.data.unread_only).toBe(true);
      expect(r.data.before).toBe('2026-08-27T12:00:00.000Z');
    }
  });

  it('rejects limit below 1', () => {
    const r = listNotificationsQuerySchema.safeParse({ limit: '0' });
    expect(r.success).toBe(false);
  });

  it('rejects limit above 100', () => {
    const r = listNotificationsQuerySchema.safeParse({ limit: '500' });
    expect(r.success).toBe(false);
  });

  it('rejects non-numeric limit', () => {
    const r = listNotificationsQuerySchema.safeParse({ limit: 'abc' });
    expect(r.success).toBe(false);
  });

  it('accepts numeric (non-string) limit', () => {
    const r = listNotificationsQuerySchema.safeParse({ limit: 25 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });

  it('normalises unread_only=true/false/1/0', () => {
    const cases = [
      ['true', true],
      ['false', false],
      ['1', true],
      ['0', false],
    ] as const;
    for (const [input, expected] of cases) {
      const r = listNotificationsQuerySchema.safeParse({ unread_only: input });
      expect(r.success, `unread_only=${input} should parse`).toBe(true);
      if (r.success) expect(r.data.unread_only).toBe(expected);
    }
  });

  it('rejects unread_only=junk', () => {
    const r = listNotificationsQuerySchema.safeParse({ unread_only: 'maybe' });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid before timestamp', () => {
    const r = listNotificationsQuerySchema.safeParse({ before: 'not-a-date' });
    expect(r.success).toBe(false);
  });

  it('treats empty-string before as undefined', () => {
    const r = listNotificationsQuerySchema.safeParse({ before: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.before).toBeUndefined();
  });
});

describe('markAsReadBodySchema', () => {
  it('accepts an empty object', () => {
    const r = markAsReadBodySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it('accepts an arbitrary stray payload (passthrough)', () => {
    const r = markAsReadBodySchema.safeParse({ why: 'no reason' });
    expect(r.success).toBe(true);
  });
});

describe('markAllAsReadBodySchema', () => {
  it('accepts an empty object', () => {
    const r = markAllAsReadBodySchema.safeParse({});
    expect(r.success).toBe(true);
  });
});

describe('notificationIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const r = notificationIdParamSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.id).toBe('11111111-1111-1111-1111-111111111111');
    }
  });

  it('rejects a non-UUID id', () => {
    const r = notificationIdParamSchema.safeParse({ id: 'nope' });
    expect(r.success).toBe(false);
  });
});
