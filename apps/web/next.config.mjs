import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Next.js 15.0.x dev error overlay polls
  // `__nextjs_original-stack-frames?file=…` for every error and the
  // dev server returns 404 because dev source maps are not
  // emitted alongside the bundle. This produces a continuous stream
  // of harmless 404s in the dev Network tab. The fix is to add a
  // 204 handler for that path; see `app/__nextjs_original-stack-frames/route.ts`.
  // We intentionally do NOT change the webpack devtool here:
  // Next.js 15 reverts any `devtool: false` and warns about
  // "severe performance regressions", so the only safe intercept
  // is a 204 stub at the route level.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.calendly.com' },
    ],
  },
  // Suppress the Next.js 15.0.x dev-overlay 404 spam.
  //
  // The error overlay polls two stack-frame endpoints on every
  // error: `/__nextjs_original-stack-frames` (plural — the
  // bundle-side lookup) and `/__nextjs_original-stack-frame`
  // (singular — a newer dev-overlay endpoint added in 15.0.0).
  // The dev server returns 404 for both because dev source maps
  // are not emitted alongside the bundle (production has them,
  // dev does not). The result is a stream of 404s in the dev
  // Network tab — and when the error is a `redirect()` from a
  // Server Component the overlay polls repeatedly for the same
  // frame, generating a chain of 404s in F12.
  //
  // Next.js 15 reverts any `devtool: false` in the webpack config
  // (it warns "severe performance regressions"), so the only
  // safe intercept is a route-level 204 stub. App Router folders
  // starting with `_` are private and excluded from routing, so
  // the rewrites below map both public dev-overlay paths to a
  // real route handler at `/dev-stack-frames-stub`.
  async rewrites() {
    return [
      {
        source: '/__nextjs_original-stack-frames',
        destination: '/dev-stack-frames-stub',
      },
      {
        // Singular — the 15.0.0 dev-overlay polling endpoint.
        // Without this, every `redirect()` from a Server
        // Component (admin → /admin role-guard, anonymous → login
        // guard, etc.) floods F12 with 404s because the overlay
        // re-fetches the same frame on every error.
        source: '/__nextjs_original-stack-frame',
        destination: '/dev-stack-frames-stub',
      },
    ];
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      // object-src must be set explicitly. Without it, browser
      // falls back to `default-src 'self'`, which blocks any
      // <object>/<embed>/<applet> from loading a data: URI
      // (e.g. inline SVGs embedded as plugin data). We allow
      // same-origin plugin content but not data: URIs — those
      // should always be loaded as <img> (covered by img-src
      // above, which includes data:).
      "object-src 'self'",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co",
      isProd
        ? "script-src 'self' 'unsafe-inline' https://js.stripe.com https://assets.calendly.com"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://assets.calendly.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.resend.com",
      "frame-src https://js.stripe.com https://calendly.com https://*.zoom.us",
      "media-src 'self' blob: https://*.zoom.us",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',          value: 'DENY' },
          { key: 'X-Content-Type-Options',   value: 'nosniff' },
          { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',       value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security',value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy',  value: csp },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
