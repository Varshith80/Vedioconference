import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the Sprint 3.7 admin Bookings service. The
// service issues a single joined `from('session_bookings')
// .select(...).order(...)` query and projects the result
// onto a `BookingWithDetails` shape. We mock the untyped
// server client and assert the projection flattens the
// nested joins (student / tutor / curriculum / payment /
// meeting) correctly, and that the service returns `[]`
// on read failure rather than throwing.

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

// Each call to .from(TABLE) returns a thenable chainable
// object whose final awaited shape is `{ data, error }`.
// For the list helper we also want `.order(...)`; for the
// detail helper we want `.eq(...).maybeSingle()`. The
// chain here exposes both shapes and resolves whatever
// was last called.
function buildChain(payload: { data?: unknown; error?: unknown }) {
  let lastResult: { data: unknown; error: unknown } = {
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
    then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
      resolve(lastResult),
  };
  return chain;
}

beforeEach(() => {
  mockFrom.mockReset();
});

// ----- Tests ------------------------------------------------------------

describe('getAllBookingsWithDetails', () => {
  it('returns [] when the table is empty', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: [] }));
    const out = await getAllBookingsWithDetails();
    expect(out).toEqual([]);
  });

  it('projects a single full booking with all joins flattened', async () => {
    const raw = [
      {
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
        tutor: {
          id: 'tut1',
          profile: { full_name: 'Bob Tutor', email: 'bob@example.com' },
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
        payment: { id: 'pay1', amount_cents: 5000, currency: 'EUR', status: 'succeeded', provider: 'stripe', created_at: '2026-07-15T08:00:00Z' },
        meeting: {
          id: 'm1',
          provider: 'zoom',
          meeting_id: '123456789',
          join_url: 'https://zoom.us/j/123456789',
          passcode: 'secret',
          start_url: 'https://zoom.us/s/123456789',
        },
      },
    ];
    mockFrom.mockImplementation(() => buildChain({ data: raw }));

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
    expect(b.meeting?.meeting_id).toBe('123456789');
    expect(b.meeting?.join_url).toBe('https://zoom.us/j/123456789');
    expect(b.meeting?.passcode).toBe('secret');
  });

  it('handles missing optional joins (no meeting, no payment, no curriculum)', async () => {
    const raw = [
      {
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
        payment: null,
        meeting: null,
      },
    ];
    mockFrom.mockImplementation(() => buildChain({ data: raw }));

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
    const raw = [
      {
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
        tutor: {
          id: 'tut1',
          profile: [{ full_name: 'Bob', email: 'b@example.com' }], // array shape
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
        payment: null,
        meeting: null,
      },
    ];
    mockFrom.mockImplementation(() => buildChain({ data: raw }));
    const out = await getAllBookingsWithDetails();
    expect(out).toHaveLength(1);
    const b = out[0]!;
    expect(b.tutor?.full_name).toBe('Bob');
    expect(b.curriculum?.program_title).toBe('HS');
    expect(b.curriculum?.grade_title).toBe('G11');
  });

  it('returns [] on read failure instead of throwing', async () => {
    mockFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'timeout' } }),
    );
    const out = await getAllBookingsWithDetails();
    expect(out).toEqual([]);
  });
});

describe('getBookingByIdWithDetails', () => {
  it('returns null when the row does not exist', async () => {
    mockFrom.mockImplementation(() => buildChain({ data: null }));
    const out = await getBookingByIdWithDetails('00000000-0000-0000-0000-000000000000');
    expect(out).toBeNull();
  });

  it('returns the projected booking on hit', async () => {
    const raw = {
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
      tutor: { id: 'tut1', profile: { full_name: 'Bob', email: 'b@example.com' } },
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
      payment: { id: 'pay1', amount_cents: 5000, currency: 'EUR', status: 'succeeded', provider: 'stripe', created_at: '2026-05-15T08:00:00Z' },
      meeting: { id: 'm1', provider: 'zoom', meeting_id: '999', join_url: 'https://zoom.us/j/999', passcode: null, start_url: null },
    };
    mockFrom.mockImplementation(() => buildChain({ data: raw }));
    const out = await getBookingByIdWithDetails('b9');
    expect(out).not.toBeNull();
    expect(out!.id).toBe('b9');
    expect(out!.curriculum?.course_title).toBe('Math');
  });

  it('returns null on read failure', async () => {
    mockFrom.mockImplementation(() =>
      buildChain({ data: null, error: { message: 'oops' } }),
    );
    const out = await getBookingByIdWithDetails('x');
    expect(out).toBeNull();
  });
});
