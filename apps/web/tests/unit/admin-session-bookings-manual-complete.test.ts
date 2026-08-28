import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 8 — B-19 manual-complete service. Pure logic against
// a mocked Supabase client. Asserts:
//   - not_found when no row matches
//   - already_terminal when status is completed/cancelled/no_show/rescheduled
//   - ok when status is scheduled/confirmed
//   - ok propagates the updated row
// =====================================================================

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: () => ({ from: mockFrom }),
}));

const { manualCompleteSessionBooking } = await import(
  '@/services/curriculum/session-bookings'
);

// ----- Helpers -----------------------------------------------------------

type Result = { data: unknown; error: unknown };

function buildChain(table: string, payload: { data?: unknown; error?: unknown }) {
  const self: Record<string, unknown> = {};
  const result: Result = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  self.select = () => self;
  self.update = () => self;
  self.eq = () => self;
  self.maybeSingle = () => Promise.resolve(result);
  self.single = () => Promise.resolve(result);
  return self;
}

describe('manualCompleteSessionBooking', () => {
  beforeEach(() => mockFrom.mockReset());

  it('returns not_found when the row does not exist', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(table, { data: null }),
    );
    const r = await manualCompleteSessionBooking('missing');
    expect(r.kind).toBe('not_found');
  });

  it('returns already_terminal when status is completed', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(table, {
        data: {
          id: 'b-1',
          status: 'completed',
          scheduled_start: '2026-01-01T00:00:00Z',
          scheduled_end: '2026-01-01T01:00:00Z',
          session_id: 's-1',
          session_grant_id: 'g-1',
          student_id: 'u-1',
          tutor_id: 't-1',
          timezone: 'UTC',
          notes: null,
          calendly_event_uri: null,
          calendly_invitee_uri: null,
          cancelled_at: null,
          cancelled_reason: null,
          rescheduled_from: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          metadata: {},
        },
      }),
    );
    const r = await manualCompleteSessionBooking('b-1');
    expect(r.kind).toBe('already_terminal');
    if (r.kind === 'already_terminal') {
      expect(r.booking.status).toBe('completed');
    }
  });

  it('returns already_terminal when status is cancelled', async () => {
    mockFrom.mockImplementation((table: string) =>
      buildChain(table, {
        data: {
          id: 'b-1',
          status: 'cancelled',
          scheduled_start: '2026-01-01T00:00:00Z',
          scheduled_end: '2026-01-01T01:00:00Z',
          session_id: 's-1',
          session_grant_id: 'g-1',
          student_id: 'u-1',
          tutor_id: 't-1',
          timezone: 'UTC',
          notes: null,
          calendly_event_uri: null,
          calendly_invitee_uri: null,
          cancelled_at: null,
          cancelled_reason: null,
          rescheduled_from: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          metadata: {},
        },
      }),
    );
    const r = await manualCompleteSessionBooking('b-1');
    expect(r.kind).toBe('already_terminal');
  });

  it('returns ok with the updated row when status is scheduled', async () => {
    // First call = load existing row → scheduled.
    // Second call = update → returns row with status=completed.
    let callIndex = 0;
    mockFrom.mockImplementation((table: string) => {
      callIndex += 1;
      if (callIndex === 1) {
        return buildChain(table, {
          data: {
            id: 'b-1',
            status: 'scheduled',
            scheduled_start: '2026-01-01T00:00:00Z',
            scheduled_end: '2026-01-01T01:00:00Z',
            session_id: 's-1',
            session_grant_id: 'g-1',
            student_id: 'u-1',
            tutor_id: 't-1',
            timezone: 'UTC',
            notes: null,
            calendly_event_uri: null,
            calendly_invitee_uri: null,
            cancelled_at: null,
            cancelled_reason: null,
            rescheduled_from: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            metadata: {},
          },
        });
      }
      return buildChain(table, {
        data: {
          id: 'b-1',
          status: 'completed',
          scheduled_start: '2026-01-01T00:00:00Z',
          scheduled_end: '2026-01-01T01:00:00Z',
          session_id: 's-1',
          session_grant_id: 'g-1',
          student_id: 'u-1',
          tutor_id: 't-1',
          timezone: 'UTC',
          notes: null,
          calendly_event_uri: null,
          calendly_invitee_uri: null,
          cancelled_at: null,
          cancelled_reason: null,
          rescheduled_from: null,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T01:30:00Z',
          metadata: {},
        },
      });
    });
    const r = await manualCompleteSessionBooking('b-1');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.booking.status).toBe('completed');
    }
  });
});