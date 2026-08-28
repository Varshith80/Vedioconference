import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import {
  encodeCursor,
  resolveCursor,
  type CursorOrBeforeQuery,
} from '@/lib/validations/cursor';

// =====================================================================
// Sprint 8 — N-3 audit_logs cursor-paginated read (admin).
//
// The `public.audit_logs` table is write-only from DB triggers
// (see migration 20260707000006 §audit_logs) and read-only from
// the admin role (RLS policy `audit_logs_select_admin`). This
// service is the canonical reader for the admin audit-log
// surface (route: GET /api/admin/audit-logs).
//
// Cursor model
// ------------
// Same `(created_at, id)` total-order cursor as the notifications
// list. Strict ordering on `(ts DESC, id DESC)` guarantees no
// row is skipped or repeated when paginating, even when many
// rows share the same microsecond (audit bursts can produce
// hundreds of identical timestamps in a single transaction).
//
// Returns an empty list + null cursor on read failure so the
// page degrades to "no logs" rather than a 500.
// =====================================================================

export const DEFAULT_AUDIT_LOG_LIMIT = 20;
export const MAX_AUDIT_LOG_LIMIT = 100;

export interface AuditLogEntry {
  id: string;
  tableName: string;
  rowId: string | null;
  action: string;
  actorId: string | null;
  changes: unknown;
  createdAt: string;
}

interface AuditLogRow {
  id: string;
  table_name: string;
  row_id: string | null;
  action: string;
  actor_id: string | null;
  changes: unknown;
  created_at: string;
}

const AUDIT_LOG_SELECT =
  'id, table_name, row_id, action, actor_id, changes, created_at';

function rowToEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    tableName: row.table_name,
    rowId: row.row_id ?? null,
    action: row.action,
    actorId: row.actor_id ?? null,
    changes: row.changes,
    createdAt: row.created_at,
  };
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_AUDIT_LOG_LIMIT;
  const i = Math.trunc(n);
  if (i < 1) return 1;
  if (i > MAX_AUDIT_LOG_LIMIT) return MAX_AUDIT_LOG_LIMIT;
  return i;
}

export interface ListAuditLogsOptions {
  limit?: number;
  cursor?: string;
  before?: string;
  /** Optional — filter by `table_name`. */
  tableName?: string;
  /** Optional — filter by `action` (exact match). */
  action?: string;
}

export interface ListAuditLogsResult {
  data: ReadonlyArray<AuditLogEntry>;
  nextCursor: string | null;
}

/**
 * List audit log entries newest first. Admin-only — the route
 * layer must enforce the admin role before calling. RLS
 * (`audit_logs_select_admin`) blocks non-admin reads at the DB.
 */
export const listAuditLogs = cache(
  async (
    opts: ListAuditLogsOptions = {},
  ): Promise<ListAuditLogsResult> => {
    try {
      const supabase = await createSupabaseServerClientUntyped();
      const limit = clampLimit(opts.limit ?? DEFAULT_AUDIT_LOG_LIMIT);
      const cursorQuery: CursorOrBeforeQuery = {
        cursor: opts.cursor,
        before: opts.before,
      };
      const resolved = resolveCursor(cursorQuery);

      let query = supabase
        .from('audit_logs')
        .select(AUDIT_LOG_SELECT)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit + 1);
      if (opts.tableName) {
        query = query.eq('table_name', opts.tableName);
      }
      if (opts.action) {
        query = query.eq('action', opts.action);
      }
      if (resolved) {
        if (opts.cursor) {
          query = query.or(
            `created_at.lt.${resolved.ts},and(created_at.eq.${resolved.ts},id.lt.${resolved.id})`,
          );
        } else if (opts.before) {
          query = query.lt('created_at', resolved.ts);
        }
      }
      const { data, error } = await query;
      if (error) {
        logger.warn('listAuditLogs failed', { error: describeError(error) });
        return { data: [], nextCursor: null };
      }
      const rows = ((data ?? []) as ReadonlyArray<AuditLogRow>).slice(0, limit);
      const entries = rows.map(rowToEntry);
      const hasMore = ((data ?? []) as ReadonlyArray<AuditLogRow>).length > limit;
      const last = rows[rows.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ ts: last.created_at, id: last.id })
          : null;
      return { data: entries, nextCursor };
    } catch (e) {
      logger.warn('listAuditLogs threw', { error: describeError(e) });
      return { data: [], nextCursor: null };
    }
  },
);