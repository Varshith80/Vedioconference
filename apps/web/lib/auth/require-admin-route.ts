import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { Forbidden, Unauthorized } from '@/lib/utils/errors';
import type { Database } from '@/types/database.generated';

// Throwing twin of requireAdmin / requireSuperAdmin from
// apps/web/hooks/use-require-user.ts for use in Route Handlers
// (app/api/**/route.ts).
//
// Why a separate file:
//   - RSC pages need a redirect() on auth failure (this is a
//     navigation, not an error response).
//   - Route handlers need a throw (so the errorResponse() helper
//     in lib/utils/api.ts can shape the JSON body and the HTTP
//     status).
// Both helpers call the same is_admin() / is_super_admin() DB RPC
// (or a profile.role check) and return the same shape. The DB
// helper is the authoritative gate; this is the UX guard.
//
// Usage:
//
//   import { requireAdminRoute } from '@/lib/auth/require-admin-route';
//
//   export async function POST(req: NextRequest) {
//     try {
//       const { supabase } = await requireAdminRoute();
//       // ... do admin work ...
//     } catch (e) {
//       return errorResponse(e);
//     }
//   }
//
// Wrapped in cache() so multiple calls in the same request
// share one roundtrip.
export type AdminRouteContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUserInternal>>>;
  profile: Database['public']['Tables']['profiles']['Row'];
  supabase: Awaited<ReturnType<typeof createSupabaseServerClientUntyped>>;
};

/**
 * Internal `getUser` helper used by the throwing twins.
 * Returns `null` on build-time or any error (the callers
 * then throw `Unauthorized()`).
 */
const getCurrentUserInternal = cache(async () => {
  try {
    const supabase = await createSupabaseServerClientUntyped();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
});

/**
 * Throws `Unauthorized()` for anonymous users and
 * `Forbidden()` for non-admins. Returns
 * `{ user, profile, supabase }` for admins.
 */
export const requireAdminRoute = cache(async (): Promise<AdminRouteContext> => {
  const user = await getCurrentUserInternal();
  if (!user) throw Unauthorized('You must be signed in.');

  const supabase = await createSupabaseServerClientUntyped();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error || !profile) {
    throw Forbidden('Your account is not provisioned.');
  }
  const role = (profile as { role?: string }).role;
  if (role !== 'admin' && role !== 'super_admin') {
    throw Forbidden('Only admins can perform this action.');
  }

  return {
    user,
    profile: profile as Database['public']['Tables']['profiles']['Row'],
    supabase,
  };
});

/**
 * Throwing twin of `requireSuperAdmin`. Throws
 * `Unauthorized()` for anonymous users and `Forbidden()` for
 * any role other than `super_admin`.
 */
export const requireSuperAdminRoute = cache(async (): Promise<AdminRouteContext> => {
  const user = await getCurrentUserInternal();
  if (!user) throw Unauthorized('You must be signed in.');

  const supabase = await createSupabaseServerClientUntyped();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error || !profile) {
    throw Forbidden('Your account is not provisioned.');
  }
  const role = (profile as { role?: string }).role;
  if (role !== 'super_admin') {
    throw Forbidden('Only super admins can perform this action.');
  }

  return {
    user,
    profile: profile as Database['public']['Tables']['profiles']['Row'],
    supabase,
  };
});
