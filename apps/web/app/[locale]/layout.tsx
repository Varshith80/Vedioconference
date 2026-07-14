import * as React from 'react';
import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif, IBM_Plex_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Toaster } from '@/components/ui/toaster';
import { BRAND } from '@/lib/constants/brand';
import { locales, defaultLocale, type Locale } from '@/i18n';
import { publicEnv } from '@/lib/env';
import '../../styles/globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const serif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

const heading = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-heading',
  display: 'swap',
});

const OG_LOCALE: Record<Locale, string> = {
  en: 'en_US',
  fr: 'fr_FR',
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = await getMessages({ locale });
  const tagline = (messages.Brand as { tagline: string }).tagline;
  const description = (messages.Brand as { shortDescription: string }).shortDescription;
  return {
    title: { default: `${BRAND.name} — ${tagline}`, template: `%s · ${BRAND.name}` },
    description,
    metadataBase: new URL(publicEnv().NEXT_PUBLIC_SITE_URL),
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale as Locale] ?? OG_LOCALE[defaultLocale],
      siteName: BRAND.name,
    },
    twitter: { card: 'summary_large_image' },
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(
          locales.map((l) => [l, `/${l}`]),
        ),
        'x-default': `/${defaultLocale}`,
      },
    },
  };
}

/**
 * Locale-prefixed root layout. Renders <html lang>, fonts, and the
 * NextIntlClientProvider. Every page under [locale] gets
 * `setRequestLocale` called from the layout below, so RSC pages
 * can call `getTranslations` without re-deriving the locale.
 */
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${sans.variable} ${serif.variable} ${mono.variable} ${heading.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={sans.className}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
