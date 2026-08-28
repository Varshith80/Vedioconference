import { describe, it, expect } from 'vitest';
const {
  encodeCursor,
  decodeCursor,
  resolveCursor,
} = await import('@/lib/validations/cursor');

// =====================================================================
// Sprint 8 — N-3 cursor encode/decode/resolve tests.
//
// Pure logic — no I/O. The cursor module is shared between the
// notifications feed and the new audit-logs surface, so a single
// test file guards the round-trip.
// =====================================================================

describe('encodeCursor / decodeCursor', () => {
  it('round-trips a valid payload', () => {
    const enc = encodeCursor({ ts: '2026-01-15T10:00:00.000Z', id: 'abc-1' });
    expect(typeof enc).toBe('string');
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    expect(enc).not.toContain('=');
    const dec = decodeCursor(enc);
    expect(dec).toEqual({ ts: '2026-01-15T10:00:00.000Z', id: 'abc-1' });
  });

  it('decodes a payload that still has padding (defensive)', () => {
    const enc = encodeCursor({ ts: '2026-02-01T00:00:00.000Z', id: 'x' });
    // Some clients append padding (e.g. when copying from a
    // URL that re-encoded the cursor). `decodeCursor` must
    // still produce a valid payload.
    expect(decodeCursor(enc)).toEqual({
      ts: '2026-02-01T00:00:00.000Z',
      id: 'x',
    });
  });

  it('returns null for malformed strings', () => {
    expect(decodeCursor('not-base64!')).toBeNull();
  });

  it('returns null when the decoded JSON is not the right shape', () => {
    // Manually craft a valid base64-url of a different object.
    const bad = btoa(JSON.stringify({ wrong: 'shape' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeCursor(bad)).toBeNull();
  });

  it('returns null when ts is not an ISO timestamp', () => {
    const bad = btoa(JSON.stringify({ ts: 'not-a-date', id: 'x' }))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe('resolveCursor', () => {
  it('prefers cursor over before', () => {
    const enc = encodeCursor({ ts: '2026-03-01T00:00:00.000Z', id: 'a' });
    const r = resolveCursor({ cursor: enc, before: '2026-01-01T00:00:00.000Z' });
    expect(r).toEqual({ ts: '2026-03-01T00:00:00.000Z', id: 'a' });
  });

  it('falls back to before when cursor is missing', () => {
    const r = resolveCursor({ before: '2026-01-01T00:00:00.000Z' });
    expect(r).toEqual({ ts: '2026-01-01T00:00:00.000Z', id: '' });
  });

  it('returns null when neither is set', () => {
    expect(resolveCursor({})).toBeNull();
  });

  it('returns null when cursor is malformed', () => {
    expect(resolveCursor({ cursor: '!!not-base64!!' })).toBeNull();
  });
});