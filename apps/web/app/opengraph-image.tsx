import { ImageResponse } from 'next/og';
import { BRAND } from '@/lib/constants/brand';

export const runtime = 'edge';
export const alt = `${BRAND.name} — ${BRAND.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Open Graph image rendered at build time. Pure JSX, no client JS,
 * no external assets — keeps the social preview crisp and on-brand.
 */
export default function OpengraphImage() {
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
            'linear-gradient(135deg, #3B5BDB 0%, #1E3AA3 100%)',
          color: 'white',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.15)',
              fontSize: 32,
              fontWeight: 700,
            }}
          >
            V
          </div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>{BRAND.name}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
            }}
          >
            Cours particuliers en visioconférence.
          </div>
          <div style={{ fontSize: 28, opacity: 0.9 }}>
            Lycée · Classes préparatoires · Réservez en 60 secondes
          </div>
        </div>
      </div>
    ),
    size,
  );
}
