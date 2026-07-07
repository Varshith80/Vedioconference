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
