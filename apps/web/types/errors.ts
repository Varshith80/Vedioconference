/**
 * Typed auth errors. The provider wraps any unexpected exception
 * into one of these so the auth UI can render a clean message
 * without leaking stack traces.
 */

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'email_not_confirmed'
  | 'weak_password'
  | 'rate_limited'
  | 'network_error'
  | 'not_authenticated'
  | 'invalid_token'
  | 'token_expired'
  | 'unknown';

export interface AuthError {
  code: AuthErrorCode;
  /** Human-readable, already-translated message suitable for display. */
  message: string;
  /** Optional cause for logs (never sent to the client UI). */
  cause?: unknown;
}

/** Helper to construct an AuthError. */
export function authError(
  code: AuthErrorCode,
  message: string,
  cause?: unknown,
): AuthError {
  return { code, message, cause };
}
