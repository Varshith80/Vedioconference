import * as React from 'react';

interface JsonLdProps {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Optional id so multiple JSON-LD nodes on a page are deduped. */
  id?: string;
}

/**
 * Renders a JSON-LD `<script>` tag for SEO. Server-rendered.
 * Use for Organization on the landing page, Course on each course
 * detail, etc. The shape is validated by Google Rich Results tests.
 */
export function JsonLd({ data, id = 'jsonld' }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      id={id}
      // We must serialize exactly the object we received.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
