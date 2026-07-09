'use client';

import * as React from 'react';
import type { AuthProvider, AuthSession } from '@/types/auth';
import { getAuthProvider } from './auth-provider-factory';

/**
 * React context for the auth provider. We expose:
 *   - `provider`: the concrete AuthProvider (for actions).
 *   - `session`:  the current session, or null.
 *   - `status`:   one of 'loading' | 'authenticated' | 'unauthenticated'.
 *   - `setSession`: an internal-only escape hatch used by the B1
 *     stub when it needs to push a new session synchronously.
 *
 * The provider is wrapped in `<AuthProvider>` (see
 * `components/providers/auth-provider.tsx`).
 */
export interface AuthContextValue {
  provider: AuthProvider;
  session: AuthSession | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  /** Internal: lets the B1 stub push a new session synchronously
   *  from inside its event emitter. B2 will not need this. */
  setSession(session: AuthSession | null): void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue | null {
  return React.useContext(AuthContext);
}

export { AuthContext };
