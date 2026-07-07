'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.generated';

/**
 * Supabase client used in Client Components and the browser.
 * Reads/writes the user session from cookies and refreshes the JWT
 * transparently.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
