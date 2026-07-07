import { BRAND } from '@/lib/constants/marketing';

interface BrandMarkProps {
  /** Render the wordmark next to the icon. Default: true. */
  showWordmark?: boolean;
  /** Icon size in Tailwind classes. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'h-7 w-7', text: 'text-base' },
  md: { box: 'h-9 w-9', text: 'text-lg' },
  lg: { box: 'h-12 w-12', text: 'text-2xl' },
} as const;

/**
 * Brand mark used in the header, footer, dashboard sidebar, and
 * auth pages. The icon is inline SVG so it is cacheable, theme-
 * aware, and renders crisply at any DPI.
 */
export function BrandMark({ showWordmark = true, size = 'md', className }: BrandMarkProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-md bg-brand-gradient text-primary-foreground shadow-sm ${s.box}`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3/5 w-3/5"
        >
          <path d="M3 7.5C3 5.567 4.567 4 6.5 4h7A4.5 4.5 0 0 1 18 8.5v6A4.5 4.5 0 0 1 13.5 19h-7C4.567 19 3 17.433 3 15.5v-8Z" />
          <path d="m21 8-4 4 4 4" />
        </svg>
      </span>
      {showWordmark && (
        <span className={`font-heading font-semibold tracking-tight text-foreground ${s.text}`}>
          {BRAND.name}
        </span>
      )}
    </span>
  );
}
