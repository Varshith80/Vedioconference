'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorState } from '@/components/shared/error-state';

/**
 * Client error boundary. Logs the error to the central logger on
 * mount so we get observability even when the error happens before
 * monitoring (Phase 5 Sentry) is in place.
 */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('Error');
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app/error]', error.message, error.stack);
  }, [error]);
  return <ErrorState title={t('title')} onRetry={reset} />;
}
