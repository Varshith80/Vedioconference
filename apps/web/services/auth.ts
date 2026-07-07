import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Get the currently authenticated user (or null). Wrapped in
 * `React.cache()` so the same request reuses one Supabase roundtrip
 * across the layout, page, and any nested RSC.
 *
 * Build-time safe: when `generateStaticParams` runs at build time
 * there is no request scope, so `cookies()` throws. We swallow that
 * one error and return null so the build can complete.
 */
export const getCurrentUser = cache(async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
});
