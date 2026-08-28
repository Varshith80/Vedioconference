import { z } from 'zod';

// =====================================================================
// Sprint 8 — N-3 cursor-based pagination.
//
// Pagination cursor schema + encode/decode helpers. The cursor
// is an opaque base64-encoded JSON tuple of `{ ts, id }`, where
// `ts` is the timestamp of the last row of the previous page
// and `id` is its primary-key id. The server orders rows by
// `(ts DESC, id DESC)` and uses the cursor to filter "strictly
// older than this cursor".
//
// Why the (ts, id) tuple:
//   - `ts` alone is not a unique key: two rows can share the
//     same `created_at` (or `sent_at`) microsecond. Without the
//     `id` tie-breaker, the second page could either skip a
//     row or repeat one.
//   - The `id` tie-breaker gives strict total order, which is
//     what makes the cursor safe to use across pages.
//
// The cursor is opaque to the client — they MUST NOT inspect
// or modify it. We base64-encode the JSON to keep URLs clean
// (no `+` / `/` / `=` collisions when used inside a query
// string) and to make accidental tampering visually obvious.
//
// Backwards compatibility
// -----------------------
// Sprint 7 introduced `?before=<ISO timestamp>` as a *raw*
// pagination cursor for /api/notifications. We keep accepting
// `before` for one release (Sprint 8) and add the opaque
// `?cursor=...` parameter alongside. New clients SHOULD use
// `cursor`. The server's response always returns
// `nextCursor: string | null` so the client never has to
// know whether they're using `before` or `cursor`.
// =====================================================================

/** The cursor payload — `{ ts, id }`. */
const cursorPayloadSchema = z.object({
  ts: z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
    message: 'cursor.ts must be a valid ISO 8601 timestamp.',
  }),
  id: z.string().min(1, 'cursor.id is required'),
});
export type CursorPayload = z.infer<typeof cursorPayloadSchema>;

/**
 * Encode `{ ts, id }` as an opaque base64-url-safe string. We
 * use `btoa` / `atob` over the JSON string. Callers wrap this
 * in URL queries (`?cursor=<encoded>`).
 */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  // `btoa` works on ASCII; the cursor payload only contains an
  // ISO string + a UUID, so this is safe in all environments we
  // target. We swap `+` → `-` and `/` → `_` so the value is
  // URL-safe without further escaping, then drop `=` padding
  // to keep URLs short.
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode an opaque cursor string back to `{ ts, id }`. Returns
 * `null` when the cursor is malformed (any decode / validation
 * error). The route layer maps `null` to a 400 with a clear
 * message.
 */
export function decodeCursor(raw: string): CursorPayload | null {
  try {
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/');
    // Restore padding (btoa output length must be a multiple of 4).
    const padLen = (4 - (padded.length % 4)) % 4;
    const b64 = padded + '='.repeat(padLen);
    const json = atob(b64);
    const parsed = JSON.parse(json);
    const result = cursorPayloadSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Zod schema for the `?cursor=<...>` query param. Coerces
 * non-string values (defensive — query params are usually
 * strings but a malicious client could send arrays) and
 * accepts only non-empty strings.
 */
export const cursorQuerySchema = z
  .preprocess((v) => {
    if (v === undefined || v === null || v === '') return undefined;
    return typeof v === 'string' ? v : String(v);
  }, z.string().min(1).optional());

/**
 * Combined `cursor` + back-compat `before` query schema. Both
 * are optional. When both are supplied, `cursor` wins (we
 * treat `before` as a deprecated fallback).
 */
export const cursorOrBeforeQuerySchema = z.object({
  cursor: cursorQuerySchema,
  before: cursorQuerySchema,
});
export type CursorOrBeforeQuery = z.infer<typeof cursorOrBeforeQuerySchema>;

/** Resolve a `cursor` / `before` pair to the canonical `{ ts, id }`. */
export function resolveCursor(
  query: CursorOrBeforeQuery,
  fallbackId: string = '',
): CursorPayload | null {
  if (query.cursor) {
    return decodeCursor(query.cursor);
  }
  if (query.before) {
    return { ts: query.before, id: fallbackId };
  }
  return null;
}