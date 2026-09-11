import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 5 Slice E — `runReminderWindow` service tests (n8n-driven).
//
// The service scans `session_bookings`, then for each candidate
// booking fires a stable `event_id` to a `dispatch` function.
// The production `dispatch` POSTs to `/api/webhooks/n8n`; tests
// inject a stub so this file is fully hermetic.
//
// These tests do NOT exercise the cron route. Auth lives in
// `reminders-cron-route.test.ts` in its own file (with its own
// module registry), so the two surfaces don't fight over
// `vi.resetModules()`.
// =====================================================================

interface Row { data: unknown; error: unknown }

// Queue of canned responses for `from(table)` calls. The service
// only ever calls `from('session_bookings')` for the scan; the
// reminder_dispatch case on the n8n webhook side does its own
// `notifications` insert, which is covered by the route tests.
//
// Supabase's builder pattern: `from(table).select(...).in(...).gte(...).lte(...)`
// is awaitable — when awaited, it returns `{ data, error }`.
// The mock simulates that by consuming the next plan entry at
// await time.
function buildAdminMock(plan: ReadonlyArray<{ table: string; result: Row }>) {
  let i = 0;
  const from = (_table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.in = () => chain;
    chain.eq = () => chain;
    chain.gte = () => chain;
    chain.lte = () => chain;
    chain.contains = () => chain;
    chain.maybeSingle = () => {
      const next = plan[i++];
      return Promise.resolve(next ? next.result : { data: null, error: null });
    };
    // Make the chain awaitable — Supabase builders return a
    // Thenable. We consume the next plan entry on await.
    chain.then = (
      onFulfilled: (v: Row) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      const next = plan[i++];
      if (!next) {
        return Promise.reject(new Error(`admin mock: no plan entry at step ${i - 1}`))
          .then(onFulfilled as never, onRejected as never);
      }
      return Promise.resolve(next.result).then(onFulfilled, onRejected);
    };
    return chain;
  };
  return { from };
}

const NOW = new Date('2026-08-25T10:00:00.000Z');
// 24h window: [NOW+23h, NOW+25h]
const T_24H = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
// 1h window: [NOW+50m, NOW+70m]
const T_1H  = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
const OUTSIDE = new Date(NOW.getTime() + 26 * 60 * 60 * 1000).toISOString();

import { runReminderWindow, reminderEventId } from '@/services/admin/reminders';

describe('runReminderWindow — 24h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches a 24h reminder for a scheduled booking in the window', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b1',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.considered).toBe(1);
    expect(res.dispatched).toBe(1);
    expect(res.duplicate).toBe(0);
    expect(res.skipped).toBe(0);
    expect(res.failed).toBe(0);
    expect(dispatch).toHaveBeenCalledOnce();
    const call = dispatch.mock.calls[0]![0] as {
      eventId: string;
      payload: Record<string, unknown>;
    };
    expect(call.eventId).toBe(reminderEventId('24h', 'b1'));
    expect(call.payload.type).toBe('reminder_dispatch');
    expect(call.payload.template).toBe('reminder_24h');
    expect(call.payload.to).toBe('a@example.com');
    expect(call.payload.locale).toBe('fr');
    expect(call.payload.session_booking_id).toBe('b1');
    expect(call.payload.window).toBe('24h');
  });

  it('skips a booking whose status is not scheduled/confirmed (cancelled)', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b2',
            status: 'cancelled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.skipped).toBe(1);
    expect(res.details[0]!.outcome).toBe('skipped_cancelled');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips a booking outside the window (query returned it but TOCTOU pushed it past)', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b3',
            status: 'scheduled',
            scheduled_start: OUTSIDE,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.details[0]!.outcome).toBe('skipped_outside_window');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips a booking whose student has no email (missing recipient)', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b4',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: null, preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.details[0]!.outcome).toBe('skipped_no_recipient');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('skips a booking with no meeting_link yet (n8n has no join URL to render)', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b_no_meet',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: [], // Supabase returns an empty array for a missing 1:1 join
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.details[0]!.outcome).toBe('skipped_no_meeting');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('records a `duplicate` outcome when the n8n webhook returns duplicate=true', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, duplicate: true });
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b5',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.duplicate).toBe(1);
    expect(res.details[0]!.outcome).toBe('duplicate');
  });

  it('returns zeros on a Supabase read failure', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      { table: 'session_bookings', result: { data: null, error: { message: 'boom' } } },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res).toEqual({
      window: '24h',
      considered: 0,
      dispatched: 0,
      duplicate: 0,
      skipped: 0,
      failed: 0,
      details: [],
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('counts a failed dispatch as `failed` (and does not crash the loop)', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('n8n webhook 500'));
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b6',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.details[0]!.outcome).toBe('failed');
  });

  it('honours an English locale on the student profile', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b7',
            status: 'confirmed',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com', preferred_locale: 'en' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('24h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(1);
    const call = dispatch.mock.calls[0]![0] as { payload: { locale: string } };
    expect(call.payload.locale).toBe('en');
  });
});

describe('runReminderWindow — 1h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches a 1h reminder for a confirmed booking in the 1h window', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true });
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b1h',
            status: 'confirmed',
            scheduled_start: T_1H,
            student: { id: 'stu1', full_name: 'Bob', email: 'b@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('1h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(1);
    expect(dispatch).toHaveBeenCalledOnce();
    const call = dispatch.mock.calls[0]![0] as {
      eventId: string;
      payload: Record<string, unknown>;
    };
    expect(call.eventId).toBe(reminderEventId('1h', 'b1h'));
    expect(call.payload.template).toBe('reminder_1h');
    expect(call.payload.window).toBe('1h');
  });

  it('skips a booking outside the 1h window', async () => {
    const dispatch = vi.fn();
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b_outside_1h',
            status: 'scheduled',
            scheduled_start: T_24H,
            student: { id: 'stu1', full_name: 'Bob', email: 'b@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('1h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.details[0]!.outcome).toBe('skipped_outside_window');
  });

  it('records `duplicate` when a 1h reminder was already dispatched', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, duplicate: true });
    const admin = buildAdminMock([
      {
        table: 'session_bookings',
        result: {
          data: [{
            id: 'b1h_dup',
            status: 'scheduled',
            scheduled_start: T_1H,
            student: { id: 'stu1', full_name: 'Bob', email: 'b@example.com', preferred_locale: 'fr' },
            session: { id: 'sess1', title: 'Algebra' },
            meeting: { join_url: 'https://zoom.us/j/1' },
          }],
          error: null,
        },
      },
    ]);
    const res = await runReminderWindow('1h', { now: NOW, admin: admin as never, dispatch });
    expect(res.dispatched).toBe(0);
    expect(res.duplicate).toBe(1);
    expect(res.details[0]!.outcome).toBe('duplicate');
  });
});
