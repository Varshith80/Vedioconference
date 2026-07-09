'use client';

import * as React from 'react';
import { useAuthContext } from './auth-context';
import type {
  AuthResult,
  AuthSession,
  SignInInput,
  SignUpInput,
  ResetPasswordInput,
  UpdatePasswordInput,
  VerifyOtpInput,
} from '@/types/auth';

/**
 * The auth hook. Components call `useAuth()` to get a stable
 * surface that exposes:
 *   - the current session and a status flag,
 *   - thin wrappers around every provider method that translate
 *     the discriminated `AuthResult` into a thrown `AuthError` on
 *     failure.
 *
 * The hook is the only public surface. The raw context is an
 * implementation detail.
 */
export interface UseAuthValue {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  session: AuthSession | null;
  isAuthenticated: boolean;

  signInWithPassword(input: SignInInput): Promise<AuthSession>;
  signUp(input: SignUpInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  resetPasswordForEmail(input: ResetPasswordInput): Promise<void>;
  updatePassword(input: UpdatePasswordInput): Promise<void>;
  verifyOtp(input: VerifyOtpInput): Promise<AuthSession>;
}

export function useAuth(): UseAuthValue {
  const ctx = useAuthContext();
  if (!ctx) {
    throw new Error(
      'useAuth() must be used inside <AuthProvider>. Wrap your tree in <AuthProvider> in the root layout.',
    );
  }
  const { provider, session, status } = ctx;

  const unwrap = React.useCallback(async <T,>(res: Promise<AuthResult<T>>): Promise<T> => {
    const r = await res;
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  }, []);

  return React.useMemo<UseAuthValue>(
    () => ({
      status,
      session,
      isAuthenticated: status === 'authenticated',
      signInWithPassword: (input) => unwrap(provider.signInWithPassword(input)),
      signUp: (input) => unwrap(provider.signUp(input)),
      signOut: () => unwrap(provider.signOut()),
      resetPasswordForEmail: (input) => unwrap(provider.resetPasswordForEmail(input)),
      updatePassword: (input) => unwrap(provider.updatePassword(input)),
      verifyOtp: (input) => unwrap(provider.verifyOtp(input)),
    }),
    [provider, status, session, unwrap],
  );
}
