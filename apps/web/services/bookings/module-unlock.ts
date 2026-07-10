import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * `services/bookings/module-unlock.ts` — defensive service-side
 * check for the "module N+1 unlocks when module N is completed"
 * rule.
 *
 * Source of truth
 * ---------------
 * The Postgres trigger `trg_module_unlock` (added in Sprint C,
 * migration `20260710000001_module_unlock.sql`) is the source of
 * truth. This helper duplicates the check on the application
 * side so the route handler can return a friendlier
 * `409 module_locked` response (with a structured
 * `blocking` list) before the DB round-trip.
 *
 * The DB trigger cannot be bypassed; this helper is best-effort
 * UX. If the helper is wrong, the trigger still rejects the
 * insert with `P0001` / `module_locked`.
 */
export type ModuleUnlockReason =
  | 'not_enrolled'
  | 'enrollment_inactive'
  | 'preceding_incomplete'
  | 'is_preview'
  | 'ok';

export interface ModuleUnlockResult {
  unlocked: boolean;
  reason: ModuleUnlockReason;
  blockingModuleIds?: string[];
}

/**
 * Returns `{ unlocked: true }` when the student is allowed to
 * book the module on this enrollment. Otherwise returns
 * `{ unlocked: false, reason, blockingModuleIds? }`.
 *
 * The function is read-only — it does not write to the DB. The
 * caller's INSERT is the only mutation.
 */
export async function isModuleUnlocked(args: {
  enrollmentId: string;
  moduleId:     string;
}): Promise<ModuleUnlockResult> {
  const supabase = await createSupabaseServerClient();

  // 1. Read the enrollment.
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select('id, course_id, status')
    .eq('id', args.enrollmentId)
    .maybeSingle();
  if (enrollmentError) throw enrollmentError;
  const enrollmentRow = enrollment as unknown as { id: string; course_id: string; status: string } | null;
  if (!enrollmentRow) {
    return { unlocked: false, reason: 'not_enrolled' };
  }
  if (enrollmentRow.status !== 'active' && enrollmentRow.status !== 'pending_payment') {
    return { unlocked: false, reason: 'enrollment_inactive' };
  }

  // 2. Read the target module.
  const { data: module, error: moduleError } = await supabase
    .from('modules')
    .select('id, course_id, position, is_preview, is_published')
    .eq('id', args.moduleId)
    .maybeSingle();
  if (moduleError) throw moduleError;
  const moduleRow = module as unknown as { id: string; course_id: string; position: number; is_preview: boolean; is_published: boolean } | null;
  if (!moduleRow || !moduleRow.is_published) {
    return { unlocked: false, reason: 'not_enrolled' };
  }
  if (moduleRow.is_preview) {
    return { unlocked: true, reason: 'is_preview' };
  }

  // 3. Read the blocking list. A module is "blocking" if it is
  //    published, of the same course, at a lower position, and
  //    does not have a `module_progress.status = 'completed'`
  //    row for this enrollment.
  const { data: predecessors, error: predecessorsError } = await supabase
    .from('modules')
    .select('id')
    .eq('course_id', enrollmentRow.course_id)
    .eq('is_published', true)
    .lt('position', moduleRow.position);
  if (predecessorsError) throw predecessorsError;
  const predIds = ((predecessors ?? []) as unknown as Array<{ id: string }>).map((m) => m.id);

  if (predIds.length === 0) {
    return { unlocked: true, reason: 'ok' };
  }

  const { data: progress, error: progressError } = await supabase
    .from('module_progress')
    .select('module_id, status')
    .eq('enrollment_id', args.enrollmentId)
    .in('module_id', predIds)
    .eq('status', 'completed');
  if (progressError) throw progressError;
  const completedSet = new Set(
    ((progress ?? []) as unknown as Array<{ module_id: string; status: string }>).map((p) => p.module_id),
  );
  const blockingModuleIds = predIds.filter((id) => !completedSet.has(id));

  if (blockingModuleIds.length > 0) {
    return { unlocked: false, reason: 'preceding_incomplete', blockingModuleIds };
  }

  return { unlocked: true, reason: 'ok' };
}
