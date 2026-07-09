'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarRange, LayoutDashboard, User2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { asArray, type TLike } from '@/lib/i18n/paths';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  bookings: CalendarRange,
  resources: BookOpen,
  profile: User2,
};

function getNavItems(t: TLike & { raw: (key: string) => unknown }, locale: string): ReadonlyArray<NavItem> {
  const items = asArray<{ id: string; label: string; href: string }>(t.raw('Dashboard.topNav.items'));
  return items.map((it) => ({
    href: `/${locale}${it.href}`,
    label: it.label,
    icon: ICONS[it.id] ?? LayoutDashboard,
    exact: it.id === 'dashboard',
  }));
}

/**
 * Horizontal tab nav used at the top of the dashboard on
 * screens narrower than `md` (where the sidebar is hidden).
 */
export function DashboardTopNav() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const tDash = useTranslations('Dashboard');
  const nav = getNavItems(t, locale);
  return (
    <nav
      aria-label={tDash('topNav.aria')}
      className="border-b bg-card md:hidden"
    >
      <ul role="list" className="container flex gap-1 overflow-x-auto py-2">
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
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary/5 text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden={true} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
