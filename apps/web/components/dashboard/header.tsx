'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useAuth } from '@/services/auth/use-auth';

/**
 * Top header of the `([locale]/dashboard)` layout. Shows the user
 * name on the left and a sign-out button on the right. Sign-out
 * calls `useAuth().signOut()` and redirects to the locale-aware
 * marketing home.
 */
export function DashboardHeader() {
  const router = useRouter();
  const auth = useAuth();
  const locale = useLocale();
  const t = useTranslations('Dashboard.header');
  const [busy, setBusy] = React.useState(false);

  const name = auth.session?.user.fullName ?? auth.session?.user.email ?? t('fallbackName');

  async function onSignOut() {
    setBusy(true);
    try {
      await auth.signOut();
      router.push(`/${locale}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSignOut}
          disabled={busy}
          aria-label={t('signOutAria')}
        >
          <LogOut className="h-4 w-4" aria-hidden={true} />
          <span className="hidden sm:inline">{t('signOut')}</span>
        </Button>
      </div>
    </header>
  );
}
