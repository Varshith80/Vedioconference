/**
 * Auth abstraction. The shape every AuthProvider exposes.
 *
 * The Sprint B1 implementation is a local stub (LocalStubAuthProvider)
 * that persists a fake user to `localStorage` so the auth UI can be
 * built and demoed end-to-end without a live Supabase project. Sprint
 * B2 will ship a SupabaseAuthProvider that implements the same
 * interface; the marketing and dashboard code will not need to change
 * to switch over.
 *
 * The interface is intentionally narrow: every method is async, every
 * method returns a discriminated-union result, and every method can
 * fail with a typed AuthError.
 */

import type { User } from './user';
import type { AuthError } from './errors';

/** Discriminated result returned by every AuthProvider method. */
export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthError };

/** Session information as exposed by an AuthProvider. */
export interface AuthSession {
  user: User;
  /** Opaque access token, kept in memory. Not persisted to cookies. */
  accessToken: string;
  /** ISO-8601 timestamp when the access token expires. */
  expiresAt: string;
}

/** Payload accepted by `signInWithPassword`. */
export interface SignInInput {
  email: string;
  password: string;
}

/** Payload accepted by `signUp`. */
export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

/** Payload accepted by `resetPasswordForEmail`. */
export interface ResetPasswordInput {
  email: string;
  redirectTo?: string;
}

/** Payload accepted by `updatePassword`. */
export interface UpdatePasswordInput {
  /** The new password (must satisfy the provider's password policy). */
  password: string;
}

/** Payload accepted by `verifyOtp`. */
export interface VerifyOtpInput {
  email: string;
  /** One-time code delivered by e-mail. */
  token: string;
  /** 'signup' for the e-mail-verification flow, 'recovery' for the
   *  password-reset flow. */
  type: 'signup' | 'recovery' | 'email_change';
}

/**
 * Subscription handle returned by `onAuthStateChange`. The provider
 * fires the callback whenever the session changes; the consumer can
 * `unsubscribe()` to stop listening.
 */
export interface AuthSubscription {
  unsubscribe(): void;
}

/** The AuthProvider contract. Every method is async and returns a
 *  discriminated AuthResult so callers must handle failure. */
export interface AuthProvider {
  /** The provider id, e.g. 'local-stub' or 'supabase'. */
  readonly id: string;

  /** Returns the current session, or null if signed out. */
  getSession(): Promise<AuthResult<AuthSession | null>>;

  /** Signs the user in with an e-mail + password. */
  signInWithPassword(input: SignInInput): Promise<AuthResult<AuthSession>>;

  /** Creates a new account and signs the user in. */
  signUp(input: SignUpInput): Promise<AuthResult<AuthSession>>;

  /** Signs out the current user. Idempotent. */
  signOut(): Promise<AuthResult<void>>;

  /** Sends a password-reset e-mail. */
  resetPasswordForEmail(input: ResetPasswordInput): Promise<AuthResult<void>>;

  /** Updates the password of the current user. */
  updatePassword(input: UpdatePasswordInput): Promise<AuthResult<User>>;

  /** Verifies a one-time code (signup e-mail confirmation or recovery). */
  verifyOtp(input: VerifyOtpInput): Promise<AuthResult<AuthSession>>;

  /** Subscribes to session changes. Returns a handle with
   *  `unsubscribe()`. */
  onAuthStateChange(
    cb: (session: AuthSession | null) => void,
  ): AuthSubscription;
}
