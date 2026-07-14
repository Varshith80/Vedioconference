import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { defaultLocale, type Locale, isLocale } from '@/i18n';
import type { Database } from '@/types/database.generated';

/**
 * Read the active locale from the `x-next-intl-locale` request
 * header (set by next-intl's middleware on every locale-prefixed
 * request). Falls back to the default locale.
 *
 * Use this in any server helper that needs to build a locale-
 * prefixed redirect URL.
 */
async function getActiveLocale(): Promise<Locale> {
  const h = await headers();
  const candidate = h.get('x-next-intl-locale') ?? h.get('accept-language')?.split(',')[0]?.slice(0, 2);
  if (candidate && isLocale(candidate)) return candidate;
  return defaultLocale;
}

// Strongly-typed profile row (CLAUDE.md §3.9 boundary cast).
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Authoritative admin roles. The DB has a single is_admin() helper
// that returns true for both admin and super_admin; is_super_admin()
// is the stricter check.
export type AdminRole = 'admin' | 'super_admin';

// Guard requireAdmin / requireSuperAdmin return shape. The user and
// profile are both guaranteed non-null when the helper resolves
// (otherwise it redirect()s first).
export interface AdminContext {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  profile: Profile;
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

// Returns the currently authenticated user, or null if the
// request is build-time or unauthenticated. Wrapped in cache()
// so multiple RSC components in the same request share one
// Supabase roundtrip.
export const getCurrentUser = cache(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
});

// Server helper: get the current user OR redirect to the
// locale-aware /auth/login. Use in protected RSC pages.
export async function requireUser() {
  const locale = await getActiveLocale();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  return user;
}

// Server helper: get the current profile (and role) or
// redirect to the locale-aware /auth/login. Returns the
// strong Profile row type (CLAUDE.md §3.9).
export async function requireProfile(): Promise<Profile> {
  const locale = await getActiveLocale();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) redirect(`/${locale}/auth/login`);
  return profile as Profile;
}

// Server helper: require an admin or super_admin profile.
// Redirects to the locale-aware /auth/login for anonymous
// users and to a 403 page for signed-in non-admins.
//
// The DB is_admin() RPC is the authoritative gate; this
// helper is a UX guard that runs in the RSC render path.
// Server Components and Server Actions that need the supabase
// client should use the returned supabase field.
//
// Wrapped in cache() so the layout, page, and any nested
// RSC share one round-trip.
export const requireAdmin = cache(async (): Promise<AdminContext> => {
  const locale = await getActiveLocale();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) redirect(`/${locale}/auth/login`);
  const role = (profile as Profile).role;
  if (role !== 'admin' && role !== 'super_admin') {
    redirect(`/${locale}/dashboard?error=forbidden`);
  }

  return { user, profile: profile as Profile, supabase };
});

// Server helper: require a super_admin profile. Same
// semantics as requireAdmin but the role check is stricter.
export const requireSuperAdmin = cache(async (): Promise<AdminContext> => {
  const locale = await getActiveLocale();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !profile) redirect(`/${locale}/auth/login`);
  const role = (profile as Profile).role;
  if (role !== 'super_admin') {
    redirect(`/${locale}/dashboard?error=forbidden`);
  }

  return { user, profile: profile as Profile, supabase };
});
