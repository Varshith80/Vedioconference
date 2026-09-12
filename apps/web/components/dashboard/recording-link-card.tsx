import * as React from 'react';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Recording link — read-only surface for the `meeting_links.recording_url`
 * column added in Sprint 11.
 *
 * Sprint 11 — 11-E (read-path UI). The Zoom `recording.completed` webhook
 * (route `app/api/webhooks/zoom/route.ts`, 11-C) writes the URL to
 * `meeting_links.recording_url` (schema column from 11-B, applied in 11-F).
 * The n8n `zoom-recording-completed` workflow (11-D) is the transport.
 *
 * This card is the **only** UI surface that consumes the column today. It
 * is reused on:
 *
 *   - the student session detail page (`/dashboard/sessions/[id]`), and
 *   - the admin bookings row (`components/admin/bookings-row.tsx`).
 *
 * Behaviour:
 *   - `recordingUrl` is a non-empty string → render an icon + label +
 *     a Button (`asChild`) linking to the URL with
 *     `target="_blank" rel="noopener noreferrer"`. The button label is
 *     `copy.cta` ("Watch the recording" / "Voir l'enregistrement").
 *   - `recordingUrl` is `null`, an empty string, or whitespace → render
 *     a muted `copy.pending` notice ("Recording not available yet" /
 *     "Enregistrement bientôt disponible"). No button, no icon.
 *
 * The component is pure presentational:
 *
 *   - no `'use client'` directive;
 *   - no Supabase / service imports (verified by the regression test
 *     `recording-link-card.test.tsx`);
 *   - the icon is imported from `lucide-react` (already a dependency).
 *
 * URL hardening is intentionally minimal. Zoom's `recording.completed`
 * payload always emits an absolute `https://` share URL; we do not
 * validate the protocol in the read path. We only `.trim()` the value
 * so a whitespace-padded string from a future payload shape collapses
 * to "no URL" instead of producing a `<a href="   ...">` that the
 * browser cannot navigate.
 */
export interface RecordingLinkCardProps {
  /** Zoom share URL, or `null` when no recording has been linked yet. */
  recordingUrl: string | null;
  /** Localised copy bundle. */
  copy: {
    /** Card label ("Session recording" / "Enregistrement de la séance"). */
    cardLabel: string;
    /** Button label on the available link ("Watch the recording"). */
    cta: string;
    /** Pending notice ("Recording not available yet"). */
    pending: string;
  };
}

export function RecordingLinkCard({
  recordingUrl,
  copy,
}: RecordingLinkCardProps): React.ReactElement {
  const trimmed = typeof recordingUrl === 'string' ? recordingUrl.trim() : '';
  const hasUrl = trimmed.length > 0;

  if (!hasUrl) {
    return (
      <p
        className="text-xs text-muted-foreground"
        data-recording-state="pending"
      >
        {copy.pending}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-recording-state="available">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <PlayCircle
          className="h-3.5 w-3.5 text-[color:var(--brand-accent)]"
          aria-hidden="true"
        />
        {copy.cardLabel}
      </p>
      <Button asChild size="sm" className="w-fit">
        <a
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="recording-link"
        >
          {copy.cta}
        </a>
      </Button>
    </div>
  );
}
