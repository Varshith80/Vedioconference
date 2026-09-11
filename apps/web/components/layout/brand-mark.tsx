import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { BRAND } from '@/lib/constants/brand';

interface BrandMarkProps {
  /** Render the wordmark next to the icon. Default: true. */
  showWordmark?: boolean;
  /** Icon size in Tailwind classes. */
  size?: 'sm' | 'md' | 'lg';
  /** Foreground tone. `invert` is for use on dark surfaces. */
  tone?: 'default' | 'invert';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-7 w-7',   text: 'text-base',  glyph: 'text-xl'  },
  md: { box: 'h-9 w-9',   text: 'text-lg',    glyph: 'text-2xl' },
  lg: { box: 'h-12 w-12', text: 'text-2xl',   glyph: 'text-4xl' },
} as const;

/**
 * Brand mark for the CoursEnLigne platform.
 *
 * Per the editorial spec
 * (`CoursEnLigne-Editorial-Structure_160826-EN.docx`), the wordmark
 * is the literal string "CoursEnLigne" rendered in Plex Serif.
 * The optional square icon (when `showWordmark` is false) is a
 * plain monogram tile holding the first letter "C" — there is no
 * decorative integral glyph in the new wordmark.
 *
 * Variants:
 *   - `default`: graphite wordmark (light surfaces).
 *   - `invert`:  primary-foreground wordmark (dark surfaces).
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
          {BRAND.wordmark}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center font-serif font-semibold',
            s.box, s.glyph, fg,
            'rounded-md bg-primary/10',
          )}
        >
          C
        </span>
      )}
    </span>
  );
}
