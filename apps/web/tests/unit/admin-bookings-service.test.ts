import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the Sprint 3.7 admin Bookings service. The
// service fetches the booking + its direct joins in **one**
// Supabase query and the corresponding payments in a **second**
// query (scoped by `session_grant_id IN (...)`), then merges
// them in TypeScript. The two-query split is required because
// `session_bookings` and `payments` have no direct FK between
// them — only two independent `session_grant_id` FKs that
// share a column value, which PostgREST's embed syntax cannot
// express. See services/admin/bookings.ts for the full
// rationale.
//
// We mock the untyped server client. The mock has to support
// two `.from(...)` shapes: bookings (`.select().order()`) and
// payments (`.select().in().order().order()`). The chain
// resolves to whatever was last called.

// ----- Mocks ------------------------------------------------------------

const mockFrom = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientUntyped: vi.fn(() =>
    Promise.resolve({
      from: mockFrom,
    }),
  ),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { getAllBookingsWithDetails, getBookingByIdWithDetails } from '@/services/admin/bookings';

// ----- Helpers -----------------------------------------------------------

// `from(TABLE)` returns a thenable chainable object. The
// surface is built per-call so we can wire the **booking**
// chain and the **payments** chain differently.
//
// Booking chain (table = 'session_bookings'):
//   .select(BOOKINGS_SELECT).order(...)
//   .select(BOOKINGS_SELECT).eq(...).maybeSingle()
//
// Payments chain (table = 'payments'):
//   .select(PAYMENTS_SELECT).in(...).order('created_at').order('id')
type BookingsResult = { data: unknown; error: unknown };
function buildBookingsChain(payload: { data?: unknown; error?: unknown }) {
  let lastResult: BookingsResult = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  const chain = {
    select: () => chain,
    order: () => {
      lastResult = { data: payload.data ?? null, error: payload.error ?? null };
      return chain;
    },
    eq: () => chain,
    maybeSingle: () => Promise.resolve(lastResult),
    then: (resolve: (v: BookingsResult) => void) => resolve(lastResult),
  };
  return chain;
}
function buildPaymentsChain(payload: { data?: unknown; error?: unknown }) {
  let lastResult: BookingsResult = {
    data: payload.data ?? null,
    error: payload.error ?? null,
  };
  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    then: (resolve: (v: BookingsResult) => void) => resolve(lastResult),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

// ----- Tests ------------------------------------------------------------

describe('getAllBookingsWithDetails', () => {
  it('returns [] when the table is empty', async () => {
    // No bookings, no payments call.
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [] });
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getAllBookingsWithDetails();
    expect(out).toEqual([]);
  });

  it('projects a single full booking with all joins flattened', async () => {
    const booking = {
      id: 'b1',
      status: 'confirmed',
      scheduled_start: '2026-07-20T10:00:00Z',
      scheduled_end:   '2026-07-20T11:00:00Z',
      timezone: 'Europe/Paris',
      notes: 'Bring calculator',
      calendly_event_uri: 'https://calendly.com/event/abc',
      calendly_invitee_uri: 'https://calendly.com/invitee/xyz',
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-07-15T08:00:00Z',
      updated_at: '2026-07-15T08:00:00Z',
      student: { id: 'stu1', full_name: 'Alice Liddell', email: 'alice@example.com' },
      // Sprint 3.8 — Tutors are standalone reference records.
      // No `profile` sub-join; the name/email live on the
      // tutors row directly.
      tutor: {
        id: 'tut1',
        full_name: 'Bob Tutor',
        email: 'bob@example.com',
        phone: null,
        status: 'active',
      },
      session: {
        id: 'sess1',
        title: 'Algebra basics',
        chapter: {
          id: 'ch1',
          title: 'Linear equations',
          course: {
            id: 'c1',
            title: 'Mathematics',
            program: { id: 'p1', title: 'High School' },
            grade:   { id: 'g1', title: 'Grade 11' },
          },
        },
      },
      grant: { id: 'g1' },
      meeting: {
        id: 'm1',
        provider: 'zoom',
        meeting_id: '123456789',
        join_url: 'https://zoom.us/j/123456789',
        passcode: 'secret',
        start_url: 'https://zoom.us/s/123456789',
      },
    };
    const payments = [
      {
        id: 'pay1',
        amount_cents: 5000,
        currency: 'EUR',
        status: 'succeeded',
        provider: 'stripe',
        created_at: '2026-07-15T08:00:00Z',
        session_grant_id: 'g1',
      },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [booking] });
      if (table === 'payments') return buildPaymentsChain({ data: payments });
      throw new Error(`unexpected table: ${table}`);
    });

    const out = await getAllBookingsWithDetails();
    expect(out).toHaveLength(1);
    const b = out[0]!;
    expect(b.id).toBe('b1');
    expect(b.status).toBe('confirmed');
    expect(b.student?.full_name).toBe('Alice Liddell');
    expect(b.student?.email).toBe('alice@example.com');
    expect(b.tutor?.id).toBe('tut1');
    expect(b.tutor?.full_name).toBe('Bob Tutor');
    expect(b.tutor?.email).toBe('bob@example.com');
    expect(b.curriculum?.session_title).toBe('Algebra basics');
    expect(b.curriculum?.chapter_title).toBe('Linear equations');
    expect(b.curriculum?.course_title).toBe('Mathematics');
    expect(b.curriculum?.program_title).toBe('High School');
    expect(b.curriculum?.grade_title).toBe('Grade 11');
    expect(b.payment?.amount_cents).toBe(5000);
    expect(b.payment?.status).toBe('succeeded');
    expect(b.payment?.id).toBe('pay1');
    expect(b.meeting?.meeting_id).toBe('123456789');
    expect(b.meeting?.join_url).toBe('https://zoom.us/j/123456789');
    expect(b.meeting?.passcode).toBe('secret');
  });

  it('handles missing optional joins (no meeting, no payment, no curriculum)', async () => {
    const booking = {
      id: 'b2',
      status: 'scheduled',
      scheduled_start: '2026-07-25T14:00:00Z',
      scheduled_end:   '2026-07-25T15:00:00Z',
      timezone: 'Europe/Paris',
      notes: null,
      calendly_event_uri: null,
      calendly_invitee_uri: null,
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-07-18T08:00:00Z',
      updated_at: '2026-07-18T08:00:00Z',
      student: null,
      tutor: null,
      session: null,
      grant: null,
      meeting: null,
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [booking] });
      if (table === 'payments') return buildPaymentsChain({ data: [] });
      throw new Error(`unexpected table: ${table}`);
    });

    const out = await getAllBookingsWithDetails();
    expect(out).toHaveLength(1);
    const b = out[0]!;
    expect(b.student).toBeNull();
    expect(b.tutor).toBeNull();
    expect(b.curriculum).toBeNull();
    expect(b.payment).toBeNull();
    expect(b.meeting).toBeNull();
  });

  it('handles Supabase returning an object-shaped nested join as a single-element array', async () => {
    const booking = {
      id: 'b3',
      status: 'scheduled',
      scheduled_start: '2026-08-01T09:00:00Z',
      scheduled_end:   '2026-08-01T10:00:00Z',
      timezone: 'Europe/Paris',
      notes: null,
      calendly_event_uri: null,
      calendly_invitee_uri: null,
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-07-18T08:00:00Z',
      updated_at: '2026-07-18T08:00:00Z',
      student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com' },
      // Sprint 3.8 — array shape (the raw tutor row).
      tutor: {
        id: 'tut1',
        full_name: 'Bob',
        email: 'b@example.com',
        phone: null,
        status: 'active',
      },
      session: {
        id: 'sess1',
        title: 'Algebra',
        chapter: {
          id: 'ch1',
          title: 'Linear',
          course: {
            id: 'c1',
            title: 'Math',
            program: [{ id: 'p1', title: 'HS' }],   // array shape
            grade:   { id: 'g1', title: 'G11' },
          },
        },
      },
      grant: { id: 'g1' },
      meeting: null,
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [booking] });
      if (table === 'payments') return buildPaymentsChain({ data: [] });
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getAllBookingsWithDetails();
    expect(out).toHaveLength(1);
    const b = out[0]!;
    expect(b.tutor?.full_name).toBe('Bob');
    expect(b.curriculum?.program_title).toBe('HS');
    expect(b.curriculum?.grade_title).toBe('G11');
  });

  it('returns [] on read failure instead of throwing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsChain({ data: null, error: { message: 'timeout' } });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getAllBookingsWithDetails();
    expect(out).toEqual([]);
  });

  it('degrades to payment=null when the payments read fails', async () => {
    const booking = {
      id: 'b4',
      status: 'scheduled',
      scheduled_start: '2026-08-02T09:00:00Z',
      scheduled_end:   '2026-08-02T10:00:00Z',
      timezone: 'Europe/Paris',
      notes: null,
      calendly_event_uri: null,
      calendly_invitee_uri: null,
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-07-18T08:00:00Z',
      updated_at: '2026-07-18T08:00:00Z',
      student: null,
      tutor: null,
      session: null,
      grant: { id: 'g1' },
      meeting: null,
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [booking] });
      if (table === 'payments') {
        return buildPaymentsChain({ data: null, error: { message: 'payments down' } });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getAllBookingsWithDetails();
    expect(out).toHaveLength(1);
    expect(out[0]!.payment).toBeNull();
  });

  it('keeps only the most recent payment per grant when multiple are returned', async () => {
    const booking = {
      id: 'b5',
      status: 'scheduled',
      scheduled_start: '2026-08-03T09:00:00Z',
      scheduled_end:   '2026-08-03T10:00:00Z',
      timezone: 'Europe/Paris',
      notes: null,
      calendly_event_uri: null,
      calendly_invitee_uri: null,
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-07-18T08:00:00Z',
      updated_at: '2026-07-18T08:00:00Z',
      student: null,
      tutor: null,
      session: null,
      grant: { id: 'g1' },
      meeting: null,
    };
    // The service sorts by `created_at desc, id desc`, so the
    // service mock will receive the rows in that order. The
    // service must keep the FIRST one for each `session_grant_id`
    // (because we order newest first).
    const payments = [
      {
        id: 'pay2', // newer
        amount_cents: 7000,
        currency: 'EUR',
        status: 'succeeded',
        provider: 'stripe',
        created_at: '2026-07-19T08:00:00Z',
        session_grant_id: 'g1',
      },
      {
        id: 'pay1', // older
        amount_cents: 5000,
        currency: 'EUR',
        status: 'refunded',
        provider: 'stripe',
        created_at: '2026-07-15T08:00:00Z',
        session_grant_id: 'g1',
      },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: [booking] });
      if (table === 'payments') return buildPaymentsChain({ data: payments });
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getAllBookingsWithDetails();
    expect(out[0]!.payment?.id).toBe('pay2');
    expect(out[0]!.payment?.amount_cents).toBe(7000);
  });
});

describe('getBookingByIdWithDetails', () => {
  it('returns null when the row does not exist', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: null });
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getBookingByIdWithDetails('00000000-0000-0000-0000-000000000000');
    expect(out).toBeNull();
  });

  it('returns the projected booking on hit', async () => {
    const booking = {
      id: 'b9',
      status: 'completed',
      scheduled_start: '2026-06-01T10:00:00Z',
      scheduled_end:   '2026-06-01T11:00:00Z',
      timezone: 'Europe/Paris',
      notes: null,
      calendly_event_uri: null,
      calendly_invitee_uri: null,
      cancelled_at: null,
      cancelled_reason: null,
      rescheduled_from: null,
      created_at: '2026-05-15T08:00:00Z',
      updated_at: '2026-06-01T11:00:00Z',
      student: { id: 'stu1', full_name: 'Alice', email: 'a@example.com' },
      // Sprint 3.8 — flat tutor shape.
      tutor: { id: 'tut1', full_name: 'Bob', email: 'b@example.com', phone: null, status: 'active' },
      session: {
        id: 'sess1',
        title: 'Algebra',
        chapter: {
          id: 'ch1',
          title: 'Linear',
          course: {
            id: 'c1',
            title: 'Math',
            program: { id: 'p1', title: 'HS' },
            grade:   { id: 'g1', title: 'G11' },
          },
        },
      },
      grant: { id: 'g1' },
      meeting: { id: 'm1', provider: 'zoom', meeting_id: '999', join_url: 'https://zoom.us/j/999', passcode: null, start_url: null },
    };
    const payments = [
      {
        id: 'pay1',
        amount_cents: 5000,
        currency: 'EUR',
        status: 'succeeded',
        provider: 'stripe',
        created_at: '2026-05-15T08:00:00Z',
        session_grant_id: 'g1',
      },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') return buildBookingsChain({ data: booking });
      if (table === 'payments') return buildPaymentsChain({ data: payments });
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getBookingByIdWithDetails('b9');
    expect(out).not.toBeNull();
    expect(out!.id).toBe('b9');
    expect(out!.curriculum?.course_title).toBe('Math');
    expect(out!.payment?.id).toBe('pay1');
    expect(out!.payment?.amount_cents).toBe(5000);
  });

  it('returns null on read failure', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'session_bookings') {
        return buildBookingsChain({ data: null, error: { message: 'oops' } });
      }
      throw new Error(`unexpected table: ${table}`);
    });
    const out = await getBookingByIdWithDetails('x');
    expect(out).toBeNull();
  });
});
