'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/services/auth/use-auth';

/**
 * Top header of the `(dashboard)` layout. Shows the user name on
 * the left and a sign-out button on the right. Sign-out calls
 * `useAuth().signOut()` and redirects to the marketing home.
 */
export function DashboardHeader() {
  const router = useRouter();
  const auth = useAuth();
  const [busy, setBusy] = React.useState(false);

  const name = auth.session?.user.fullName ?? auth.session?.user.email ?? 'Mon espace';

  async function onSignOut() {
    setBusy(true);
    try {
      await auth.signOut();
      router.push('/');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{name}</p>
        <p className="truncate text-xs text-muted-foreground">Espace personnel</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSignOut}
        disabled={busy}
        aria-label="Se déconnecter"
      >
        <LogOut className="h-4 w-4" aria-hidden={true} />
        <span className="hidden sm:inline">Se déconnecter</span>
      </Button>
    </header>
  );
}
