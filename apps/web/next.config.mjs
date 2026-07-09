import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
  async headers() {
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
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
