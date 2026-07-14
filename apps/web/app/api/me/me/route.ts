import { type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { getStudentSessionGrants } from '@/services/curriculum/session-grants';

// =====================================================================
// GET /api/me/me — returns the current user profile + the
// student's active session grants (the v2 unit of payment,
// was the v1 "enrollments" surface pre-Sprint 3.5).
//
// The v1 shape `{ enrollments: [...] }` is replaced by
// `{ sessionGrants: [...] }` in Sprint 3.6. There are no
// external consumers in the live runtime (`/api/me/me` was
// only called by the v1 dashboard; the migration is
// covered by sprint 3.5 §15 and Sprint 3.6 §6).
// =====================================================================

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw Unauthorized('You must be signed in.');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, locale')
      .eq('id', user.id)
      .single();
    if (profileError || !profile) {
      return jsonResponse({
        ok: true as const,
        data: {
          user: { id: user.id, email: user.email ?? null },
          profile: null,
          sessionGrants: [],
        },
      });
    }
    const profileRow = profile as unknown as { id: string; email: string; full_name: string | null; role: string; locale: string | null };
    const sessionGrants = await getStudentSessionGrants(user.id);

    return jsonResponse({
      ok: true as const,
      data: {
        user: { id: user.id, email: user.email ?? null },
        profile: profileRow,
        sessionGrants,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
