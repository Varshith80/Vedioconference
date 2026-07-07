import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  /** Vertical rhythm. `default` is balanced for marketing; `tight` is for dense UI. */
  spacing?: 'default' | 'tight' | 'loose' | 'none';
  /** Optional section background. `mesh` paints a subtle brand gradient. */
  tone?: 'default' | 'muted' | 'brand' | 'mesh';
  /** Render as a `<section>` (default) or another tag. */
  as?: keyof React.JSX.IntrinsicElements;
}

const SPACING: Record<NonNullable<SectionProps['spacing']>, string> = {
  none: 'py-0',
  tight: 'py-10 sm:py-12',
  default: 'py-12 sm:py-16 md:py-20 lg:py-24',
  loose: 'py-16 sm:py-20 md:py-28 lg:py-32',
};

const TONE: Record<NonNullable<SectionProps['tone']>, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted/40 text-foreground',
  brand: 'bg-brand-gradient text-primary-foreground',
  mesh: 'bg-mesh-gradient text-foreground',
};

/**
 * Page-level vertical section. Owns spacing + background tones used
 * across the marketing site so individual pages stay declarative.
 */
export function Section({
  className,
  spacing = 'default',
  tone = 'default',
  as: Tag = 'section',
  ...props
}: SectionProps) {
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      className={cn('w-full', SPACING[spacing], TONE[tone], className)}
      {...props}
    />
  );
}
