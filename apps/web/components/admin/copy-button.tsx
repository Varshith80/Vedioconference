'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';

interface CopyButtonProps {
  /** The value to write to the clipboard. */
  value: string;
  /** Visible label. */
  label: string;
  /** Optional override className for the button. */
  className?: string;
  /** ARIA label override (defaults to `${label} (copy)`). */
  ariaLabel?: string;
}

// Tiny client island. Renders as a compact icon button next to
// the value it copies. Uses navigator.clipboard.writeText; if
// the browser blocks it (no https, denied permission), the
// fallback is a transient error message in the button itself.
export function CopyButton({ value, label, className, ariaLabel }: CopyButtonProps) {
  const t = useTranslations('Admin.bookingDetail');
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState(false);

  async function onCopy() {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError(false);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(true);
      setCopied(false);
      window.setTimeout(() => setError(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={ariaLabel ?? `${label} (copy)`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium text-foreground transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        copied && 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300',
        error && 'border-rose-300 text-rose-700 dark:border-rose-700 dark:text-rose-300',
        className,
      )}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" aria-hidden={true} />
          <span>{t('copied')}</span>
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" aria-hidden={true} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
