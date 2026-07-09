import type { AuthProvider } from '@/types/auth';
import { LocalStubAuthProvider } from './local-stub-auth-provider';
import { SupabaseAuthProvider } from './supabase-auth-provider';
import { publicEnv } from '@/lib/env';

/**
 * Auth provider factory. The factory pattern keeps the rest of the
 * app decoupled from the concrete provider — the marketing pages,
 * the auth UI, and the dashboard all read `getAuthProvider()` and
 * call methods on the returned interface.
 *
 * Detection rule (Sprint B2):
 *   - If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *     are both present (validated by `publicEnv()`), use the
 *     `SupabaseAuthProvider`. This is the production path.
 *   - Otherwise (e.g. inside a test that has not loaded the
 *     `NEXT_PUBLIC_*` env, or a local build that has not yet been
 *     configured), fall back to the `LocalStubAuthProvider`. The
 *     stub keeps the auth UI demoable without a real backend.
 *
 * The factory caches the provider so a single instance is reused
 * across the React tree (the Supabase provider holds a long-lived
 * `onAuthStateChange` subscription; we want exactly one of those
 * per browser tab).
 */
let cached: AuthProvider | null = null;

export function getAuthProvider(): AuthProvider {
  if (cached) return cached;
  if (isSupabaseConfigured()) {
    cached = new SupabaseAuthProvider();
  } else {
    cached = new LocalStubAuthProvider();
  }
  return cached;
}

function isSupabaseConfigured(): boolean {
  // `publicEnv()` throws if the env is missing. We catch the
  // throw and treat it as "not configured". This keeps the
  // factory callable from contexts (e.g. unit tests) where the
  // public env is intentionally absent.
  try {
    const env = publicEnv();
    return Boolean(env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  } catch {
    return false;
  }
}

/** Test-only: replace the cached provider. Pass null to clear. */
export function __setAuthProviderForTests(provider: AuthProvider | null): void {
  cached = provider;
}
