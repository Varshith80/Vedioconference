/**
 * Pass-through root layout. The real `<html>` element lives in
 * `app/[locale]/layout.tsx` because next-intl's `localePrefix: 'always'`
 * means every page that renders HTML is under a locale segment. Next.js
 * requires a root layout file at `app/layout.tsx`; this file satisfies
 * that requirement while letting the locale layout own the document.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
