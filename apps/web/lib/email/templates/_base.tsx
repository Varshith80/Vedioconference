import 'server-only';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAND, BRAND_COLORS } from '@/lib/constants/brand';

/**
 * `lib/email/templates/` — the 6 transactional email templates
 * for Sprint C (Phase 3).
 *
 * Why server-rendered JSX (and not `@react-email/components`)
 * -----------------------------------------------------------
 * Adding a new npm dep needs an explicit ADR (CLAUDE.md §2.4).
 * The React Email components are thin wrappers around
 * `react-dom/server` + a few safe-by-default inline styles. We
 * re-implement the styles inline ourselves; the templates stay
 * small (one file per template) and the dep surface stays flat.
 *
 * Contract for every template
 * ---------------------------
 *   - A function `renderXxxEmail(locale, props): Promise<{
 *       subject, html, text
 *     }>`.
 *   - Subject + visible strings come from `messages/<locale>.json`
 *     via the B1-i18n factory pattern. Switching language is
 *     a content operation, not a code change.
 *   - HTML uses the project's `BRAND_COLORS` palette and a
 *     system-font stack so the email reads correctly in every
 *     client (Gmail, Outlook, Apple Mail).
 *   - Plain text is generated from the same JSX by extracting
 *     the visible strings — kept simple (no parser dep).
 */

export type EmailLocale = 'en' | 'fr';

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Wrap a body block in a presentational `<table>` shell. */
export function shell(children: React.ReactNode, title: string): string {
  return renderToStaticMarkup(
    <html lang="en">
      {/* The <head>/<meta> below renders the email's subject
          in the inbox preview. next/head is for Next.js pages,
          not for raw HTML emails. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta charSet="utf-8" />
        <title>{title}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: BRAND_COLORS.velin,
          fontFamily: FONT_STACK,
          color: BRAND_COLORS.graphite,
        }}
      >
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          width="100%"
          style={{ backgroundColor: BRAND_COLORS.velin, padding: '24px 0' }}
        >
          <tbody>
            <tr>
              <td align="center">
                <table
                  role="presentation"
                  cellPadding={0}
                  cellSpacing={0}
                  width={560}
                  style={{
                    backgroundColor: BRAND_COLORS.blancCarte,
                    border: `1px solid ${BRAND_COLORS.velin}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  <tbody>
                    <tr>
                      <td
                        style={{
                          backgroundColor: BRAND_COLORS.bleuPlan,
                          color: BRAND_COLORS.blancCarte,
                          padding: '20px 24px',
                          fontFamily: FONT_STACK,
                          fontSize: 18,
                          fontWeight: 600,
                        }}
                      >
                        {BRAND.name}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '24px', fontFamily: FONT_STACK, fontSize: 15, lineHeight: 1.55 }}>
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td
                        style={{
                          padding: '16px 24px',
                          borderTop: `1px solid ${BRAND_COLORS.velin}`,
                          color: BRAND_COLORS.graphite,
                          fontSize: 12,
                          fontFamily: FONT_STACK,
                        }}
                      >
                        © {BRAND.copyrightYear} {BRAND.legalName} · {BRAND.contactEmail}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>,
  );
}

/** Convert a JSX tree to plain text by walking it. Crude but
 *  predictable — no third-party HTML→text dep. */
export function jsxToPlainText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(jsxToPlainText).join('');
  if (React.isValidElement(node)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    const inner = jsxToPlainText((el.props as { children?: React.ReactNode }).children);
    // No block-level newlines for inline tags; the wrapping
    // shell uses <p>/<h1>/<h2> with explicit newlines via
    // `\n` in their `children` text.
    return inner;
  }
  return '';
}

export interface RenderedEmail {
  subject: string;
  html:     string;
  text:     string;
}
