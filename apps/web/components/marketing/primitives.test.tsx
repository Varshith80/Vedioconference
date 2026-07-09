import * as React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SectionEyebrow } from './section-eyebrow';
import { LevelChip } from './level-chip';
import { Stat } from './stat';
import { MethodStep } from './method-step';
import { LivePill } from './live-pill';
import { HeroCurve } from './hero-curve';

afterEach(cleanup);

describe('SectionEyebrow', () => {
  it('renders the number and the uppercase label', () => {
    render(<SectionEyebrow number="01" label="Parcours" />);
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('Parcours')).toBeTruthy();
  });

  it('renders without a number when not provided', () => {
    render(<SectionEyebrow label="Méthode" />);
    expect(screen.getByText('Méthode')).toBeTruthy();
    expect(screen.queryByText('01')).toBeNull();
  });
});

describe('LevelChip', () => {
  it('renders the label in uppercase mono', () => {
    render(<LevelChip label="Lycée" />);
    const chip = screen.getByText('Lycée');
    expect(chip).toBeTruthy();
    expect(chip.className).toContain('font-mono');
    expect(chip.className).toContain('uppercase');
  });
});

describe('Stat', () => {
  it('renders the value and the label', () => {
    render(<Stat value="3 400+" label="Exercices corrigés" />);
    expect(screen.getByText('3 400+')).toBeTruthy();
    expect(screen.getByText('Exercices corrigés')).toBeTruthy();
  });

  it('uses invert foreground on dark surfaces', () => {
    render(<Stat value="100%" label="Cours en direct" tone="invert" />);
    const value = screen.getByText('100%');
    expect(value.className).toContain('text-primary-foreground');
  });
});

describe('MethodStep', () => {
  it('renders the number, title, and body', () => {
    render(
      <MethodStep
        n="01"
        title="Cours en visio"
        body="Séances de 45 à 60 minutes."
      />,
    );
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('Cours en visio')).toBeTruthy();
    expect(screen.getByText('Séances de 45 à 60 minutes.')).toBeTruthy();
  });
});

describe('LivePill', () => {
  it('renders the default "Cours en direct" label', () => {
    render(<LivePill />);
    expect(screen.getByText('Cours en direct')).toBeTruthy();
  });

  it('renders a custom label', () => {
    render(<LivePill label="En direct" />);
    expect(screen.getByText('En direct')).toBeTruthy();
  });
});

describe('HeroCurve', () => {
  it('renders the decorative SVG with an accessible label', () => {
    render(<HeroCurve />);
    expect(screen.getByRole('img', { name: /courbe intégrale/i })).toBeTruthy();
  });
});
