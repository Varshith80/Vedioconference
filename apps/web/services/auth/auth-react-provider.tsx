'use client';

import * as React from 'react';
import { AuthContext, type AuthContextValue } from './auth-context';
import { getAuthProvider } from './auth-provider-factory';

/**
 * Mounts the auth provider into a React tree and tracks the
 * current session. Must be a Client Component.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const provider = getAuthProvider();
  const [status, setStatus] = React.useState<AuthContextValue['status']>('loading');
  const [session, setSession] = React.useState<AuthSession | null>(null);

  // Bootstrap: fetch the session once, then subscribe to changes.
  React.useEffect(() => {
    let cancelled = false;
    void provider.getSession().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setSession(res.data);
        setStatus(res.data ? 'authenticated' : 'unauthenticated');
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    });
    const sub = provider.onAuthStateChange((next) => {
      setSession(next);
      setStatus(next ? 'authenticated' : 'unauthenticated');
    });
    return () => {
      cancelled = true;
      sub.unsubscribe();
    };
  }, [provider]);

  const value: AuthContextValue = React.useMemo(
    () => ({ provider, session, status, setSession }),
    [provider, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
