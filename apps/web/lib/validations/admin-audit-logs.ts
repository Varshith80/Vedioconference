import { z } from 'zod';
import { cursorQuerySchema } from '@/lib/validations/cursor';

// =====================================================================
// Sprint 8 — N-3 audit-log admin query schema.
//
// GET /api/admin/audit-logs
//   ?limit=number (1..100, default 20)
//   &cursor=<opaque> (preferred)
//   &before=<ISO 8601> (DEPRECATED — one release)
//   &table_name=<string> (optional — exact match)
//   &action=<string>    (optional — exact match)
// =====================================================================

export const listAuditLogsQuerySchema = z.object({
  limit: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }, z.number().int().min(1).max(100).optional()),
  cursor: cursorQuerySchema,
  before: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return typeof v === 'string' ? v : String(v);
    }, z.string().refine((s) => !Number.isNaN(new Date(s).getTime()), {
      message: '`before` must be a valid ISO 8601 timestamp.',
    }).optional()),
  table_name: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return typeof v === 'string' ? v : String(v);
    }, z.string().min(1).max(120).optional()),
  action: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === '') return undefined;
      return typeof v === 'string' ? v : String(v);
    }, z.string().min(1).max(60).optional()),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;