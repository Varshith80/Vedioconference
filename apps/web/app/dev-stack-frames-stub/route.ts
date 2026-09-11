import { NextResponse } from 'next/server';

// =====================================================================
// dev-stack-frames-stub
//
// Next.js 15.0.x's dev error overlay polls two stack-frame endpoints
// on every error:
//   1. `/__nextjs_original-stack-frames?file=…&lineNumber=…` (plural)
//   2. `/__nextjs_original-stack-frame?file=…&lineNumber=…`  (singular —
//      added in 15.0.0)
//
// The dev server returns 404 for both because dev source maps are not
// emitted alongside the bundle (production has them, dev does not).
// When the underlying error is a `redirect()` thrown from a Server
// Component (admin → /admin role-guard, anonymous → login guard, …),
// React 19 logs the redirect to `console.error` *and* the dev overlay
// re-fetches the same frame on every error — producing a chain of
// 404s in the dev Network tab.
//
// `next.config.mjs` rewrites BOTH public dev-overlay paths to this
// route, which returns 204 No Content. The dev overlay treats 204 as
// "no remap available" and falls back to the post-transform JS stack
// — the same stack the user would see in production. No 404s, no
// spurious network noise.
//
// Why a rewrite and not a route file at the original path: App Router
// folders starting with `_` are private and excluded from routing, so
// `app/__nextjs_original-stack-frames/route.ts` would never be
// reached. The rewrite re-exposes the public path to a normal route.
//
// This route is dev-only; production never serves the dev overlay.
// =====================================================================

// 204 No Content is the right answer: the overlay expects either
// original frames (200) or "no remap" (any other status). 204 is
// the conventional "no body" success and is the lowest-overhead
// status the dev overlay polls for. Both GET and POST are handled
// so the overlay's polling method never returns 404.
export function GET(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
export function POST(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
