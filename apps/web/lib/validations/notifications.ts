import { z } from 'zod';
import { cursorQuerySchema } from '@/lib/validations/cursor';

// =====================================================================
// Sprint 7 (M5.2) + Sprint 8 (N-3 cursor pagination) Zod schemas.
//
// Body contracts
// --------------
// GET /api/notifications
//   ?limit=number (default 20, max 100)
//   &unread_only=boolean
//   &cursor=<opaque> (preferred — base64-url `{ts,id}` tuple)
//   &before=<ISO 8601> (DEPRECATED — kept for one release for
//    Sprint 7 callers; new clients SHOULD use `cursor`).
//
// POST /api/notifications/[id]/read
//   empty body — id is in the path.
//
// POST /api/notifications/read-all
//   empty body.
//
// Notes
// -----
// - `limit` is bounded to keep the SSR payload bounded.
// - `cursor` is the opaque cursor returned by the previous
//   page (`response.nextCursor`). When both `cursor` and
//   `before` are sent, `cursor` wins; the service normalises
//   them to the same `{ ts, id }` shape internally.
// - `unread_only` is a boolean flag — `true` filters out
//   anything with a non-null `read_at`.
// - Read endpoints take no body. The route handler still parses
//   JSON defensively (in case the client sends a stray payload) —
//   the schema accepts anything and discards it.
// =====================================================================

// ----- Query: GET /api/notifications --------------------------------
export const listNotificationsQuerySchema = z.object({
  limit: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }, z.number().int().min(1).max(100).optional()),
  unread_only: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      if (v === 'true' || v === true || v === '1' || v === 1) return true;
      if (v === 'false' || v === false || v === '0' || v === 0) return false;
      return v;
    }, z.boolean().optional()),
  cursor: cursorQuerySchema,
  before: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return typeof v === 'string' ? v : String(v);
    }, z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
      message: '`before` must be a valid ISO 8601 timestamp.',
    }).optional()),
});
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

// ----- Read endpoint bodies -----------------------------------------
// Empty / no-op bodies — declared so the route layer can call
// .parse({}) uniformly. We deliberately accept any object so a
// stray payload (extra fields) does not 422.
export const markAsReadBodySchema = z
  .object({})
  .passthrough();
export type MarkAsReadBody = z.infer<typeof markAsReadBodySchema>;

export const markAllAsReadBodySchema = z
  .object({})
  .passthrough();
export type MarkAllAsReadBody = z.infer<typeof markAllAsReadBodySchema>;

// ----- UUID path param schema ---------------------------------------
// Used by /api/notifications/[id]/read. The route reads the id
// from `params.id` and validates it before passing it to the
// service. Centralised here so the path contract is documented
// alongside the other schemas.
export const notificationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Notification id must be a valid UUID.' }),
});
export type NotificationIdParam = z.infer<typeof notificationIdParamSchema>;
