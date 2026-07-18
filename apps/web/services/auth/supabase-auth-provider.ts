'use client';

import type { Session, SupabaseClient, AuthChangeEvent } from '@supabase/supabase-js';
import type {
  AuthProvider,
  AuthResult,
  AuthSession,
  AuthSubscription,
  ProfileRole,
  SignInInput,
  SignUpInput,
  ResetPasswordInput,
  UpdatePasswordInput,
  VerifyOtpInput,
} from '@/types/auth';
import type { User } from '@/types/user';
import { authError, type AuthErrorCode } from '@/types/errors';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * The Sprint B2 production auth provider. Implements the same
 * `AuthProvider` interface as the local stub (so the React
 * components and the route handlers are unchanged), but talks
 * to a real Supabase project.
 *
 * - Sign-in / sign-up: `supabase.auth.signInWithPassword` /
 *   `supabase.auth.signUp`.
 * - Sign-out: `supabase.auth.signOut` (clears the cookie-backed
 *   session).
 * - Password reset: `supabase.auth.resetPasswordForEmail` (the
 *   transactional e-mail is delivered by Supabase's built-in
 *   SMTP, not by Resend).
 * - Update password: `supabase.auth.updateUser`.
 * - OTP verification: `supabase.auth.verifyOtp` (used by the
 *   e-mail-confirmation and recovery flows).
 * - Auth state changes: `supabase.auth.onAuthStateChange`. The
 *   subscription is held for the lifetime of the provider
 *   instance (one provider per tab, lazy-initialised in
 *   `auth-provider-factory`).
 *
 * The Supabase client is read from `createSupabaseBrowserClient`,
 * which returns a `@supabase/ssr` client that uses cookies for
 * the JWT and the refresh token. RLS-enforced reads in the
 * server-side RSC pages (using `createSupabaseServerClient`)
 * pick up the same session because both clients share the
 * cookie store.
 *
 * Supabase error → AuthError translation. Supabase returns
 * `AuthError` objects with English-only messages; we map the
 * canonical `code` field to our `AuthErrorCode` union and
 * produce a localised French message (the production site is
 * French-first; the strings are picked up by the auth forms'
 * existing `t('auth.errorUnknown')` fallback when missing).
 */
const PASSWORD_MIN = 10;

function toPublicUser(u: { id: string; email?: string | null; created_at?: string; user_metadata?: Record<string, unknown> }): User {
  const fullName = typeof u.user_metadata?.['full_name'] === 'string'
    ? (u.user_metadata['full_name'] as string)
    : typeof u.user_metadata?.['fullName'] === 'string'
    ? (u.user_metadata['fullName'] as string)
    : '';
  return {
    id: u.id,
    email: u.email ?? '',
    fullName,
    createdAt: u.created_at ?? new Date().toISOString(),
  };
}

function buildSession(s: Session): AuthSession {
  const user = toPublicUser(s.user);
  // `expires_at` is documented as `number` on `Session` but is
  // technically `number | undefined` in some typings. Default to
  // a 1-hour window if it's missing.
  const expiresAt = typeof s.expires_at === 'number'
    ? new Date(s.expires_at * 1000).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    user,
    accessToken: s.access_token,
    expiresAt,
  };
}

function mapSupabaseError(err: { code?: string; message?: string; status?: number } | null): { code: AuthErrorCode; message: string } {
  if (!err) {
    return { code: 'unknown', message: 'Erreur inconnue.' };
  }
  const code = (err.code ?? '').toLowerCase();
  const status = typeof err.status === 'number' ? err.status : 0;
  // Map by Supabase's documented codes.
  if (code === 'invalid_credentials' || status === 401) {
    return { code: 'invalid_credentials', message: 'E-mail ou mot de passe incorrect.' };
  }
  if (code === 'email_not_confirmed') {
    return { code: 'email_not_confirmed', message: 'Veuillez confirmer votre adresse e-mail avant de vous connecter.' };
  }
  if (code === 'user_already_exists' || code === 'email_exists' || code === 'email_address_not_authorized') {
    return { code: 'email_taken', message: 'Un compte existe déjà avec cette adresse e-mail.' };
  }
  if (code === 'weak_password' || code === 'password_too_short' || code === 'same_password') {
    return { code: 'weak_password', message: 'Le mot de passe est trop faible.' };
  }
  if (code === 'rate_limited' || code === 'over_email_send_rate_limit' || status === 429) {
    return { code: 'rate_limited', message: 'Trop de tentatives. Réessayez dans quelques minutes.' };
  }
  if (code === 'otp_expired' || code === 'token_expired') {
    return { code: 'token_expired', message: 'Le lien a expiré. Demandez-en un nouveau.' };
  }
  if (code === 'invalid_grant' || code === 'invalid_token' || code === 'otp_disabled' || code === 'validation_failed') {
    return { code: 'invalid_token', message: 'Lien ou code invalide.' };
  }
  if (code === 'network_error' || code === 'fetch_error') {
    return { code: 'network_error', message: 'Erreur réseau. Vérifiez votre connexion et réessayez.' };
  }
  // Generic fallback.
  return { code: 'unknown', message: err.message ?? 'Erreur inconnue.' };
}

export class SupabaseAuthProvider implements AuthProvider {
  readonly id = 'supabase';

  // We don't type this with `SupabaseClient<Database>` because the
  // provider is built to be testable with any client; the
  // browser client produced by `createSupabaseBrowserClient()` is
  // the canonical one in production.
  private client: SupabaseClient<any, 'public', any>;
  private listeners = new Set<(session: AuthSession | null) => void>();
  private innerSub: { unsubscribe(): void } | null = null;

  constructor(client?: SupabaseClient<any, 'public', any>) {
    this.client = client ?? createSupabaseBrowserClient();
    // Subscribe once. Supabase's `onAuthStateChange` fires the
    // initial session synchronously, then every change.
    const { data } = this.client.auth.onAuthStateChange(this.handleAuthEvent);
    this.innerSub = data.subscription;
  }

  // -- AuthProvider --------------------------------------------------------

  async getSession(): Promise<AuthResult<AuthSession | null>> {
    const { data, error } = await this.client.auth.getSession();
    if (error) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    if (!data.session) return { ok: true, data: null };
    return { ok: true, data: buildSession(data.session) };
  }

  async getRole(): Promise<AuthResult<ProfileRole | null>> {
    // The auth.users row does not carry the application role;
    // `public.profiles.role` is the source of truth (CLAUDE.md
    // §3.9). We read it through the anon-keyed browser client
    // under the `profiles_select_own_or_admin` RLS policy: a
    // signed-in user may always read their own profile row, so
    // this is the same security boundary as the rest of the
    // session, no service-role key required.
    //
    // Returns `null` when the session is missing or the profile
    // row is not yet provisioned (e.g. the `handle_new_user`
    // trigger has not fired yet for a brand-new signup).
    const { data: sessionData, error: sessionErr } = await this.client.auth.getSession();
    if (sessionErr) {
      const e = mapSupabaseError(sessionErr);
      return { ok: false, error: authError(e.code, e.message, sessionErr) };
    }
    if (!sessionData.session) return { ok: true, data: null };

    const { data, error } = await this.client
      .from('profiles')
      .select('role')
      .eq('id', sessionData.session.user.id)
      .maybeSingle();

    if (error) {
      // PostgrestError carries `code`, `message`, `details`, and
      // `hint` — no `status` field (that lives on the Supabase
      // Auth error type). Forward only the fields the mapper
      // understands; the mapper falls back to 'unknown' for
      // anything Postgrest-specific.
      const e = mapSupabaseError({ code: error.code, message: error.message });
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    if (!data) return { ok: true, data: null };

    // The DB enum is the authority; coerce defensively so a
    // future enum value added on the DB side cannot crash the
    // browser by reaching this code path.
    const role = (data as { role?: string }).role;
    if (role === 'student' || role === 'admin' || role === 'super_admin') {
      return { ok: true, data: role };
    }
    return { ok: true, data: 'student' };
  }

  async signInWithPassword({ email, password }: SignInInput): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    return { ok: true, data: buildSession(data.session) };
  }

  async signUp({ email, password, fullName }: SignUpInput): Promise<AuthResult<AuthSession>> {
    if (password.length < PASSWORD_MIN) {
      return {
        ok: false,
        error: authError('weak_password', `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`),
      };
    }
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, fullName },
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/verify-email` : undefined,
      },
    });
    if (error) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    // The session may be null until the user confirms their e-mail
    // (depending on the Supabase project's "Confirm email" toggle).
    if (!data.session) {
      return {
        ok: false,
        error: authError('email_not_confirmed', 'Un e-mail de confirmation vient d\'être envoyé. Veuillez vérifier votre boîte de réception.'),
      };
    }
    return { ok: true, data: buildSession(data.session) };
  }

  async signOut(): Promise<AuthResult<void>> {
    const { error } = await this.client.auth.signOut();
    if (error) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    return { ok: true, data: undefined };
  }

  async resetPasswordForEmail({ email, redirectTo }: ResetPasswordInput): Promise<AuthResult<void>> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo ?? (typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined),
    });
    if (error) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    return { ok: true, data: undefined };
  }

  async updatePassword({ password }: UpdatePasswordInput): Promise<AuthResult<User>> {
    if (password.length < PASSWORD_MIN) {
      return {
        ok: false,
        error: authError('weak_password', `Le mot de passe doit contenir au moins ${PASSWORD_MIN} caractères.`),
      };
    }
    const { data, error } = await this.client.auth.updateUser({ password });
    if (error || !data.user) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    return { ok: true, data: toPublicUser(data.user) };
  }

  async verifyOtp({ email, token, type }: VerifyOtpInput): Promise<AuthResult<AuthSession>> {
    const { data, error } = await this.client.auth.verifyOtp({
      email,
      token,
      type: type === 'email_change' ? 'email_change' : type,
    });
    if (error || !data.session) {
      const e = mapSupabaseError(error);
      return { ok: false, error: authError(e.code, e.message, error) };
    }
    return { ok: true, data: buildSession(data.session) };
  }

  onAuthStateChange(cb: (session: AuthSession | null) => void): AuthSubscription {
    this.listeners.add(cb);
    return {
      unsubscribe: () => {
        this.listeners.delete(cb);
      },
    };
  }

  // -- Internal ------------------------------------------------------------

  private handleAuthEvent = (_event: AuthChangeEvent, session: Session | null) => {
    const next = session ? buildSession(session) : null;
    for (const cb of this.listeners) {
      try {
        cb(next);
      } catch {
        // never let a bad listener break the auth flow
      }
    }
  };
}
