import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression for the FORMATTING_ERROR that broke
 * /admin/bookings in Sprint 8.
 *
 * The English message source used to read
 *   "results": "{n} of {total} bookings"
 *
 * next-intl v3 validates ICU MessageFormat variables at
 * translation time. Because the message declared `{n}` and
 * `{total}` as context variables, the server-side call
 * `t('filters.results')` (which provides NO values, since
 * the actual interpolation happens client-side via
 * `.replace('{n}', n).replace('{total}', total)`) blew up
 * with
 *   FORMATTING_ERROR: The intl string context variable "n"
 *   was not provided to the string "{n} of {total} bookings"
 * and the page entered the global error boundary.
 *
 * The fix: wrap the curly braces in single quotes. Per the
 * next-intl docs, a single-quoted segment in ICU
 * MessageFormat is treated as a literal — so `'{n}'` survives
 * the translation untouched and the existing `.replace('{n}', …)`
 * call in the client component continues to work.
 *
 * These tests pin the invariant: the message source must
 * never reintroduce the raw `{n}` / `{total}` form.
 */

const MESSAGES_DIR = join(process.cwd(), 'messages');

type Messages = Record<string, unknown>;

function loadMessages(locale: 'en' | 'fr'): Messages {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8');
  return JSON.parse(raw) as Messages;
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const segment of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

describe('Admin.bookings.filters.results — ICU MessageFormat regression', () => {
  it('en.json: keeps the {n} placeholder (with single-quote escape)', () => {
    const messages = loadMessages('en');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(typeof value).toBe('string');
    // Must contain the literal "{n}" (not "{ n }", not "{N}").
    expect(value as string).toContain('{n}');
  });

  it('en.json: keeps the {total} placeholder (with single-quote escape)', () => {
    const messages = loadMessages('en');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(value as string).toContain('{total}');
  });

  it('en.json: does not contain a raw, unescaped {n} (no FORMATTING_ERROR)', () => {
    // The trigger for FORMATTING_ERROR was a raw `{n}` token
    // that next-intl's ICU parser interpreted as a missing
    // context variable. After the single-quote escape, the
    // token is still present in the rendered string but the
    // parser no longer sees it as a variable. We verify the
    // escape by stripping ALL single-quoted segments and
    // asserting that no bare `{n}` / `{total}` tokens remain
    // in the post-strip string.
    const messages = loadMessages('en');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(typeof value).toBe('string');
    // ICU MessageFormat literal-escape: a single-quoted
    // segment is treated as a literal. We strip all of them
    // to get the "variable surface" of the message.
    const stripped = (value as string).replace(/'[^']*'/g, '');
    expect(stripped).not.toMatch(/\{n\}/);
    expect(stripped).not.toMatch(/\{total\}/);
  });

  it('fr.json: keeps the {n} / {total} placeholders (with single-quote escape)', () => {
    const messages = loadMessages('fr');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(typeof value).toBe('string');
    expect(value as string).toContain('{n}');
    expect(value as string).toContain('{total}');
    const stripped = (value as string).replace(/'[^']*'/g, '');
    expect(stripped).not.toMatch(/\{n\}/);
    expect(stripped).not.toMatch(/\{total\}/);
  });

  it('en.json: the message contains "bookings" (sanity: not accidentally empty)', () => {
    const messages = loadMessages('en');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(value as string).toMatch(/bookings/i);
  });

  it('fr.json: the message contains "réservations" (sanity: not accidentally empty)', () => {
    const messages = loadMessages('fr');
    const value = dig(messages, ['Admin', 'bookings', 'filters', 'results']);
    expect(value as string).toMatch(/réservations/i);
  });
});
