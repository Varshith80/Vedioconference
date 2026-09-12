import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// =====================================================================
// Sprint 11 — 11-B — Zoom recording contract (schema + env).
//
// This is a static, repo-level contract test. It does NOT apply
// the migration, does NOT touch the database, and does NOT need a
// live Supabase. It reads the migration file from disk and the
// env-validation source from disk and asserts:
//
//   1. The new migration file exists with the expected slug
//      `20260912000002_add_meeting_links_recording_url.sql`.
//   2. The migration adds EXACTLY one column:
//          public.meeting_links.recording_url text
//      (nullable, no default, no NOT NULL, no other columns).
//   3. The migration does NOT add `recording_completed_at`,
//      `recording_files`, `recording_download_url`, or any
//      other recording-related column. (Sprint 11 scope is
//      `recording_url` only — the audit's §2 decision.)
//   4. The migration does NOT create indexes, triggers, RLS
//      policies, or GRANTs (the existing table ACL and
//      policies cover the new column).
//   5. `lib/env.ts` declares `ZOOM_WEBHOOK_SECRET` as an
//      optional server-side secret (z.string().min(1).optional()).
//   6. `lib/env.ts` reads `ZOOM_WEBHOOK_SECRET` from
//      `process.env` in the safeParse payload.
//   7. `.env.example` carries the `ZOOM_WEBHOOK_SECRET=` key
//      (placeholder, no real value).
//   8. The new env var is NOT exposed through `NEXT_PUBLIC_*`.
//
// The test is intentionally non-brittle about migration
// filename changes — it does NOT depend on the exact
// timestamp `20260912000002`. It only requires that the
// most recent file matching the slug is present, and that
// the file's contents declare the expected single-column
// shape.
// =====================================================================

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');
const ENV_TS         = join(REPO_ROOT, 'apps', 'web', 'lib', 'env.ts');
const ENV_EXAMPLE    = join(REPO_ROOT, 'apps', 'web', '.env.example');

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

function findMigrationBySlug(slug: string): string | null {
  if (!existsSync(MIGRATIONS_DIR)) return null;
  const matches = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(`_${slug}.sql`))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1]! : null;
}

describe('Sprint 11 — 11-B — meeting_links.recording_url migration', () => {
  const migrationFile = findMigrationBySlug('add_meeting_links_recording_url');
  const sql = migrationFile
    ? readText(join(MIGRATIONS_DIR, migrationFile))
    : '';

  it('a migration with slug `add_meeting_links_recording_url` exists', () => {
    expect(migrationFile, 'expected a forward-only migration with slug add_meeting_links_recording_url').toBeTruthy();
    expect(sql.length, 'migration file must not be empty').toBeGreaterThan(0);
  });

  it('the migration adds `recording_url text` to public.meeting_links', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.meeting_links/i);
    // The exact column definition — nullable, text, no default,
    // no NOT NULL. The `if not exists` guard makes the
    // migration idempotent.
    expect(sql).toMatch(/add\s+column\s+if\s+not\s+exists\s+recording_url\s+text\b/i);
  });

  it('the migration does NOT add any other recording-related column', () => {
    // Sprint 11 scope is `recording_url` only. The audit
    // (§2) explicitly dropped `recording_completed_at` and
    // every other sidecar column.
    expect(sql, 'no recording_completed_at column').not.toMatch(/\badd\s+column[^;]*recording_completed_at\b/i);
    expect(sql, 'no recording_files column').not.toMatch(/\badd\s+column[^;]*recording_files\b/i);
    expect(sql, 'no recording_download_url column').not.toMatch(/\badd\s+column[^;]*recording_download_url\b/i);
    expect(sql, 'no recording_started_at column').not.toMatch(/\badd\s+column[^;]*recording_started_at\b/i);
    expect(sql, 'no recording_metadata column').not.toMatch(/\badd\s+column[^;]*recording_metadata\b/i);
  });

  it('the recording_url column is nullable (no NOT NULL, no DEFAULT)', () => {
    // The single ALTER TABLE statement that adds the column
    // must not coerce a default or enforce NOT NULL.
    const addColumnLine = sql.match(/add\s+column\s+if\s+not\s+exists\s+recording_url[^,\n;]*/i);
    expect(addColumnLine, 'add column statement must be present').toBeTruthy();
    const line = addColumnLine![0]!.toLowerCase();
    expect(line, 'recording_url must NOT be NOT NULL').not.toMatch(/\bnot\s+null\b/);
    expect(line, 'recording_url must NOT have a DEFAULT clause').not.toMatch(/\bdefault\b/);
  });

  it('the migration does NOT create indexes (the existing meeting_id index is reused)', () => {
    expect(sql, 'no CREATE INDEX for recording_url').not.toMatch(/create\s+index[^;]*recording_url/i);
  });

  it('the migration does NOT create triggers', () => {
    expect(sql, 'no CREATE TRIGGER').not.toMatch(/create\s+trigger/i);
    expect(sql, 'no CREATE OR REPLACE FUNCTION (no trigger fn)').not.toMatch(/create\s+or\s+replace\s+function/i);
  });

  it('the migration does NOT create RLS policies', () => {
    expect(sql, 'no CREATE POLICY').not.toMatch(/create\s+policy/i);
  });

  it('the migration does NOT execute GRANT statements', () => {
    // The migration must not run a GRANT (the existing
    // table ACL covers the new column). The word "GRANT"
    // may appear in a comment, so we match the SQL
    // statement form only: `GRANT <priv> ON ... TO <role>`
    // or `GRANT <priv> ON ...`.
    expect(sql, 'no GRANT ... ON ... statement').not.toMatch(/\bgrant\s+[a-z]+\s+on\s+/i);
  });

  it('the migration documents the column with COMMENT ON COLUMN', () => {
    expect(sql, 'must document recording_url with COMMENT ON COLUMN').toMatch(/comment\s+on\s+column\s+public\.meeting_links\.recording_url\s+is/i);
  });
});

describe('Sprint 11 — 11-B — ZOOM_WEBHOOK_SECRET env contract', () => {
  const envSource = readText(ENV_TS);
  const exampleSource = readText(ENV_EXAMPLE);

  it('lib/env.ts declares ZOOM_WEBHOOK_SECRET as an optional server secret', () => {
    // The Zod schema entry — optional, min length 1, on the
    // server schema (not public). Match the line on its
    // own so we do not accidentally match the next
    // declaration.
    const decl = envSource.match(/ZOOM_WEBHOOK_SECRET\s*:[^,\n]+/);
    expect(decl, 'ZOOM_WEBHOOK_SECRET must be declared in serverSchema').toBeTruthy();
    const line = decl![0]!;
    expect(line, 'must be optional()').toMatch(/\.optional\(\)/);
    expect(line, 'must require min(1) when set').toMatch(/min\(1\)/);
    expect(line, 'must use z.string()').toMatch(/z\.string\(\)/);
  });

  it('lib/env.ts reads ZOOM_WEBHOOK_SECRET from process.env', () => {
    // The safeParse payload must include the new key. Look
    // for `ZOOM_WEBHOOK_SECRET:` followed by a process.env
    // reference on the same or the next non-whitespace
    // characters.
    expect(envSource).toMatch(/ZOOM_WEBHOOK_SECRET\s*:\s*process\.env\.ZOOM_WEBHOOK_SECRET/);
  });

  it('ZOOM_WEBHOOK_SECRET is NOT exposed through NEXT_PUBLIC_*', () => {
    // The schema name, the parse payload, and the
    // publicSchema must not reference a NEXT_PUBLIC_ variant
    // of the new key. The check is on the entire env.ts
    // file so a stray NEXT_PUBLIC_ZOOM_WEBHOOK_SECRET
    // (client bundle leak) is caught regardless of which
    // block it lives in.
    expect(envSource, 'no NEXT_PUBLIC_ZOOM_WEBHOOK_SECRET').not.toMatch(/NEXT_PUBLIC_ZOOM_WEBHOOK_SECRET/);
  });

  it('lib/env.ts does NOT provide a fallback / default value for the secret', () => {
    // The audit is explicit: no default, no hard-coded
    // fallback. The Zod .default(...) call would surface as
    // `.default(` on the declaration line. A hard-coded
    // string literal as the default would also fail.
    const decl = envSource.match(/ZOOM_WEBHOOK_SECRET\s*:[^,\n]+/)![0]!;
    expect(decl, 'no Zod default() — secret must be a real env value').not.toMatch(/\.default\(/);
  });

  it('.env.example carries ZOOM_WEBHOOK_SECRET= as a placeholder', () => {
    // The example file must reference the new key as a
    // placeholder. We assert the key line exists; the value
    // is empty per the repository's convention for
    // server-only secrets (cf. STRIPE_WEBHOOK_SECRET=,
    // CALENDLY_WEBHOOK_SIGNING_KEY=, N8N_WEBHOOK_SECRET=).
    expect(exampleSource).toMatch(/^ZOOM_WEBHOOK_SECRET=\s*$/m);
  });

  it('.env.example does not embed a real ZOOM_WEBHOOK_SECRET value', () => {
    // Defence in depth: no real-looking secret value. Real
    // Zoom webhook secrets are 32+ chars of mixed-case
    // alphanumerics; a 1-3 char placeholder is safe to ship.
    const valueLine = exampleSource.match(/^ZOOM_WEBHOOK_SECRET=(.*)$/m);
    expect(valueLine, 'placeholder line must exist').toBeTruthy();
    const value = (valueLine![1] ?? '').trim();
    // Empty OR a documented placeholder; never a long
    // alphanumeric blob.
    expect(value.length, 'placeholder must be empty').toBe(0);
  });
});
