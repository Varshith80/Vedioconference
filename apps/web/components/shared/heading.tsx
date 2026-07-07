import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const headingVariants = cva('font-heading tracking-tight text-balance', {
  variants: {
    level: {
      h1: 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold',
      h2: 'text-2xl sm:text-3xl md:text-4xl font-bold',
      h3: 'text-xl sm:text-2xl md:text-3xl font-semibold',
      h4: 'text-lg sm:text-xl font-semibold',
      h5: 'text-base sm:text-lg font-semibold',
      h6: 'text-sm sm:text-base font-semibold uppercase tracking-wider text-muted-foreground',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      brand: 'text-primary',
      invert: 'text-primary-foreground',
    },
  },
  defaultVariants: { level: 'h2', tone: 'default' },
});

type Level = NonNullable<VariantProps<typeof headingVariants>['level']>;

export interface HeadingProps {
  level?: Level;
  tone?: VariantProps<typeof headingVariants>['tone'];
  className?: string;
  id?: string;
  children: React.ReactNode;
}

/**
 * Polymorphic heading. Renders the right tag for the chosen
 * `level`. We keep the API minimal (no spread of arbitrary
 * `HTMLAttributes`) so the runtime tag matches the TS type and
 * the component never accidentally widens to SVG props.
 */
export function Heading({ level = 'h2', tone, className, id, children }: HeadingProps) {
  const classes = cn(headingVariants({ level, tone }), className);
  switch (level) {
    case 'h1':
      return <h1 id={id} className={classes}>{children}</h1>;
    case 'h2':
      return <h2 id={id} className={classes}>{children}</h2>;
    case 'h3':
      return <h3 id={id} className={classes}>{children}</h3>;
    case 'h4':
      return <h4 id={id} className={classes}>{children}</h4>;
    case 'h5':
      return <h5 id={id} className={classes}>{children}</h5>;
    case 'h6':
      return <h6 id={id} className={classes}>{children}</h6>;
  }
}
