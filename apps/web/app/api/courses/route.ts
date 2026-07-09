import { type NextRequest } from 'next/server';
import { createSupabaseServerClientUntyped } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/utils/api';

/** GET /api/courses – public, paginated, filterable. */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const subject     = searchParams.get('subject')     ?? undefined;
    const levelGroup  = searchParams.get('level_group') ?? undefined;
    const q           = searchParams.get('q')            ?? undefined;
    const page        = Number(searchParams.get('page')     ?? '1');
    const pageSize    = Number(searchParams.get('pageSize') ?? '12');

    const supabase = await createSupabaseServerClientUntyped();
    let query = supabase.from('courses').select('*', { count: 'exact' }).eq('is_published', true);
    if (subject)    query = query.eq('subject', subject);
    if (levelGroup) query = query.eq('level_group', levelGroup);
    if (q)          query = query.ilike('title', `%${q}%`);

    const from = (page - 1) * pageSize;
    const { data, count, error } = await query.range(from, from + pageSize - 1).order('title');
    if (error) throw error;

    return Response.json({ data: data ?? [], total: count ?? 0, page, pageSize });
  } catch (e) { return errorResponse(e); }
}
