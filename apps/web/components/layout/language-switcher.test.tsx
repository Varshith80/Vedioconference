import * as React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { LanguageSwitcher } from './language-switcher';
import en from '@/messages/en.json';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/levels',
  useRouter: () => ({ push, refresh }),
}));

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <LanguageSwitcher />
    </NextIntlClientProvider>,
  );
}

describe('LanguageSwitcher', () => {
  it('renders one button per supported locale', () => {
    renderWithIntl();
    expect(screen.getByRole('group', { name: /Language/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /English/i })).not.toBeNull();
    expect(screen.getByRole('button', { name: /French/i })).not.toBeNull();
  });

  it('marks the active locale with aria-current', () => {
    renderWithIntl();
    const en = screen.getByRole('button', { name: /English/i });
    expect(en.getAttribute('aria-current')).toBe('true');
  });

  it('navigates to the equivalent path on the other locale', () => {
    renderWithIntl();
    const fr = screen.getByRole('button', { name: /French/i });
    fireEvent.click(fr);
    expect(push).toHaveBeenCalledWith('/fr/levels');
    expect(refresh).toHaveBeenCalled();
  });
});
