import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SiteFooter } from './site-footer';
import { BRAND } from '@/lib/constants/brand';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';

afterEach(cleanup);

const EN_LINKS = en.Nav.footer;
const FR_LINKS = fr.Nav.footer;

describe('SiteFooter', () => {
  it('renders every English footer link from the active locale', () => {
    render(<SiteFooter links={EN_LINKS} />);
    for (const link of EN_LINKS) {
      const anchor = screen.getByRole('link', { name: link.label });
      expect(anchor.getAttribute('href')).toBe(link.href);
    }
  });

  it('renders the French footer link labels when the French locale is active', () => {
    render(<SiteFooter links={FR_LINKS} />);
    for (const link of FR_LINKS) {
      const anchor = screen.getByRole('link', { name: link.label });
      expect(anchor.getAttribute('href')).toBe(link.href);
    }
  });

  it('renders the copyright line with the brand name and year', () => {
    render(<SiteFooter links={EN_LINKS} />);
    const copyright = screen.getByText(`© ${BRAND.copyrightYear} ${BRAND.name}`);
    expect(copyright).toBeTruthy();
  });

  it('uses a <footer> landmark', () => {
    render(<SiteFooter links={EN_LINKS} />);
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
