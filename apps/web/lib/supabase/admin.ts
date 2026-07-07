import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';

/**
 * Supabase admin client. Bypasses Row Level Security.
 *
 * ⚠️  Server-only. Never import this from a Client Component.
 *     The service role key is the most powerful credential in the
 *     project; treat it as a top-level secret.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase URL and service role key must be configured.');
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
