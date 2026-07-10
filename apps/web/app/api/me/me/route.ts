import { type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { jsonResponse, errorResponse } from '@/lib/utils/api';
import { Unauthorized } from '@/lib/utils/errors';
import { getStudentEnrollments } from '@/services/enrollments';

/**
 * GET /api/me/me — returns the current user profile + the
 * student's enrollments (with course + progress eagerly joined).
 *
 * Used by the checkout page and the dashboard's "my courses"
 * list. RLS scopes the reads — the user can only see their own
 * data.
 */
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
          enrollments: [],
        },
      });
    }
    const profileRow = profile as unknown as { id: string; email: string; full_name: string | null; role: string; locale: string | null };
    const enrollments = await getStudentEnrollments(user.id);

    return jsonResponse({
      ok: true as const,
      data: {
        user: { id: user.id, email: user.email ?? null },
        profile: profileRow,
        enrollments,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
