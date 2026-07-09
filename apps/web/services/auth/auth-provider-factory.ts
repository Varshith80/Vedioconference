import type { AuthProvider } from '@/types/auth';
import { LocalStubAuthProvider } from './local-stub-auth-provider';

/**
 * Auth provider factory. The factory pattern keeps the rest of the
 * app decoupled from the concrete provider — the marketing pages,
 * the auth UI, and the dashboard all read `getAuthProvider()` and
 * call methods on the returned interface.
 *
 * B1 uses the local stub. B2 will detect a real `NEXT_PUBLIC_`
 * Supabase config and return a SupabaseAuthProvider.
 */
let cached: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (cached) return cached;
  cached = new LocalStubAuthProvider();
  return cached;
}

/** Test-only: replace the cached provider. Pass null to clear. */
export function __setAuthProviderForTests(provider: AuthProvider | null): void {
  cached = provider;
}
