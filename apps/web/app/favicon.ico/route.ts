import { NextResponse } from 'next/server';

// =====================================================================
// /favicon.ico — 204 stub
//
// We do not ship an .ico favicon. We ship `favicon.svg` (linked
// from the root layout) which the browser uses. Browsers still
// probe `/favicon.ico` on first paint, and the next-intl
// middleware (when it sees the path) 307-redirects to
// `/en/favicon.ico` (a 404).
//
// The matcher in `middleware.ts` excludes `/favicon.ico` so the
// request never reaches the middleware. This route handler
// returns 204 No Content so the browser stops asking.
//
// Historical note: a prior attempt placed this file at
// `app/favicon.ico/route.ts` and 500'd in an older Next version
// because the `favicon.ico` directory was reserved for the
// metadata-file convention. In Next 15.0.0 this path is valid
// (the App Router does not treat `favicon.ico` as a reserved
// segment when the file is a route handler, only when it's
// `favicon.ico.{ico,jpg,jpeg,png,svg}`).
// =====================================================================
export function GET() {
  return new NextResponse(null, { status: 204 });
}
