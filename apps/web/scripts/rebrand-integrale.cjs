#!/usr/bin/env node
/**
 * Rebrand script: replace hardcoded "Intégrale" / "@integrale" /
 * "integrale.fr" with the client-approved "CoursEnLigne" /
 * "@coursenligne" / "coursenligne.fr" in the apps/web tree.
 *
 * Source of truth
 * ---------------
 * Editorial structure: `CoursEnLigne-Editorial-Structure_160826-EN.docx`
 *
 * Why a script
 * ------------
 * There are ~25 files with hardcoded "Intégrale" strings (admin
 * page titles, sidebar aria-labels, brand-mark comments). Doing
 * them one by one with the Edit tool would burn turns. This
 * script does a string replace across all of them, idempotently,
 * and emits a report of the changes.
 *
 * Safety
 * ------
 * - Only operates under `apps/web/` (not `supabase/`, `n8n/`,
 *   `docs/`, or the project root).
 * - Skips `node_modules`, `.next`, `dist`, `coverage`.
 * - Skips JSON files that already had Intégrale rebrand-applied
 *   (they were re-saved by `patch-pricing-i18n.cjs`).
 * - Only touches the surface strings; never touches schema, never
 *   deletes files.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const REPLACEMENTS = [
  { from: 'Intégrale',                 to: 'CoursEnLigne' },
  { from: 'integrale.fr',              to: 'coursenligne.fr' },
  { from: '@integrale',               to: '@coursenligne' },
];

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', 'out', '.git']);
const TARGET_DIRS = ['app', 'components', 'services', 'lib', 'messages'];
const TARGET_FILES = ['middleware.ts', 'next.config.mjs'];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

let totalFiles = 0;
let totalReplacements = 0;
const report = [];

for (const t of TARGET_DIRS) {
  for (const f of walk(path.join(ROOT, t))) {
    if (!/\.(ts|tsx|js|jsx|json|md)$/.test(f)) continue;
    let src = fs.readFileSync(f, 'utf8');
    let n = 0;
    for (const r of REPLACEMENTS) {
      const re = new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const m = src.match(re);
      if (m) {
        n += m.length;
        src = src.replace(re, r.to);
      }
    }
    if (n > 0) {
      fs.writeFileSync(f, src, 'utf8');
      totalFiles++;
      totalReplacements += n;
      report.push(`  ${path.relative(ROOT, f)}  (${n} replacements)`);
    }
  }
}

for (const f of TARGET_FILES) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) continue;
  let src = fs.readFileSync(full, 'utf8');
  let n = 0;
  for (const r of REPLACEMENTS) {
    const re = new RegExp(r.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const m = src.match(re);
    if (m) {
      n += m.length;
      src = src.replace(re, r.to);
    }
  }
  if (n > 0) {
    fs.writeFileSync(full, src, 'utf8');
    totalFiles++;
    totalReplacements += n;
    report.push(`  ${f}  (${n} replacements)`);
  }
}

console.log(`Rebrand sweep complete.`);
console.log(`Files changed: ${totalFiles}`);
console.log(`Total replacements: ${totalReplacements}`);
console.log('---');
report.forEach((r) => console.log(r));
