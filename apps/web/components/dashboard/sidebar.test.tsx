import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { DashboardSidebar } from './sidebar';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/bookings',
}));

describe('DashboardSidebar', () => {
  it('marks the active link with aria-current="page"', () => {
    render(<DashboardSidebar />);
    const active = screen.getByRole('link', { name: /Mes réservations/i });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark inactive links', () => {
    render(<DashboardSidebar />);
    const profile = screen.getByRole('link', { name: /Profil/i });
    expect(profile.getAttribute('aria-current')).toBeNull();
  });
});
