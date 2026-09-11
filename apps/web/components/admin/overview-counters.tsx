'use client';

import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookText,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  Receipt,
  School,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatCents as formatCentsShared } from '@/lib/utils/format';
import type { Locale } from '@/i18n';
import type { OverviewCounters } from '@/services/admin/overview';

interface OverviewCountersProps {
  counters: OverviewCounters;
}

// One tile in the admin overview grid. Pure presentational.
interface CounterTile {
  key: keyof OverviewCounters;
  icon: React.ComponentType<{ className?: string }>;
  // Localised label key (nested under Admin.overview.counters.*).
  labelKey: string;
  // Optional formatter for the raw value (default: identity).
  // Receives the active route locale so currency formatters can
  // pick the matching locale.
  format?: (value: number, locale: string) => string;
}

const TILES: ReadonlyArray<CounterTile> = [
  { key: 'studentsCount',         icon: Users,         labelKey: 'students' },
  { key: 'coursesCount',          icon: School,        labelKey: 'courses' },
  { key: 'chaptersCount',         icon: BookText,      labelKey: 'chapters' },
  { key: 'sessionsCount',         icon: CalendarRange, labelKey: 'sessions' },
  { key: 'sessionGrantsCount',    icon: GraduationCap, labelKey: 'sessionGrants' },
  { key: 'sessionBookingsCount',  icon: LayoutDashboard, labelKey: 'sessionBookings' },
  { key: 'revenueCents',          icon: Wallet,        labelKey: 'revenueCents', format: formatCents },
  { key: 'refundsCents',          icon: Receipt,       labelKey: 'refundsCents', format: formatCents },
];

// Format an integer cents amount as a human-readable EUR
// string using the active route locale. 12345 -> "123 €" in
// fr, "€123" in en (whole euros, no decimal zeroes — see
// `lib/utils/format.ts`). Falls back to 'en' when the locale
// is missing. Delegates to the shared formatter so the whole
// app uses one canonical currency display.
function formatCents(cents: number, locale: string): string {
  return formatCentsShared(cents, 'EUR', (locale || 'en') as Locale);
}

// Grid of platform counters rendered on the admin overview
// page. Renders 8 tiles (Sprint 3.6 §4.4) in a responsive
// grid that goes from 1 col on mobile to 4 cols on lg.
export function OverviewCounters({ counters }: OverviewCountersProps) {
  const t = useTranslations('Admin.overview.counters');
  const locale = useLocale();
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {TILES.map((tile) => {
        const Icon = tile.icon;
        const raw = counters[tile.key];
        const value = tile.format ? tile.format(raw, locale) : String(raw);
        return (
          <li
            key={tile.key}
            className={cn(
              'rounded-lg border bg-card p-5 shadow-sm transition-shadow',
              'hover:shadow-md focus-within:ring-2 focus-within:ring-ring',
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t(tile.labelKey)}
              </p>
              <Icon
                className="h-5 w-5 text-muted-foreground"
                aria-hidden={true}
              />
            </div>
            <p
              data-testid={`counter-${tile.key}`}
              className="mt-3 text-2xl font-semibold tabular-nums text-foreground"
            >
              {value}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
