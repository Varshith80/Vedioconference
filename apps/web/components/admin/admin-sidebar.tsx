'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  BookText,
  CalendarCheck,
  CalendarRange,
  CreditCard,
  LayoutDashboard,
  School,
  Upload,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { BrandMark } from '@/components/layout/brand-mark';
import { cn } from '@/lib/utils/cn';
import { asArray, type TLike } from '@/lib/i18n/paths';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Match only this exact href (skip prefix).
  exact?: boolean;
}

// Icon map for the admin nav. The id strings must match the
// `id` field of each entry in `Admin.sidebar.items[]` in
// messages/{en,fr}.json. Unknown ids fall back to the
// dashboard icon (Sprint 3.6 §4.3).
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  programs: School,
  grades: BookText,
  courses: BookOpen,
  chapters: BookText,
  sessions: CalendarRange,
  payments: CreditCard,
  students: Users,
  bookings: CalendarCheck,
  import: Upload,
};

function getNavItems(
  t: TLike & { raw: (key: string) => unknown },
  locale: string,
): ReadonlyArray<NavItem> {
  const items = asArray<{ id: string; label: string; href: string }>(
    t.raw('Admin.sidebar.items'),
  );
  return items.map((it) => ({
    href: `/${locale}${it.href}`,
    label: it.label,
    icon: ICONS[it.id] ?? LayoutDashboard,
    exact: it.id === 'overview',
  }));
}

// Desktop sidebar for the admin console. Mirrors
// DashboardSidebar; the only difference is the i18n namespace
// (Admin.* instead of Dashboard.*) and the icon map. The
// sidebar is hidden below `md`; the top nav takes over on
// small screens.
export function AdminSidebar() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations();
  const tAdmin = useTranslations('Admin');
  const nav = getNavItems(t, locale);
  return (
    <aside
      aria-label={tAdmin('sidebar.aria')}
      className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col"
    >
      <div className="flex h-16 items-center border-b px-5">
        <Link
          href={`/${locale}/admin`}
          aria-label="Intégrale — Admin"
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
