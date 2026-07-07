import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Get the currently authenticated user (or null). */
export async function getCurrentUser() {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
