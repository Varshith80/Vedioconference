'use client';

import * as React from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// =====================================================================
// Sprint 3.8 — `SearchableSelect` atom (Admin Manual CRUD plan §8).
//
// A lightweight, accessible searchable dropdown. Built from the
// existing `Input` + `Button` atoms (no Radix Popover primitive),
// so the design system stays consistent.
//
// Behaviour:
//   - Type to filter the options by `label` (case-insensitive).
//   - Down/Up arrows move the highlight; Enter selects; Escape
//     closes the panel; outside-click also closes.
//   - `nullable` is implied by the `value: string | null` API —
//     a null value renders the `placeholder`. To support a
//     "clear" button, pass `clearable`.
//   - The component is uncontrolled-friendly: pass `value` and
//     `onChange` and the parent owns the state. The internal
//     `query` and `open` state are local.
// =====================================================================

export interface SearchableSelectOption {
  /** Stable key; used for React keys and equality. */
  value: string;
  /** Human-readable label shown in the input and in the panel. */
  label: string;
  /** Optional secondary line shown muted in the panel. */
  hint?: string;
}

export interface SearchableSelectProps {
  options: ReadonlyArray<SearchableSelectOption>;
  /** Selected value, or `null` for the placeholder / "unassigned". */
  value: string | null;
  onChange: (next: string | null) => void;
  /** Shown when `value` is null. */
  placeholder?: string;
  /** Shown when the filter returns zero matches. */
  emptyMessage?: string;
  /** Disabled state. */
  disabled?: boolean;
  /** Show a small "clear" button when a value is selected. */
  clearable?: boolean;
  /** a11y label. */
  'aria-label'?: string;
  className?: string;
  /** Optional id for the input (lets a `<Label htmlFor>` target it). */
  id?: string;
  /** Optional test id. */
  'data-testid'?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyMessage = 'No matches',
  disabled = false,
  clearable = false,
  className,
  id,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
}: SearchableSelectProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listboxId = React.useId();

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Filter (case-insensitive substring on label + hint).
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  // Keep the highlight in range when the filter changes.
  React.useEffect(() => {
    setHighlight((h) => Math.min(Math.max(0, h), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  const selectedOption = React.useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  function commit(next: string): void {
    onChange(next);
    setOpen(false);
    setQuery('');
  }

  function clear(): void {
    onChange(null);
    setQuery('');
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => (filtered.length === 0 ? 0 : (h - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[highlight];
      if (pick) commit(pick.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open) {
        setOpen(false);
        setQuery('');
      } else {
        clear();
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn('relative w-full', className)}
      data-testid={dataTestId}
    >
      <div className="relative">
        <Input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          aria-activedescendant={open && filtered[highlight] ? `${listboxId}-opt-${filtered[highlight].value}` : undefined}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          // When the panel is open, the input drives the filter.
          // When closed, show the selected label.
          value={open ? query : selectedOption?.label ?? ''}
          placeholder={placeholder}
          onFocus={() => {
            if (!disabled) {
              setOpen(true);
              setQuery('');
            }
          }}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQuery(e.target.value);
          }}
          onKeyDown={onKeyDown}
          className="pr-16"
        />
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
          {clearable && value !== null && !disabled ? (
            <button
              type="button"
              aria-label="Clear"
              className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={clear}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="pointer-events-auto h-6 w-6"
            aria-label={open ? 'Close suggestions' : 'Open suggestions'}
            tabIndex={-1}
            onClick={() => {
              if (disabled) return;
              setOpen((o) => !o);
              setQuery('');
            }}
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>
        </div>
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-card text-card-foreground shadow-md"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
          ) : (
            <ul role="presentation" className="py-1">
              {filtered.map((o, i) => {
                const isSelected = o.value === value;
                const isHighlight = i === highlight;
                return (
                  <li
                    key={o.value}
                    id={`${listboxId}-opt-${o.value}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      // mousedown so the input does not lose focus
                      // before commit() runs.
                      e.preventDefault();
                      commit(o.value);
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col px-3 py-1.5 text-sm',
                      isHighlight && 'bg-accent text-accent-foreground',
                      isSelected && !isHighlight && 'bg-muted/60',
                    )}
                  >
                    <span className="font-medium">{o.label}</span>
                    {o.hint ? (
                      <span className="text-xs text-muted-foreground">{o.hint}</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

SearchableSelect.displayName = 'SearchableSelect';
