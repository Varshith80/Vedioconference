'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/shared/error-state';

/**
 * Root-level error boundary required by Next.js 15.
 *
 * Replaces `<RootLayout>` when an error throws above the [locale]
 * segment (i.e. before the i18n providers mount). It must include
 * its own `<html>` and `<body>` because the root layout is not
 * rendered in this branch.
 *
 * We deliberately do NOT use `useTranslations` here: the
 * `NextIntlClientProvider` is mounted by the root layout, and
 * that layout is not present in the global-error branch. We
 * detect the locale from the `vedioconference.locale` cookie
 * (set by `middleware.ts`) so the title still flips on /fr;
 * if the cookie is missing or invalid we fall back to English.
 */
function resolveLocale(): 'en' | 'fr' {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('vedioconference.locale='));
  if (!match) return 'en';
  const value = decodeURIComponent(match.slice('vedioconference.locale='.length));
  return value === 'fr' ? 'fr' : 'en';
}

const TITLE: Record<'en' | 'fr', string> = {
  en: 'Something went wrong.',
  fr: "Une erreur s'est produite.",
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app/global-error]', error.message, error.stack);
  }, [error]);

  const locale = resolveLocale();
  return (
    <html lang={locale}>
      <body>
        <ErrorState title={TITLE[locale]} onRetry={reset} />
      </body>
    </html>
  );
}
