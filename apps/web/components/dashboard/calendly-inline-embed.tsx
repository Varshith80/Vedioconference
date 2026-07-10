'use client';

import * as React from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    Calendly?: {
      initInlineWidget: (opts: { url: string; parentElement: HTMLElement; prefill?: { name?: string; email?: string }; utm?: Record<string, string> }) => void;
    };
  }
}

/**
 * `components/dashboard/calendly-inline-embed.tsx` — wraps the
 * Calendly inline widget. Renders a `<div>` that Calendly fills
 * with the booking UI; loads the Calendly script lazily.
 *
 * The component is intentionally minimal — the scheduling logic
 * is Calendly's. We just provide the right context to it.
 *
 * Props
 * -----
 *   * `eventTypeUri` — the public Calendly event type URL
 *     (e.g. `https://api.calendly.com/event_types/AAA`). The
 *     `parentElement` is the empty `<div>` Calendly will fill.
 *   * `prefill` — optional { name, email } the embed auto-fills.
 *   * `onEventScheduled` — called with the invitee URI Calendly
 *     sets on `window` after a successful booking (Calendly
 *     `inline_embed.js` exposes `event.scheduled` via
 *     `addEventListener('calendly.event_scheduled', …)`).
 */
export interface CalendlyInlineEmbedProps {
  /** Public Calendly event-type URL. */
  eventTypeUri: string;
  prefill?:     { name?: string; email?: string };
  /** Called with the invitee URI after a successful booking. */
  onEventScheduled?: (payload: { event: { uri: string }; invitee: { uri: string } }) => void;
  className?:   string;
  /** Min height of the embed container. Defaults to 700 px. */
  minHeight?:   number;
}

export function CalendlyInlineEmbed(props: CalendlyInlineEmbedProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleScriptLoad = React.useCallback(() => {
    if (!containerRef.current || !window.Calendly) return;
    window.Calendly.initInlineWidget({
      url:            props.eventTypeUri,
      parentElement:  containerRef.current,
      prefill:        props.prefill,
    });
  }, [props.eventTypeUri, props.prefill]);

  // Calendly fires `calendly.event_scheduled` on `window` when
  // the user books. We forward it to the parent.
  React.useEffect(() => {
    if (!props.onEventScheduled) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { event?: { uri?: string }; invitee?: { uri?: string } } | undefined;
      if (detail?.event?.uri && detail?.invitee?.uri) {
        props.onEventScheduled?.({ event: { uri: detail.event.uri }, invitee: { uri: detail.invitee.uri } });
      }
    };
    window.addEventListener('calendly.event_scheduled', handler);
    return () => window.removeEventListener('calendly.event_scheduled', handler);
  }, [props]);

  return (
    <>
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
        onLoad={handleScriptLoad}
      />
      <div
        ref={containerRef}
        className={props.className ?? 'calendly-inline-widget'}
        style={{ minWidth: '320px', height: `${props.minHeight ?? 700}px` }}
        data-calendly-url={props.eventTypeUri}
        aria-label="Calendly booking widget"
      />
    </>
  );
}
