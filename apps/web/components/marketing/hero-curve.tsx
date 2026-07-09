import * as React from 'react';
import { cn } from '@/lib/utils/cn';

interface HeroCurveProps {
  /** Optional className passthrough. */
  className?: string;
}

/**
 * Decorative SVG visual for the hero: a stylised integral curve
 * on a faint Bleu Plan grid, evoking the ∫ glyph and the
 * "mathématiques · du lycée à la licence" tagline. Server-rendered,
 * no client JS, no external assets — keeps LCP fast and avoids
 * CSP risk.
 */
export function HeroCurve({ className }: HeroCurveProps) {
  return (
    <svg
      viewBox="0 0 400 300"
      role="img"
      aria-label="Courbe intégrale stylisée"
      className={cn('h-auto w-full text-[color:var(--brand-primary)]', className)}
    >
      <defs>
        <pattern id="hero-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path
            d="M 20 0 L 0 0 0 20"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.08"
            strokeWidth="1"
          />
        </pattern>
        <linearGradient id="hero-curve" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#hero-grid)" />
      {/* Axes */}
      <line x1="40" y1="260" x2="380" y2="260" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <line x1="40" y1="40" x2="40" y2="260" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* Integral glyph, large, faint, anchored in the upper-left */}
      <text
        x="60"
        y="180"
        fontFamily="'IBM Plex Serif', Georgia, serif"
        fontSize="200"
        fontWeight="600"
        fill="currentColor"
        fillOpacity="0.12"
      >
        ∫
      </text>
      {/* Curve: a smooth S-curve from (40, 240) to (380, 60) */}
      <path
        d="M 40 240 C 140 240, 200 80, 380 60"
        fill="none"
        stroke="url(#hero-curve)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Highlight dot — Ambre Surligneur, the one allowed "≤1/screen" accent. */}
      <circle cx="380" cy="60" r="6" fill="#E8A33D" />
      <circle cx="380" cy="60" r="11" fill="none" stroke="#E8A33D" strokeOpacity="0.35" strokeWidth="2" />
    </svg>
  );
}
