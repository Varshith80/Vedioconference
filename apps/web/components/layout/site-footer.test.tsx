import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SiteFooter } from './site-footer';
import { BRAND, FOOTER_LINKS } from '@/lib/constants/brand';

afterEach(cleanup);

describe('SiteFooter', () => {
  it('renders every footer link from the brand constant', () => {
    render(<SiteFooter />);
    for (const link of FOOTER_LINKS) {
      const anchor = screen.getByRole('link', { name: link.label });
      expect(anchor.getAttribute('href')).toBe(link.href);
    }
  });

  it('renders the copyright line with the brand name and year', () => {
    render(<SiteFooter />);
    const copyright = screen.getByText(`© ${BRAND.copyrightYear} ${BRAND.name}`);
    expect(copyright).toBeTruthy();
  });

  it('uses a <footer> landmark', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeTruthy();
  });
});
