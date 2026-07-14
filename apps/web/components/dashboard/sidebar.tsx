'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarRange, LayoutDashboard, School, User2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { BrandMark } from '@/components/layout/brand-mark';
import { cn } from '@/lib/utils/cn';
import { asArray, type TLike } from '@/lib/i18n/paths';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match only this exact href (skip prefix). */
  exact?: boolean;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  programs: School,
  sessions: CalendarRange,
  bookings: CalendarRange,
  resources: BookOpen,
  profile: User2,
};

function getNavItems(t: TLike & { raw: (key: string) => unknown }, locale: string): ReadonlyArray<NavItem> {
  const items = asArray<{ id: string; label: string; href: string }>(t.raw('Dashboard.sidebar.items'));
  return items.map((it) => ({
    href: `/${locale}${it.href}`,
    label: it.label,
    icon: ICONS[it.id] ?? LayoutDashboard,
    exact: it.id === 'dashboard',
  }));
}

/**
 * Sidebar used by the `([locale]/dashboard)` layout. The current
 * item is marked with `aria-current="page"` and a left-edge accent
 * stripe. The sidebar is hidden on small screens — a top nav
 * takes over below `md`.
 */
export function DashboardSidebar() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const tDash = useTranslations('Dashboard');
  const nav = getNavItems(t, locale);
  return (
    <aside
      aria-label={tDash('sidebar.aria')}
      className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col"
    >
      <div className="flex h-16 items-center border-b px-5">
        <Link
          href={`/${locale}`}
          aria-label="Intégrale — Home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandMark />
        </Link>
      </div>
      <nav className="flex-1 p-3">
        <ul role="list" className="flex flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? pathname === item.href
              : pathname?.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-primary/5 text-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-[color:var(--brand-accent)]'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden={true} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
