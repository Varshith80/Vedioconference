import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrandMark } from './brand-mark';
import { BRAND } from '@/lib/constants/brand';

afterEach(cleanup);

describe('BrandMark', () => {
  it('renders the wordmark by default', () => {
    render(<BrandMark />);
    const root = screen.getByLabelText(BRAND.name);
    expect(root).toBeTruthy();
    expect(root.textContent).toBe(BRAND.wordmark);
  });

  it('renders only the monogram when showWordmark=false', () => {
    render(<BrandMark showWordmark={false} />);
    const root = screen.getByLabelText(BRAND.name);
    expect(root.textContent?.trim()).toBe('C');
  });

  it('applies the invert tone class on the inner wordmark span', () => {
    // The outer span carries the aria-label; the foreground colour class lives
    // on the inner wordmark span so it can be scoped per-variant.
    render(<BrandMark tone="invert" />);
    const root = screen.getByLabelText(BRAND.name);
    const inner = root.firstElementChild as HTMLElement | null;
    expect(inner).toBeTruthy();
    expect(inner!.className).toContain('text-primary-foreground');
  });
});
