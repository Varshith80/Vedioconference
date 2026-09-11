import { NextResponse } from 'next/server';

// =====================================================================
// /apple-touch-icon.png — 204 stub
//
// We do not ship a touch-icon. iOS Safari and Android Chrome
// probe /apple-touch-icon.png on first paint; the previous
// design let the request reach the next-intl middleware which
// 307-redirected it to /en/apple-touch-icon.png (a 404). The
// 404 was the user-visible "Failed to load resource" error in
// the F12 console.
//
// This route handler returns 204 No Content so the browser
// stops asking. The matcher in `middleware.ts` excludes
// `/apple-touch-icon.png` so the request reaches this route
// directly, without the locale-prefix 307 chain.
// =====================================================================
export function GET() {
  return new NextResponse(null, { status: 204 });
}
