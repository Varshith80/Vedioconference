import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChapterList } from '@/components/marketing/chapter-list';
import type { ChapterWithSessions, Session } from '@/types/domain';

// =====================================================================
// Phase 3 — M3.3 chapter-list → SessionBookingCard wiring.
//
// The course detail RSC renders one <ChapterList> per course.
// Each chapter accordion expands to a row per session, and
// every session row now mounts a <SessionBookingCard> below
// the existing meta row. The card renders either the Calendly
// inline embed (when the session has both a tutor_id and a
// calendly_event_uri) or the `embedUnavailable` i18n fallback
// (when either is null).
//
// This test pins the wiring without booting Calendly or
// Supabase. We mock the CalendlyInlineEmbed so we can:
//   - assert the embed is mounted exactly once for sessions
//     that have a tutor + event URI;
//   - assert the embed is NOT mounted when tutor_id or
//     calendly_event_uri is null;
//   - assert the `embedUnavailable` fallback is shown
//     instead, with the correct i18n key path.
// =====================================================================

// --- Mocks (must come before importing the component under test) ---

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace: string) => (key: string, _vars?: Record<string, unknown>) =>
    `${namespace}.${key}`,
}));

const calendlyRenderSpy = vi.fn();
vi.mock('@/components/dashboard/calendly-inline-embed', () => ({
  CalendlyInlineEmbed: (props: { eventTypeUri: string }) => {
    calendlyRenderSpy(props);
    return <div data-testid="calendly-embed" data-event-uri={props.eventTypeUri} />;
  },
}));

afterEach(() => {
  cleanup();
  calendlyRenderSpy.mockReset();
});

// --- Fixtures ---

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? '00000000-0000-0000-0000-000000000001',
    chapter_id: overrides.chapter_id ?? '00000000-0000-0000-0000-000000000010',
    position: overrides.position ?? 1,
    slug: overrides.slug ?? 'session-1',
    title: overrides.title ?? 'Limits',
    description: overrides.description ?? null,
    duration_min: overrides.duration_min ?? 60,
    price_cents: overrides.price_cents ?? 3500,
    currency: overrides.currency ?? 'EUR',
    is_published: overrides.is_published ?? true,
    is_preview: overrides.is_preview ?? false,
    calendly_event_uri: overrides.calendly_event_uri ?? null,
    tutor_id: overrides.tutor_id ?? null,
    sort_order: overrides.sort_order ?? 0,
    metadata: overrides.metadata ?? {},
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  };
}

const chapters: ReadonlyArray<ChapterWithSessions> = [
  {
    id: '00000000-0000-0000-0000-0000000000a1',
    course_id: '00000000-0000-0000-0000-0000000000b1',
    position: 1,
    slug: 'chapter-1',
    title: 'Chapter 1',
    description: null,
    default_duration_min: 60,
    is_published: true,
    sort_order: 0,
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    sessions: [
      // First session: has tutor + Calendly URI → embed mounted.
      makeSession({
        id: '00000000-0000-0000-0000-0000000000c1',
        title: 'Limits',
        tutor_id: '00000000-0000-0000-0000-0000000000d1',
        calendly_event_uri: 'https://api.calendly.com/event_types/AAA',
      }),
      // Second session: missing tutor → fallback shown.
      makeSession({
        id: '00000000-0000-0000-0000-0000000000c2',
        position: 2,
        title: 'Derivatives',
        tutor_id: null,
        calendly_event_uri: 'https://api.calendly.com/event_types/BBB',
      }),
      // Third session: missing event URI → fallback shown.
      makeSession({
        id: '00000000-0000-0000-0000-0000000000c3',
        position: 3,
        title: 'Integrals',
        tutor_id: '00000000-0000-0000-0000-0000000000d2',
        calendly_event_uri: null,
      }),
    ],
  },
];

// --- Tests ---

describe('ChapterList — Phase 3 M3.3 SessionBookingCard wiring', () => {
  it('mounts the Calendly embed for sessions with both tutor_id and calendly_event_uri', () => {
    render(<ChapterList chapters={chapters} basePath="/en/courses/foo/chapters" />);

    // Exactly one embed was mounted — the session that has
    // both `tutor_id` and `calendly_event_uri`.
    expect(calendlyRenderSpy).toHaveBeenCalledTimes(1);
    expect(calendlyRenderSpy.mock.calls[0]![0].eventTypeUri).toBe(
      'https://api.calendly.com/event_types/AAA',
    );

    // The embed title key is requested via i18n.
    expect(screen.getByText('Sessions.embedTitle')).toBeTruthy();

    // The DOM marks the embed with a stable test id.
    const embeds = screen.getAllByTestId('calendly-embed');
    expect(embeds).toHaveLength(1);
    expect(embeds[0]!.getAttribute('data-event-uri')).toBe(
      'https://api.calendly.com/event_types/AAA',
    );
  });

  it('renders the embedUnavailable fallback when tutor_id is null', () => {
    render(<ChapterList chapters={chapters} basePath="/en/courses/foo/chapters" />);
    // One embed for the eligible session; the second session
    // (no tutor) shows the fallback string.
    const fallbacks = screen.getAllByText('Sessions.embedUnavailable');
    expect(fallbacks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the embedUnavailable fallback when calendly_event_uri is null', () => {
    // The fixture already has one session with tutor but
    // no event URI — assert the fallback is rendered for
    // that session as well as the no-tutor session.
    render(<ChapterList chapters={chapters} basePath="/en/courses/foo/chapters" />);
    const fallbacks = screen.getAllByText('Sessions.embedUnavailable');
    // At least two fallback notes (one for each session
    // missing either tutor_id or calendly_event_uri).
    expect(fallbacks.length).toBeGreaterThanOrEqual(2);
  });
});
