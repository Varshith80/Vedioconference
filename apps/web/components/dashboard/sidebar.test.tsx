import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { DashboardSidebar } from './sidebar';
import en from '@/messages/en.json';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/dashboard/bookings',
}));

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('DashboardSidebar', () => {
  it('marks the active link with aria-current="page"', () => {
    renderWithIntl(<DashboardSidebar />);
    const active = screen.getByRole('link', { name: /My bookings/i });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark inactive links', () => {
    renderWithIntl(<DashboardSidebar />);
    const profile = screen.getByRole('link', { name: /Profile/i });
    expect(profile.getAttribute('aria-current')).toBeNull();
  });
});
