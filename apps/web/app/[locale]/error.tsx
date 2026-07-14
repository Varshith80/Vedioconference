'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

/**
 * Client error boundary scoped to the [locale] subtree. Logs the
 * error to the central logger on mount so we get observability
 * even when the error happens before monitoring (Phase 5 Sentry)
 * is in place. Mirrors `app/error.tsx` but is local to the locale
 * segment so the message stays in the user's language.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('Error');
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app/[locale]/error]', error.message, error.stack);
  }, [error]);
  return <ErrorState title={t('title')} onRetry={reset} />;
}
