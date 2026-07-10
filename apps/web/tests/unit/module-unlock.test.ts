import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isModuleUnlocked } from '@/services/bookings/module-unlock';

/**
 * The service helper is a defensive double-check that runs
 * before the DB `fn_module_unlock_check` trigger. The trigger
 * is the source of truth; this test only asserts the *shape*
 * the helper returns.
 */

interface FakeQueryResult {
  data: unknown;
  error: null | { message: string };
}

/** Build a queue-backed Supabase-like query stub. Every call
 *  to `from()` returns a chain that yields the next entry from
 *  a single shared queue. This matches the implementation's
 *  pattern of 4 sequential `from()` calls. */
function tableQueue(responses: FakeQueryResult[]) {
  let i = 0;
  return () => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'maybeSingle', 'in', 'lt', 'ne', 'single'];
    for (const m of methods) (chain as Record<string, unknown>)[m] = vi.fn(() => chain);
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve: (r: FakeQueryResult) => void) => {
          resolve(responses[i++] ?? { data: null, error: null });
        };
      },
    });
    return chain;
  };
}

describe('isModuleUnlocked', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns not_enrolled when the enrollment row is missing', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([{ data: null, error: null }]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm1' });
    expect(out.unlocked).toBe(false);
    expect(out.reason).toBe('not_enrolled');
  });

  it('returns enrollment_inactive when the enrollment is cancelled', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([
        { data: { id: 'e1', course_id: 'c1', status: 'cancelled' }, error: null },
      ]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm1' });
    expect(out.unlocked).toBe(false);
    expect(out.reason).toBe('enrollment_inactive');
  });

  it('returns is_preview when the module is a preview', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([
        { data: { id: 'e1', course_id: 'c1', status: 'active' }, error: null },
        { data: { id: 'm1', course_id: 'c1', position: 2, is_preview: true, is_published: true }, error: null },
      ]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm1' });
    expect(out.unlocked).toBe(true);
    expect(out.reason).toBe('is_preview');
  });

  it('returns ok when there are no published predecessors', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([
        { data: { id: 'e1', course_id: 'c1', status: 'active' }, error: null },
        { data: { id: 'm1', course_id: 'c1', position: 1, is_preview: false, is_published: true }, error: null },
        { data: [], error: null }, // no predecessors
      ]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm1' });
    expect(out.unlocked).toBe(true);
    expect(out.reason).toBe('ok');
  });

  it('returns preceding_incomplete with a blocking list when a predecessor is missing', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([
        { data: { id: 'e1', course_id: 'c1', status: 'active' }, error: null },
        { data: { id: 'm2', course_id: 'c1', position: 2, is_preview: false, is_published: true }, error: null },
        { data: [{ id: 'm1' }], error: null }, // predecessors = [m1]
        { data: [], error: null },             // 0 completed
      ]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm2' });
    expect(out.unlocked).toBe(false);
    expect(out.reason).toBe('preceding_incomplete');
    expect(out.blockingModuleIds).toEqual(['m1']);
  });

  it('returns ok when every predecessor is completed', async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      from: tableQueue([
        { data: { id: 'e1', course_id: 'c1', status: 'active' }, error: null },
        { data: { id: 'm2', course_id: 'c1', position: 2, is_preview: false, is_published: true }, error: null },
        { data: [{ id: 'm1' }], error: null },
        { data: [{ module_id: 'm1', status: 'completed' }], error: null },
      ]),
    });
    const out = await isModuleUnlocked({ enrollmentId: 'e1', moduleId: 'm2' });
    expect(out.unlocked).toBe(true);
    expect(out.reason).toBe('ok');
  });
});
