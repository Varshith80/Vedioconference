'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Menu, X } from 'lucide-react';
import { BrandMark } from './brand-mark';
import { Container } from '@/components/shared/container';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from './language-switcher';
import { cn } from '@/lib/utils/cn';
import { getPrimaryNav } from '@/lib/i18n/nav';
import { BRAND } from '@/lib/constants/brand';

interface SiteHeaderProps {
  /** Is the visitor signed in? When true, the right side shows "Mon espace". */
  isAuthenticated: boolean;
  /** Display name shown in the secondary CTA when signed in. */
  userLabel?: string | null;
  className?: string;
}

/**
 * Marketing site header — sticky, transparent-to-solid on scroll,
 * with a hamburger Sheet for mobile. All visible strings come
 * from the active locale's `SiteHeader` and `Nav` namespaces.
 */
export function SiteHeader({ isAuthenticated, userLabel, className }: SiteHeaderProps) {
  const tHeader = useTranslations('SiteHeader');
  const tNav = useTranslations('Nav');
  const nav = getPrimaryNav(tNav);
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors',
        scrolled ? 'border-border bg-background/90 backdrop-blur' : 'border-transparent bg-background/70 backdrop-blur',
        className,
      )}
    >
      <Container className="flex h-14 items-center justify-between gap-3 sm:h-16">
        <Link
          href="/"
          aria-label={tHeader('ariaHome')}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
        </Link>

        {/* Desktop nav */}
        <nav aria-label={tNav('ariaPrimary')} className="hidden md:flex md:items-center md:gap-1">
          {nav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-2 md:flex">
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link href="/dashboard">{tHeader('mySpace')}{userLabel ? ` — ${userLabel}` : ''}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">{tHeader('signin')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/register">{tHeader('signup')}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tHeader('openMenu')}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </Container>

      {/* Mobile menu — simple custom dialog (avoids adding a Sheet dep). */}
      {open && (
        <div
          id="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label={tNav('ariaMobile')}
          className="fixed inset-0 z-50 md:hidden"
        >
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 flex w-full max-w-xs flex-col bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <BrandMark size="sm" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tHeader('closeMenu')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <nav aria-label={tNav('ariaPrimary')} className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex justify-end">
                <LanguageSwitcher />
              </div>
              <ul className="space-y-1">
                {nav.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-col gap-2 border-t pt-4">
                {isAuthenticated ? (
                  <Button asChild className="w-full">
                    <Link href="/dashboard" onClick={() => setOpen(false)}>{tHeader('mySpace')}</Link>
                  </Button>
                ) : (
                  <>
                    <Button asChild variant="outline" className="w-full">
                      <Link href="/auth/login" onClick={() => setOpen(false)}>{tHeader('signin')}</Link>
                    </Button>
                    <Button asChild className="w-full">
                      <Link href="/auth/register" onClick={() => setOpen(false)}>{tHeader('signup')}</Link>
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

// Re-export the brand so consumers that import the brand-name from this
// module (e.g. the layout) don't pull the constants module separately.
export { BRAND };
