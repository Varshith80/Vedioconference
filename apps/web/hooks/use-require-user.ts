import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { defaultLocale, type Locale, isLocale } from '@/i18n';

/**
 * Reads the active locale from the `x-next-intl-locale` request
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

/**
 * Server helper: get the current user OR redirect to the
 * locale-aware /auth/login. Use in protected pages.
 */
export async function requireUser() {
  const locale = await getActiveLocale();
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);
  return user;
}

/**
 * Server helper: get the current profile (and role) or redirect to
 * the locale-aware /auth/login.
 */
export async function requireProfile() {
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
  return profile;
}
