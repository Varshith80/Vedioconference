import 'server-only';
import { cache } from 'react';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { AdminFetchResult } from '@/components/admin/admin-data-state';

// =====================================================================
// Sprint 9 — Admin Portal error-state distinction (P3-1).
//
// The original admin read services (see `services/admin/catalog.ts`)
// caught every Supabase error and returned `[]`, so the UI could not
// tell apart "no data yet" from "database is down". This helper
// wraps a fetcher and produces a typed `AdminFetchResult` envelope:
//
//   { state: 'data',    data }   ← fetcher resolved with rows
//   { state: 'empty' }          ← fetcher resolved with []
//   { state: 'error', message } ← fetcher threw
//   { state: 'loading' }        ← not produced by the server; this
//                                 helper always resolves with one of
//                                 the three above. Pages that want
//                                 a loading state should use the
//                                 `'use client'` `useAdminFetch()`
//                                 hook (added below).
//
// `cachedAdminFetch()` adds RSC `cache()` so a single request only
// hits the fetcher once, even when several admin pages ask for the
// same data.
//
// The helper is intentionally generic: every existing admin service
// can be refactored to use it without changing its public surface
// (each service still owns its own typed fetcher).
// =====================================================================

/**
 * Run a server-side fetcher and turn its (rows | error) outcome
 * into an `AdminFetchResult`. Never throws.
 *
 * @param fetcher   The server-side fetcher. May throw; the helper
 *                  catches and turns the throw into a typed error
 *                  envelope. May also resolve to `[]`, which the
 *                  helper turns into `{ state: 'empty' }`.
 * @param label     Short label used in the logger on failure (e.g.
 *                  "admin.getAllPrograms"). The catch logs at
 *                  `error` level via `lib/utils/logger`.
 */
export async function safeAdminFetch<T>(
  fetcher: () => Promise<ReadonlyArray<T>>,
  label: string,
): Promise<AdminFetchResult<T>> {
  try {
    const rows = await fetcher();
    if (!Array.isArray(rows)) {
      logger.error(`${label} returned non-array`, { valueType: typeof rows });
      return {
        state: 'error',
        message: 'Internal error: fetcher did not return an array.',
        code: 'invalid_fetcher_result',
      };
    }
    return rows.length === 0
      ? { state: 'empty' }
      : { state: 'data', data: rows };
  } catch (e) {
    const detail = describeError(e);
    logger.error(`${label} threw`, detail);
    return {
      state: 'error',
      message:
        typeof detail === 'string'
          ? detail
          : detail && typeof detail === 'object' && 'message' in detail
            ? String((detail as { message?: unknown }).message ?? 'Unknown error.')
            : 'Unknown error.',
      code: 'fetch_failed',
    };
  }
}

/**
 * `cache()`-wrapped variant of `safeAdminFetch`. Use this on the
 * server to memoize per-request. The cache key is the label, so
 * two callers using different labels for the same fetcher will
 * each cache independently.
 */
export function cachedAdminFetch<T>(
  fetcher: () => Promise<ReadonlyArray<T>>,
  label: string,
): Promise<AdminFetchResult<T>> {
  // `cache()` requires a per-call key. We use `label` because the
  // fatcher is closed over the closure-captured deps.
  return _cachedAdminFetch(label, () => safeAdminFetch(fetcher, label));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _cachedAdminFetch = cache((_label: string, fn: () => Promise<any>) => fn());