import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest, Unauthorized } from '@/lib/utils/errors';
import { loginSchema } from '@/lib/validations/auth';

export async function POST(req: NextRequest) {
  try {
    const body = loginSchema.parse(await req.json());
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(body);
    if (error) throw Unauthorized(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}

const signOutSchema = z.object({ scope: z.enum(['local', 'global']).default('global') });

export async function DELETE(req: NextRequest) {
  try {
    const { scope } = signOutSchema.parse(await req.json().catch(() => ({})));
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut({ scope });
    if (error) throw BadRequest(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
