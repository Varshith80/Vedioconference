import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/constants/brand';
import { MESSAGES, tForLocale } from '@/lib/i18n/server';
import { defaultLocale, type Locale } from '@/i18n';
import { brandFromMessages } from '@/lib/i18n/brand';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Open Graph image rendered at build time, per locale.
 *
 * The file lives under `app/[locale]/`, so Next.js will produce
 * `/en/opengraph-image` and `/fr/opengraph-image` automatically.
 * The edge runtime cannot use next-intl's React providers, so we
 * import the raw messages and pick the active locale from the
 * `params.locale` route parameter (with English as the fallback).
 */
export async function generateImageMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const locale: Locale = (params.locale as Locale) ?? defaultLocale;
  const brand = brandFromMessages(MESSAGES[locale]);
  return [
    {
      id: locale,
      alt: `${BRAND.name} — ${brand.tagline}`,
      contentType,
    },
  ];
}

export default async function OpengraphImage({ id }: { id: string }) {
  const locale: Locale = (id as Locale) ?? defaultLocale;
  const brand = brandFromMessages(MESSAGES[locale]);
  const t = tForLocale(locale);
  const headline = t('Homepage.headline');
  const socialProof = t('Homepage.socialProof');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          backgroundImage:
            'linear-gradient(135deg, #142B4D 0%, #0D1F38 100%)',
          color: '#EDF0EA',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 14,
              background: '#EDF0EA',
              color: '#142B4D',
              fontSize: 40,
              fontWeight: 700,
              fontFamily: 'Georgia, serif',
            }}
          >
            ∫
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 0, fontSize: 30, fontWeight: 600 }}>
            <span>Int</span>
            <span style={{ fontSize: 36, fontWeight: 700 }}>∫</span>
            <span>grale</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            {headline}
          </div>
          <div style={{ fontSize: 28, opacity: 0.85 }}>
            {brand.tagline}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span
              style={{
                display: 'inline-block',
                width: 12,
                height: 12,
                borderRadius: 6,
                background: '#E8A33D',
              }}
            />
            <span style={{ fontSize: 22, opacity: 0.85 }}>
              {socialProof}
            </span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
