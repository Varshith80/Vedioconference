import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { BRAND } from '@/lib/constants/brand';

interface BrandMarkProps {
  /** Render the wordmark next to the icon. Default: true. */
  showWordmark?: boolean;
  /** Icon size in Tailwind classes. */
  size?: 'sm' | 'md' | 'lg';
  /** Foreground tone. `invert` is for use on dark surfaces (Bleu Plan, dark mode). */
  tone?: 'default' | 'invert';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-7 w-7',  text: 'text-base',   glyph: 'text-xl'   },
  md: { box: 'h-9 w-9',  text: 'text-lg',     glyph: 'text-2xl'  },
  lg: { box: 'h-12 w-12', text: 'text-2xl',    glyph: 'text-4xl'  },
} as const;

const INTEGRAL_GLYPH = '∫'; // ∫

/**
 * Brand mark for the Intégrale platform. The wordmark replaces the
 * second "é" of "Intégrale" with the integral sign (`∫`). Per the
 * client brief, the `∫` is a *letter* — never a decorative icon —
 * so the glyph is rendered with the same Plex Serif weight as the
 * rest of the wordmark and inherits the foreground colour.
 *
 * Variants:
 *   - `default`: Bleu Plan glyph + graphite wordmark (light surfaces).
 *   - `invert`:  Vélin glyph + vélin wordmark (Bleu Plan / dark surfaces).
 */
export function BrandMark({
  showWordmark = true,
  size = 'md',
  tone = 'default',
  className,
}: BrandMarkProps) {
  const s = SIZES[size];
  const fg = tone === 'invert' ? 'text-primary-foreground' : 'text-foreground';

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      aria-label={BRAND.name}
    >
      {showWordmark ? (
        <span aria-hidden="true" className={cn('font-heading font-semibold tracking-tight', s.text, fg)}>
          Int<span className={cn('font-serif', s.glyph)}>{INTEGRAL_GLYPH}</span>grale
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center font-serif font-semibold',
            s.box, s.glyph, fg,
            'rounded-md',
          )}
        >
          {INTEGRAL_GLYPH}
        </span>
      )}
    </span>
  );
}
