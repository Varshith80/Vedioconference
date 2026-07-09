import { describe, it, expect } from 'vitest';
import {
  BRAND,
  BRAND_COLORS,
  BRAND_FONTS,
} from './brand';

describe('brand constants (structural only)', () => {
  it('BRAND has the client-mandated name and wordmark', () => {
    expect(BRAND.name).toBe('Intégrale');
    expect(BRAND.wordmark).toBe('Intégrale');
  });

  it('BRAND exposes no localised fields (tagline / shortDescription live in messages/)', () => {
    expect('tagline' in BRAND).toBe(false);
    expect('shortDescription' in BRAND).toBe(false);
  });

  it('BRAND has the legal entity, contact email, and address', () => {
    expect(BRAND.legalName).toBe('Intégrale SAS');
    expect(BRAND.contactEmail).toBe('contact@integrale.fr');
    expect(BRAND.supportEmail).toBe('support@integrale.fr');
    expect(BRAND.addressLocality).toBe('Paris');
    expect(BRAND.addressCountry).toBe('FR');
  });

  it('BRAND_COLORS hex values match the charte graphique', () => {
    expect(BRAND_COLORS.bleuPlan).toBe('#142B4D');
    expect(BRAND_COLORS.velin).toBe('#EDF0EA');
    expect(BRAND_COLORS.vertReactif).toBe('#1F7A6C');
    expect(BRAND_COLORS.ambreSurligneur).toBe('#E8A33D');
    expect(BRAND_COLORS.graphite).toBe('#2B2E33');
    expect(BRAND_COLORS.blancCarte).toBe('#FFFFFF');
  });

  it('BRAND_FONTS are the IBM Plex family', () => {
    expect(BRAND_FONTS.serif).toBe('IBM Plex Serif');
    expect(BRAND_FONTS.sans).toBe('IBM Plex Sans');
    expect(BRAND_FONTS.mono).toBe('IBM Plex Mono');
  });

  it('BRAND.copyrightYear is 2026 (matches the footer in the brief)', () => {
    expect(BRAND.copyrightYear).toBe(2026);
  });

  it('LearningPathId is the four-path union', () => {
    // Type-level; this just confirms the runtime never sees a fifth id.
    const ids: ReadonlyArray<string> = ['lycee', 'prepa', 'bts', 'licence'];
    expect(ids).toHaveLength(4);
  });
});
