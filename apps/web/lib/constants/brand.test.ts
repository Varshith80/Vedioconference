import { describe, it, expect } from 'vitest';
import {
  BRAND,
  BRAND_COLORS,
  BRAND_FONTS,
  FOOTER_LINKS,
  KEY_FIGURES,
  LEARNING_PATHS,
  METHOD_STEPS,
  PRIMARY_NAV,
} from './brand';

describe('brand constants', () => {
  it('BRAND has the client-mandated name and wordmark', () => {
    expect(BRAND.name).toBe('Intégrale');
    expect(BRAND.wordmark).toBe('Intégrale');
  });

  it('BRAND.tagline matches the cover line of the client brief', () => {
    expect(BRAND.tagline).toBe(
      'Mathématiques · Physique-Chimie — du lycée à la licence',
    );
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

  it('PRIMARY_NAV matches the user-stated page list', () => {
    const hrefs = PRIMARY_NAV.map((n) => n.href);
    expect(hrefs).toEqual(['/levels', '/tutors', '/pricing', '/about', '/contact']);
  });

  it('FOOTER_LINKS is the flat single-line set from the brief', () => {
    const labels = FOOTER_LINKS.map((l) => l.label);
    expect(labels).toEqual(['Niveaux', 'Tarifs', 'Contact', 'Mentions légales']);
  });

  it('LEARNING_PATHS has exactly four paths in the right order', () => {
    expect(LEARNING_PATHS).toHaveLength(4);
    expect(LEARNING_PATHS.map((p) => p.id)).toEqual(['lycee', 'prepa', 'bts', 'licence']);
    expect(LEARNING_PATHS[0].level).toBe('Lycée');
    expect(LEARNING_PATHS[1].level).toBe('Prépa');
    expect(LEARNING_PATHS[2].level).toBe('BTS');
    expect(LEARNING_PATHS[3].level).toBe('Licence');
  });

  it('METHOD_STEPS has exactly three numbered bricks', () => {
    expect(METHOD_STEPS).toHaveLength(3);
    expect(METHOD_STEPS.map((s) => s.n)).toEqual(['01', '02', '03']);
  });

  it('KEY_FIGURES has exactly three stats', () => {
    expect(KEY_FIGURES).toHaveLength(3);
    expect(KEY_FIGURES[0].value).toBe('3 400+');
    expect(KEY_FIGURES[1].value).toBe('100%');
    expect(KEY_FIGURES[2].value).toBe('4');
  });

  it('BRAND.copyrightYear is 2026 (matches the footer in the brief)', () => {
    expect(BRAND.copyrightYear).toBe(2026);
  });
});
