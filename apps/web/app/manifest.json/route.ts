import { NextResponse } from 'next/server';

// =====================================================================
// /manifest.json — 204 stub
//
// We do not ship a PWA web app manifest. Browsers and crawlers
// probe /manifest.json on first paint; the previous design let
// the request reach the next-intl middleware which 307-redirected
// it to /en/manifest.json (a 404). The 404 was the user-visible
// "Failed to load resource" error in the F12 console.
//
// This route handler returns 204 No Content so the browser stops
// asking. The matcher in `middleware.ts` excludes `/manifest.json`
// so the request reaches this route directly, without the
// locale-prefix 307 chain.
// =====================================================================
export function GET() {
  return new NextResponse(null, { status: 204 });
}
