'use client';

import * as React from 'react';
import Link from 'next/link';
import { AuthProvider } from '@/services/auth/auth-react-provider';
import { BrandMark } from '@/components/layout/brand-mark';

/**
 * Auth pages share a single layout: the brand mark on top, the
 * form centred on a Vélin surface, no marketing chrome. The
 * `<AuthProvider>` wrapper makes `useAuth()` available inside
 * every form on this route group.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col bg-background">
        <a href="#main" className="skip-link">
          Aller au contenu principal
        </a>
        <header className="border-b">
          <div className="container flex h-14 items-center justify-between sm:h-16">
            <Link
              href="/"
              aria-label="Intégrale — Accueil"
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark />
            </Link>
          </div>
        </header>
        <main id="main" className="flex flex-1 items-center justify-center p-4">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
}
