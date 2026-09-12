#!/usr/bin/env node
/**
 * Patch script: add the missing i18n keys for the pricing tiers
 * used by `components/marketing/pricing-table.tsx`. The component
 * reads:
 *   - individualTitle, individualDescription, individualBilling,
 *     individualFeature1..4, individualCta
 *   - pack10Title, pack10Description, pack10Billing,
 *     pack10Feature1..4, pack10Cta, pack10Badge
 *   - monthlyTitle, monthlyDescription, monthlyBilling,
 *     monthlyFeature1..4, monthlyCta
 *
 * Source of truth: the editorial spec
 * (`CoursEnLigne-Editorial-Structure_160826-EN.docx`) and
 * the pricing decisions in
 * `Pricing_and_Session_Rules_EN.md`. Prices (€35 / €299 / €109)
 * are already encoded in the database via the alignment
 * migration. The i18n strings below are the human-readable
 * labels only.
 */
const fs = require('fs');
const path = require('path');

const enPricing = {
  individualTitle: 'Single session',
  individualDescription: '60-minute live video session with a verified tutor.',
  individualBilling: 'per 60-min session',
  individualFeature1: 'Live video in 60 minutes',
  individualFeature2: 'Verified tutor matched to your level',
  individualFeature3: 'Session materials sent after class',
  individualFeature4: 'Free cancellation up to 1 hour before',
  individualCta: 'Book a session',

  pack10Title: '10-session pack',
  pack10Description: 'Ten 60-minute sessions, valid 6 months, same tutor for continuity.',
  pack10Billing: 'for 10 sessions',
  pack10Feature1: 'Everything in the single session',
  pack10Feature2: 'Same dedicated tutor for continuity',
  pack10Feature3: 'Detailed progress dashboard',
  pack10Feature4: 'Priority on available slots',
  pack10Badge: 'Most popular',
  pack10Cta: 'Choose this pack',

  monthlyTitle: 'Monthly follow-up',
  monthlyDescription: 'Four 60-minute sessions per month, no commitment, cancel anytime.',
  monthlyBilling: 'per month, 4 sessions included',
  monthlyFeature1: '4 sessions of 60 min per month',
  monthlyFeature2: 'Monthly progress report for parents',
  monthlyFeature3: 'No commitment, cancel anytime',
  monthlyFeature4: 'Sessions can roll over to next month',
  monthlyCta: 'Start the follow-up',
};

const frPricing = {
  individualTitle: 'Séance à l’unité',
  individualDescription: 'Séance de 60 minutes en visio avec un tuteur vérifié.',
  individualBilling: 'par séance de 60 min',
  individualFeature1: 'Cours en visio de 60 minutes',
  individualFeature2: 'Tuteur vérifié, adapté à votre niveau',
  individualFeature3: 'Supports de séance envoyés après le cours',
  individualFeature4: 'Annulation gratuite jusqu’à 1 heure avant',
  individualCta: 'Réserver une séance',

  pack10Title: 'Pack 10 séances',
  pack10Description: 'Dix séances de 60 minutes, valable 6 mois, même tuteur pour la continuité.',
  pack10Billing: 'pour 10 séances',
  pack10Feature1: 'Tout ce qui est inclus à l’unité',
  pack10Feature2: 'Tuteur attitré, même prof à chaque séance',
  pack10Feature3: 'Tableau de bord de progression détaillé',
  pack10Feature4: 'Priorité sur les créneaux disponibles',
  pack10Badge: 'Le plus choisi',
  pack10Cta: 'Choisir ce pack',

  monthlyTitle: 'Suivi mensuel',
  monthlyDescription: 'Quatre séances de 60 minutes par mois, sans engagement, résiliable à tout moment.',
  monthlyBilling: 'par mois, 4 séances incluses',
  monthlyFeature1: '4 séances de 60 min par mois',
  monthlyFeature2: 'Bilan mensuel de progression envoyé aux parents',
  monthlyFeature3: 'Sans engagement, résiliable à tout moment',
  monthlyFeature4: 'Séances reportables d’un mois sur l’autre',
  monthlyCta: 'Démarrer le suivi',
};

const enPath = path.join(__dirname, '..', 'messages', 'en.json');
const frPath = path.join(__dirname, '..', 'messages', 'fr.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));

en.Pricing = { ...en.Pricing, ...enPricing };
fr.Pricing = { ...fr.Pricing, ...frPricing };

// Rebrand: replace "Intégrale" with "CoursEnLigne" in title strings.
// Done here (in addition to a separate rebrand pass) because Bug 6
// explicitly mentions the pricing page rendering wrong content,
// and the title currently says "Pricing — Intégrale".
function rebrand(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/Intégrale/g, 'CoursEnLigne');
  }
  if (Array.isArray(obj)) return obj.map(rebrand);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = rebrand(obj[k]);
    return out;
  }
  return obj;
}
const rebrandedEn = rebrand(en);
const rebrandedFr = rebrand(fr);

fs.writeFileSync(enPath, JSON.stringify(rebrandedEn, null, 2) + '\n', 'utf8');
fs.writeFileSync(frPath, JSON.stringify(rebrandedFr, null, 2) + '\n', 'utf8');

console.log('Patched en.json + fr.json with missing Pricing.* keys and replaced "Intégrale" → "CoursEnLigne"');
console.log('en keys now:', Object.keys(rebrandedEn.Pricing).sort().join(', '));
console.log('fr keys now:', Object.keys(rebrandedFr.Pricing).sort().join(', '));
