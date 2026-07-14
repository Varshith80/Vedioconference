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
