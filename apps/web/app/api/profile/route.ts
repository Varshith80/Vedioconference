import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/services/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';

const updateSchema = z.object({
  full_name:  z.string().min(2).max(120).optional(),
  phone:      z.string().max(40).optional(),
  timezone:   z.string().max(60).optional(),
  locale:     z.string().max(10).optional(),
  avatar_url: z.string().url().optional(),
});

/** GET  /api/profile  – current profile
 *  PATCH /api/profile – update mutable fields
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (error || !data) throw BadRequest('Profil introuvable.');
    return NextResponse.json({ data });
  } catch (e) { return errorResponse(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) throw Unauthorized();
    const body = updateSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('profiles').update(body as never).eq('id', user.id).select('*').single();
    if (error || !data) throw BadRequest('Mise à jour échouée.');
    return NextResponse.json({ data });
  } catch (e) { return errorResponse(e); }
}
