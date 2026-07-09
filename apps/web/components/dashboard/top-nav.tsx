'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, CalendarRange, LayoutDashboard, User2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { href: '/dashboard',           label: 'Tableau de bord', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/bookings',  label: 'Réservations',    icon: CalendarRange },
  { href: '/dashboard/resources', label: 'Ressources',      icon: BookOpen },
  { href: '/dashboard/profile',   label: 'Profil',          icon: User2 },
];

/**
 * Horizontal tab nav used at the top of the dashboard on
 * screens narrower than `md` (where the sidebar is hidden).
 */
export function DashboardTopNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation de l’espace personnel"
      className="border-b bg-card md:hidden"
    >
      <ul role="list" className="container flex gap-1 overflow-x-auto py-2">
        {NAV.map((item) => {
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
