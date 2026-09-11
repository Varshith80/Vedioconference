/**
 * Standardized API error helpers.
 * Throw `ApiError` from server code; the global handler converts it
 * into a typed JSON response.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest   = (msg: string, details?: unknown) => new ApiError(400, 'bad_request',   msg, details);
export const Unauthorized = (msg = 'Non autorisé.')             => new ApiError(401, 'unauthorized',  msg);
export const Forbidden    = (msg = 'Accès refusé.')             => new ApiError(403, 'forbidden',     msg);
export const NotFound     = (msg = 'Ressource introuvable.')    => new ApiError(404, 'not_found',     msg);
export const Conflict     = (msg: string, details?: unknown)   => new ApiError(409, 'conflict',      msg, details);
export const ServerError  = (msg = 'Erreur serveur.')           => new ApiError(500, 'server_error',  msg);

/**
 * Normalise any thrown value into a flat object suitable for
 * `logger.error('…', describeError(e))`. Supabase's PostgrestError
 * is a plain object (not an `Error` instance) with `message`,
 * `details`, `hint`, and `code` fields — `String(e)` on that
 * yields `[object Object]`, which is what the structured log is
 * here to avoid.
 */
export function describeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    const out: Record<string, unknown> = { name: e.name, message: e.message };
    const anyE = e as Error & { code?: unknown; cause?: unknown };
    if (anyE.code !== undefined) out.code = anyE.code;
    if (anyE.cause !== undefined) out.cause = String(anyE.cause);
    return out;
  }
  if (typeof e === 'object' && e !== null) {
    return { ...(e as Record<string, unknown>) };
  }
  return { value: String(e) };
}

// =====================================================================
// Postgres SQLSTATE classification for Supabase/PostgREST errors.
//
// Supabase surfaces database errors as plain objects with a `code`
// field that is either a Postgres SQLSTATE (5-char string like
// "42501", "23505") or a PostgREST error code (PGRSTxxx). We
// classify them here so service code can convert them into typed
// API errors instead of bubbling a generic 500.
//
// The mapping is intentionally narrow: only the codes that have
// a clear, well-defined HTTP equivalent. Anything else falls
// through to the default 500 catch-all in errorResponse().
// =====================================================================

/** Coerce an unknown error into a normalised shape with `code` and `message`. */
export interface NormalisedError {
  code: string | null;
  message: string;
  raw: unknown;
}

export function normaliseError(e: unknown): NormalisedError {
  if (e && typeof e === 'object') {
    const obj = e as { code?: unknown; message?: unknown };
    return {
      code: typeof obj.code === 'string' ? obj.code : null,
      message: typeof obj.message === 'string' ? obj.message : String(e),
      raw: e,
    };
  }
  return { code: null, message: String(e), raw: e };
}

/**
 * Returns true when the error is a Postgres row-level security
 * violation. Supabase / PostgREST surfaces this as
 * `{ code: "42501", message: "new row violates row-level
 * security policy for table \"<name>\"" }`.
 *
 * We intentionally do NOT translate RLS failures to 401 (the
 * user IS authenticated — they're just not allowed to perform
 * this specific write). 403 is the correct HTTP semantic for
 * "authenticated, but the action is forbidden by policy".
 */
export function isRowLevelSecurityError(e: unknown): boolean {
  const { code, message } = normaliseError(e);
  if (code === '42501') return true;
  // PostgREST sometimes wraps the SQLSTATE in the message text
  // (e.g. when the underlying PostgREST call returns 403 with
  // a JSON body that doesn't include the SQLSTATE). Fall back
  // to a textual check for the canonical RLS phrase.
  if (typeof message === 'string' && /row-level security/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * Translate a Postgres RLS error into a structured 403 ApiError
 * with the policy's target table in the details block. Returns
 * `null` for non-RLS errors so the caller can chain to the
 * default handler.
 */
export function rlsErrorToForbidden(e: unknown, action: string): ApiError | null {
  if (!isRowLevelSecurityError(e)) return null;
  const { message, raw } = normaliseError(e);
  // Try to extract the table name from the canonical Postgres
  // message: `new row violates row-level security policy for
  // table "<name>"`. Best-effort; falls back to "unknown".
  const tableMatch = message.match(/table "([^"]+)"/);
  const table = tableMatch?.[1] ?? 'unknown';
  return new ApiError(
    403,
    'rls_policy_violation',
    `Row-level security policy rejected the ${action} on table "${table}".`,
    { table, reason: message, raw: describeError(raw) },
  );
}

/**
 * Returns true when the error is a Postgres not-null violation
 * (SQLSTATE 23502). Supabase / PostgREST surfaces this as
 * `{ code: "23502", message: "null value in column \"<name>\" of
 * relation \"<table>\" violates not-null constraint" }`.
 *
 * We translate this to a 400 (the request was syntactically
 * valid JSON but the payload is missing a required column)
 * rather than a 500, so the admin UI can show "Column X is
 * required" instead of an opaque server error.
 */
export function isNotNullViolationError(e: unknown): boolean {
  const { code, message } = normaliseError(e);
  if (code === '23502') return true;
  // PostgREST sometimes wraps the SQLSTATE in the message text.
  // Fall back to the canonical not-null-constraint phrase.
  if (typeof message === 'string' && /not-null constraint/i.test(message)) {
    return true;
  }
  return false;
}

/**
 * Translate a Postgres not-null violation into a structured
 * 400 ApiError. The `details.column` block names the missing
 * column and the `details.table` block names the relation,
 * so the admin UI / API consumer can surface a precise
 * "Column X is required" message. Returns `null` for
 * non-23502 errors.
 */
export function notNullViolationToBadRequest(e: unknown): ApiError | null {
  if (!isNotNullViolationError(e)) return null;
  const { message, raw } = normaliseError(e);
  // Best-effort extraction from the canonical Postgres message:
  //   `null value in column "<col>" of relation "<table>" violates not-null constraint`
  const colMatch = message.match(/column "([^"]+)"/);
  const tableMatch = message.match(/relation "([^"]+)"/);
  const column = colMatch?.[1] ?? 'unknown';
  const table = tableMatch?.[1] ?? 'unknown';
  return new ApiError(
    400,
    'not_null_violation',
    `Missing required field: column "${column}" of "${table}" cannot be null.`,
    { table, column, reason: message, raw: describeError(raw) },
  );
}
