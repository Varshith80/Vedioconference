/**
 * Static pricing tiers for Phase 2. The source of truth is the DB
 * (`courses.price_cents`) in Phase 3 once the catalog is editable.
 * Three plans: à la carte, 5-pack, mentorat continu.
 */
export interface PricingTier {
  id: 'payg' | 'pack5' | 'mentor';
  name: string;
  description: string;
  /** Integer cents. */
  priceCents: number;
  currency: 'EUR';
  billing: 'par séance' | 'par pack' | 'par mois';
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}

export const PRICING_TIERS: ReadonlyArray<PricingTier> = [
  {
    id: 'payg',
    name: 'À la carte',
    description: 'Pour un besoin ponctuel (DM, bac blanc, contrôle).',
    priceCents: 4500,
    currency: 'EUR',
    billing: 'par séance',
    features: [
      '1 séance de 60 minutes',
      'Annulation jusqu’à 1h avant',
      'Reçu et facture par e-mail',
      'Accès aux notes de cours',
    ],
    cta: { label: 'Commencer', href: '/auth/register' },
  },
  {
    id: 'pack5',
    name: 'Pack 5 séances',
    description: 'Pour un suivi régulier sur un mois.',
    priceCents: 20000,
    currency: 'EUR',
    billing: 'par pack',
    features: [
      '5 séances de 60 minutes',
      'Valable 90 jours',
      'Priorité sur les créneaux',
      'Bilan de progression inclus',
    ],
    cta: { label: 'Choisir ce pack', href: '/auth/register' },
    highlight: true,
  },
  {
    id: 'mentor',
    name: 'Mentorat continu',
    description: 'Pour un accompagnement tout au long de l’année.',
    priceCents: 32000,
    currency: 'EUR',
    billing: 'par mois',
    features: [
      '4 séances / mois',
      'Tuteur dédié',
      'Bilan mensuel avec les parents',
      'Accès aux ressources premium',
    ],
    cta: { label: 'Nous contacter', href: '/contact' },
  },
];
