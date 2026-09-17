import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 6.5 — Feature G cooldown-gate-as-first-action test.
//
// The plan requires that `assertNoCooldown` is the FIRST call after
// authentication in `services/student/tutor-change.ts:createRequest`.
// This test pins that ordering without booting a real Supabase.
//
// We mock:
//   - `@/lib/supabase/server` (the SSR client)
//   - `@/lib/supabase/admin` (the booking re-point)
//   - `@/services/student/tutor-change-cooldown` (the gate + recorder)
//
// We assert that when `createRequest` is called:
//   1. `assertNoCooldown` runs.
//   2. The booking-lookup and the INSERT only run AFTER the gate
//      passes (no leak of pre-flight I/O when the cooldown is
//      active).
// =====================================================================

// vi.hoisted runs BEFORE vi.mock factory bodies, so the mocks
// themselves can reference these handles.
const mocks = vi.hoisted(() => ({
  assertNoCooldown: vi.fn(),
  recordSuccessfulTutorChange: vi.fn(),
  createSupabaseServerClientUntyped: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/services/student/tutor-change-cooldown', () => ({
  assertNoCooldown: mocks.assertNoCooldown,
  recordSuccessfulTutorChange: mocks.recordSuccessfulTutorChange,
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: mocks.createSupabaseServerClientUntyped,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

// Import after the mocks.
import { createRequest } from '@/services/student/tutor-change';

const STUDENT_UUID = '11111111-1111-1111-1111-111111111111';
const BOOKING_UUID = '22222222-2222-2222-2222-222222222222';
const TUTOR_UUID = '33333333-3333-3333-3333-333333333333';

function setupSupabaseMocks(opts: {
  active?: boolean;
} = {}) {
  const booking = {
    id: BOOKING_UUID,
    student_id: STUDENT_UUID,
    tutor_id: TUTOR_UUID,
    status: 'scheduled',
  };
  const userClient = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: booking, error: null }),
            }),
          }),
        };
      }
      if (table === 'tutor_change_requests') {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: 'request-1',
                    student_id: STUDENT_UUID,
                    session_booking_id: BOOKING_UUID,
                    current_tutor_id: TUTOR_UUID,
                    status: 'pending',
                    requested_at: new Date().toISOString(),
                    sla_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    responded_at: null,
                    proposed_alternative_tutor_ids: [],
                    selected_tutor_id: null,
                    student_reason: null,
                    admin_notes: null,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    }),
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: STUDENT_UUID } } }),
    },
  };
  mocks.createSupabaseServerClientUntyped.mockResolvedValue(userClient);
  mocks.createSupabaseAdminClient.mockReturnValue({
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  });

  if (opts.active === false) {
    mocks.assertNoCooldown.mockResolvedValue(undefined);
  } else if (opts.active === true) {
    mocks.assertNoCooldown.mockRejectedValue({
      code: 'tutor_change_cooldown_active',
      details: {
        next_eligible_at: new Date(Date.now() + 60_000).toISOString(),
        remaining_ms: 60_000,
        last_changed_at: new Date().toISOString(),
      },
    });
  }
}

describe('services/student/tutor-change#createRequest — Sprint 6.5 cooldown gate', () => {
  beforeEach(() => {
    mocks.assertNoCooldown.mockReset();
    mocks.recordSuccessfulTutorChange.mockReset();
    mocks.createSupabaseServerClientUntyped.mockReset();
    mocks.createSupabaseAdminClient.mockReset();
  });

  it('calls assertNoCooldown BEFORE any booking lookup', async () => {
    setupSupabaseMocks({ active: false });

    const callOrder: string[] = [];
    mocks.assertNoCooldown.mockImplementation(() => {
      callOrder.push('assertNoCooldown');
      return Promise.resolve();
    });

    // Spy on the booking lookup by re-wrapping the `from` call.
    const userClient = await mocks.createSupabaseServerClientUntyped();
    const originalFrom = userClient.from as ReturnType<typeof vi.fn>;
    userClient.from = vi.fn((table: string) => {
      callOrder.push(`from(${table})`);
      return originalFrom(table);
    });

    await createRequest({
      session_booking_id: BOOKING_UUID,
    });

    // First: cooldown gate. Then: booking lookup.
    expect(callOrder[0]).toBe('assertNoCooldown');
    expect(callOrder).toContain('from(session_bookings)');
    const gateIdx = callOrder.indexOf('assertNoCooldown');
    const bookingIdx = callOrder.indexOf('from(session_bookings)');
    expect(gateIdx).toBeLessThan(bookingIdx);
  });

  it('does NOT touch the bookings table when the cooldown is active', async () => {
    setupSupabaseMocks({ active: true });

    let bookingLooked = false;
    const userClient = await mocks.createSupabaseServerClientUntyped();
    userClient.from = vi.fn((table: string) => {
      if (table === 'session_bookings') {
        bookingLooked = true;
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: null, error: null }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      };
    });

    await expect(
      createRequest({ session_booking_id: BOOKING_UUID }),
    ).rejects.toMatchObject({ code: 'tutor_change_cooldown_active' });

    expect(bookingLooked).toBe(false);
    expect(mocks.assertNoCooldown).toHaveBeenCalledOnce();
  });

  it('passes the student id (auth.uid()) to assertNoCooldown', async () => {
    setupSupabaseMocks({ active: false });

    await createRequest({ session_booking_id: BOOKING_UUID });

    expect(mocks.assertNoCooldown).toHaveBeenCalledOnce();
    const args = mocks.assertNoCooldown.mock.calls[0] as unknown as [string, unknown];
    expect(args[0]).toBe(STUDENT_UUID);
    // Second arg is the Supabase client — not strictly asserted here.
    expect(args[1]).toBeDefined();
  });
});
