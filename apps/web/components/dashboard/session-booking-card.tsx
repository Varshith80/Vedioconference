import * as React from 'react';
import Link from 'next/link';
import { CalendarClock, PlayCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SessionBookingWithDetails } from '@/types/domain';

interface SessionBookingCardProps {
  booking: SessionBookingWithDetails;
  /** Locale-prefixed path the "View" link points at
   *  (`/dashboard/sessions/[id]`). */
  viewHref: string;
  /** Optional locale-prefixed path for the Zoom join button.
   *  When the booking is `confirmed` and has a meeting URL,
   *  the route passes this prop. */
  joinHref?: string;
  /**
   * Sprint 11 — 11-E read-path UI. Localised "Recording" badge
   * copy. When the booking's meeting has a `recording_url`, the
   * card renders an inline badge next to the status badge with
   * this text. When `recordingUrl` is null, the prop is ignored.
   */
  recordingLabel?: string;
  /** `aria-label` for the inline recording badge. */
  recordingLabelAria?: string;
}

/**
 * Dashboard card for one booked session. Renders the session
 * title, scheduled start/end, status badge, and (if the
 * session is confirmed and the meeting link is known) a "Join"
 * button. The existing `BookingCard` (v1) is left untouched
 * for one sprint — this v2 card is used on
 * `/dashboard/sessions` and `/dashboard/bookings` from Sprint
 * 3.5 onward.
 */
export function SessionBookingCard({
  booking,
  viewHref,
  joinHref,
  recordingLabel,
  recordingLabelAria,
}: SessionBookingCardProps) {
  const start = new Date(booking.scheduled_start);
  const formatted = start.toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  // Sprint 11 — R-3 read-path. The `meeting_links.recording_url`
  // column is on the typed `MeetingLink` row directly after
  // 11-F's local migration apply + `pnpm db:types` regen
  // (no boundary cast needed). The `.trim()` defence is a
  // runtime safety net against whitespace-padded payloads.
  const rawRecordingUrl = booking.meeting?.recording_url ?? null;
  const hasRecording =
    typeof rawRecordingUrl === 'string' && rawRecordingUrl.trim().length > 0;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-base">
              {booking.session.title}
            </CardTitle>
            <CardDescription className="mt-1 inline-flex items-center gap-1.5 text-xs">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatted}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            <Badge variant={variantForStatus(booking.status)} className="text-[10px]">
              {labelForStatus(booking.status)}
            </Badge>
            {hasRecording ? (
              <Badge
                variant="outline"
                className="inline-flex items-center gap-1 text-[10px]"
                aria-label={recordingLabelAria}
                data-testid="recording-badge"
              >
                <PlayCircle
                  className="h-3 w-3 text-[color:var(--brand-accent)]"
                  aria-hidden="true"
                />
                {recordingLabel ?? 'Recording'}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="mt-auto flex items-center justify-between gap-3 text-sm">
        <Link
          href={viewHref}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View
        </Link>
        {joinHref ? (
          <Button asChild size="sm">
            <a href={joinHref} target="_blank" rel="noopener noreferrer">
              Join the session
            </a>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function variantForStatus(s: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'confirmed':
    case 'completed':
      return 'default';
    case 'scheduled':
    case 'pending_payment':
      return 'secondary';
    case 'cancelled':
    case 'no_show':
    case 'rescheduled':
      return 'outline';
    default:
      return 'outline';
  }
}

function labelForStatus(s: string): string {
  switch (s) {
    case 'scheduled': return 'Scheduled';
    case 'confirmed': return 'Confirmed';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Cancelled';
    case 'no_show': return 'No-show';
    case 'rescheduled': return 'Rescheduled';
    case 'pending_payment': return 'Pending payment';
    default: return s;
  }
}
