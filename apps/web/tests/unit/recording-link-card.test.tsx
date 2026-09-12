import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';

// The RecordingLinkCard is a pure presentational Server Component.
// We only need to mock the Button (which uses Radix Slot) so the
// static markup renders cleanly. No Supabase / service mocks.
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
  }) => React.createElement('a', rest, children),
}));

import { RecordingLinkCard } from '@/components/dashboard/recording-link-card';

const EN_COPY = {
  cardLabel: 'Session recording',
  cta: 'Watch the recording',
  pending: 'Recording not available yet',
};
const FR_COPY = {
  cardLabel: 'Enregistrement de la séance',
  cta: "Voir l'enregistrement",
  pending: 'Enregistrement bientôt disponible',
};

describe('RecordingLinkCard — Sprint 11 11-E', () => {
  it('A. renders the available state with a target=_blank link, icon, and cta label when recordingUrl is set', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: 'https://zoom.us/rec/share/abc123',
        copy: EN_COPY,
      }),
    );
    expect(html).toContain('data-recording-state="available"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('data-testid="recording-link"');
    expect(html).toContain('href="https://zoom.us/rec/share/abc123"');
    expect(html).toContain('Session recording');
    expect(html).toContain('Watch the recording');
    // The PlayCircle icon is rendered as an inline svg.
    expect(html).toContain('<svg');
  });

  it('B. renders the pending notice (no link, no icon) when recordingUrl is null', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: null,
        copy: EN_COPY,
      }),
    );
    expect(html).toContain('data-recording-state="pending"');
    expect(html).toContain('Recording not available yet');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('data-testid="recording-link"');
    expect(html).not.toContain('<svg');
  });

  it('C. renders the pending notice (no link) when recordingUrl is an empty string', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: '',
        copy: EN_COPY,
      }),
    );
    expect(html).toContain('data-recording-state="pending"');
    expect(html).not.toContain('data-testid="recording-link"');
  });

  it('D. renders the pending notice (no link) when recordingUrl is whitespace only', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: '   \t  \n  ',
        copy: EN_COPY,
      }),
    );
    expect(html).toContain('data-recording-state="pending"');
    expect(html).not.toContain('data-testid="recording-link"');
  });

  it('E. preserves query strings and fragments in the href verbatim', () => {
    const url =
      'https://zoom.us/rec/share/abc?pwd=xyz123#download';
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: url,
        copy: EN_COPY,
      }),
    );
    expect(html).toContain(
      `href="https://zoom.us/rec/share/abc?pwd=xyz123#download"`,
    );
  });

  it('F. accepts a 4096-character URL without truncation', () => {
    const long = `https://zoom.us/rec/share/${'a'.repeat(4000)}`;
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: long,
        copy: EN_COPY,
      }),
    );
    expect(html).toContain(`href="${long}"`);
  });

  it('G. renders the French copy when supplied', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: 'https://zoom.us/rec/share/fr',
        copy: FR_COPY,
      }),
    );
    expect(html).toContain('Enregistrement de la séance');
    // React HTML-escapes the apostrophe (`'` → `&#x27;`) in
    // static markup. Assert against the encoded form so this
    // test does not couple to internal escaping behaviour.
    expect(html).toContain('Voir l&#x27;enregistrement');
    expect(html).not.toContain('Watch the recording');
    expect(html).not.toContain('Session recording');
  });

  it('H. renders the French pending notice when supplied with a null URL', () => {
    const html = renderToStaticMarkup(
      React.createElement(RecordingLinkCard, {
        recordingUrl: null,
        copy: FR_COPY,
      }),
    );
    expect(html).toContain('Enregistrement bientôt disponible');
    expect(html).not.toContain('Recording not available yet');
  });

  it('I. has no "use client" directive (Server Component — source-level guard)', async () => {
    // Read the first 10 lines of the source file and assert no
    // "use client" directive. A regression here would change the
    // tree type and could leak i18n into the client bundle.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(
        __dirname,
        '../../components/dashboard/recording-link-card.tsx',
      ),
      'utf8',
    );
    const head = source
      .split('\n')
      .slice(0, 10)
      .join('\n');
    expect(head).not.toMatch(/['"]use client['"]/);
  });

  it('J. is presentational — no Supabase or service imports (source-level guard)', async () => {
    // The read path is consumed by RSC pages; the component itself
    // must not pull in a Supabase client or a service module.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(
        __dirname,
        '../../components/dashboard/recording-link-card.tsx',
      ),
      'utf8',
    );
    expect(source).not.toMatch(/from ['"]@\/lib\/supabase/);
    expect(source).not.toMatch(/from ['"]@\/services\//);
  });

  it('K. imports its icon from lucide-react (source-level guard)', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(
        __dirname,
        '../../components/dashboard/recording-link-card.tsx',
      ),
      'utf8',
    );
    expect(source).toMatch(/from ['"]lucide-react['"]/);
  });
});

// =====================================================================
// Sprint 11 — 11-E fix-up: admin read-path must handle BOTH states.
//
// The student-side `RecordingLinkCard` is covered above. This block
// proves the same dual-state contract on the admin side: the
// `BookingRow` presenter in `components/admin/bookings-row.tsx`
// renders the available pill when `meeting.recording_url` is set,
// and the muted "Recording not available yet" pending pill when it
// is null. The 10-cell row contract is preserved — these assertions
// only walk the array of cells returned by `BookingRow` and check
// the session cell (index 5).
// =====================================================================

import { BookingRow } from '@/components/admin/bookings-row';
import type {
  BookingWithDetails,
} from '@/services/admin/bookings';

// Minimal `BookingWithDetails` fixture. Seven nested fields and
// a meeting object are required by the type; we cast to `unknown`
// first so the test does not have to mirror every field on every
// student. Only `meeting.recording_url` and the curriculum session
// title are read by the assertions below.
function makeBooking(
  recordingUrl: string | null,
): BookingWithDetails {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'completed',
    scheduled_start: '2026-09-12T10:00:00Z',
    scheduled_end: '2026-09-12T11:00:00Z',
    timezone: 'UTC',
    notes: null,
    calendly_event_uri: null,
    calendly_invitee_uri: null,
    cancelled_at: null,
    cancelled_reason: null,
    rescheduled_from: null,
    created_at: '2026-09-12T00:00:00Z',
    updated_at: '2026-09-12T00:00:00Z',
    student: { id: 's1', full_name: 'Student One', email: 's1@example.com' },
    tutor: { id: 't1', full_name: 'Tutor One', email: 't1@example.com', phone: null, status: 'active' },
    curriculum: {
      session_id: 'sess1',
      session_title: 'Cours de test',
      chapter_id: null,
      chapter_title: null,
      course_id: null,
      course_title: null,
      program_id: null,
      program_title: null,
      grade_id: null,
      grade_title: null,
    },
    payment: null,
    grant: null,
    meeting: recordingUrl === null
      ? null
      : {
          id: 'm1',
          provider: 'zoom',
          meeting_id: 'm1',
          join_url: 'https://zoom.us/j/m1',
          passcode: null,
          start_url: null,
          recording_url: recordingUrl,
        },
  } as unknown as BookingWithDetails;
}

function renderSessionCell(b: BookingWithDetails): string {
  const cells = BookingRow({
    b,
    bookingStatusLabels: {
      scheduled: 'Scheduled',
      confirmed: 'Confirmed',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No-show',
      rescheduled: 'Rescheduled',
    },
    paymentStatusLabels: {
      pending: 'Pending',
      succeeded: 'Succeeded',
      failed: 'Failed',
      refunded: 'Refunded',
      partially_refunded: 'Partially refunded',
    },
    recordingCta: 'Watch the recording',
    recordingAriaLabel: 'Session recording',
    recordingPending: 'Recording not available yet',
  });
  // Wrap the cells in a parent so renderToStaticMarkup does not
  // walk an array. `cells[5]` is the session cell (column order
  // is id, student, program, course, chapter, session, tutor,
  // when, status, payment — 10 cells, contract preserved).
  const sessionCell = cells[5];
  if (!React.isValidElement(sessionCell)) {
    throw new Error('expected session cell to be a valid element');
  }
  return renderToStaticMarkup(
    React.createElement('div', null, sessionCell),
  );
}

describe('Admin BookingRow recording state — Sprint 11 11-E fix-up', () => {
  it('L. renders the muted "Recording not available yet" pill when meeting.recording_url is null', () => {
    const html = renderSessionCell(makeBooking(null));
    // The pending pill is present.
    expect(html).toContain('data-testid="admin-recording-pending"');
    expect(html).toContain('data-recording-state="pending"');
    expect(html).toContain('Recording not available yet');
    // The available anchor is absent — the two states are
    // mutually exclusive on the same cell.
    expect(html).not.toContain('data-testid="admin-recording-link"');
    expect(html).not.toContain('data-recording-state="available"');
    expect(html).not.toContain('Watch the recording');
  });

  it('M. renders the available "Watch the recording" link when meeting.recording_url is set (regression)', () => {
    const html = renderSessionCell(makeBooking('https://zoom.us/rec/share/abc123'));
    // The available anchor is present and opens in a new tab.
    expect(html).toContain('data-testid="admin-recording-link"');
    expect(html).toContain('data-recording-state="available"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://zoom.us/rec/share/abc123"');
    expect(html).toContain('Watch the recording');
    // The pending pill is absent.
    expect(html).not.toContain('data-testid="admin-recording-pending"');
    expect(html).not.toContain('data-recording-state="pending"');
    expect(html).not.toContain('Recording not available yet');
  });

  it('N. treats whitespace-only recording_url as the pending state (defensive trim)', () => {
    const html = renderSessionCell(makeBooking('   \t  \n  '));
    // Empty after trim → fall through to the pending branch.
    expect(html).toContain('data-recording-state="pending"');
    expect(html).toContain('Recording not available yet');
    expect(html).not.toContain('data-testid="admin-recording-link"');
  });
});
