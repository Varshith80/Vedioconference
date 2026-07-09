'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { locales, defaultLocale, type Locale } from '@/i18n';
import { cn } from '@/lib/utils/cn';

const LABEL: Record<Locale, string> = { en: 'EN', fr: 'FR' };

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Switches the active locale by rewriting the first URL segment.
 * Persists across navigation via the next-intl cookie (set by the
 * server middleware on the next request) and pushes the user to
 * the equivalent path in the other locale.
 *
 * Renders as a small button group; the active locale is announced
 * via `aria-current="true"`.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const t = useTranslations('SiteHeader.languageSwitcher');

  const target = React.useCallback(
    (other: Locale) => {
      const stripped = pathname.replace(/^\/(en|fr)(?=\/|$)/, '') || '/';
      const next = `/${other}${stripped === '/' ? '' : stripped}`;
      document.cookie = `NEXT_LOCALE=${other}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.push(next);
      router.refresh();
    },
    [pathname, router],
  );

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'inline-flex items-center rounded-md border bg-background p-0.5 text-xs font-semibold',
        className,
      )}
    >
      {locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => target(l)}
            aria-current={active ? 'true' : undefined}
            aria-label={l === defaultLocale ? t('english') : t('french')}
            className={cn(
              'rounded-sm px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
