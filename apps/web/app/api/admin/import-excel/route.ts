import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { errorResponse } from '@/lib/utils/api';
import { BadRequest } from '@/lib/utils/errors';
import { requireAdminRoute } from '@/lib/auth/require-admin-route';
import { parseCurriculum, type Language } from '@/lib/excel/parse-curriculum';
import { importParsedCurriculum } from '@/lib/excel/import';
import { logger } from '@/lib/utils/logger';

/**
 * POST /api/admin/import-excel — admin-only Excel curriculum
 * importer. Sprint 3.6 §5.4.
 *
 * Accepts multipart/form-data with:
 *   - file    : the .xlsx workbook
 *   - language: 'en' | 'fr'  (default: 'en')
 *   - dryRun  : 'true' | 'false'  (default: 'true')
 *
 * Dry-run: parses the workbook, returns the parsed tree, and
 * reports the would-be counts. No DB writes.
 *
 * Apply: parses, then runs the idempotent importer via the
 * existing `importParsedCurriculum` helper. Returns the parsed
 * tree + the ImportReport.
 *
 * The 25 MB upload cap protects the route from pathological
 * files; the parser also emits row-level errors that the admin
 * can correct and re-upload.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const formSchema = z.object({
  language: z.enum(['en', 'fr']).default('en'),
  // dryRun arrives as a string ('true' | 'false'). We coerce to
  // boolean; anything else is a 400.
  dryRun: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .default('true'),
});

// Next.js route segment config — runtime is Node.js (required
// for exceljs + Buffer). The dynamic flag keeps the route out
// of the static cache.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Admin-only (Sprint 3.6 §4.1).
    await requireAdminRoute();

    const form = await req.formData().catch(() => null);
    if (!form) {
      throw BadRequest('Expected multipart/form-data.');
    }

    const rawFile = form.get('file');
    // The formData() spec returns a `File` for file fields.
    // The runtime's File class is a global, so this is the
    // most portable check. Some runtimes (older Node, jsdom)
    // expose the file as a Blob with a `name` property; we
    // accept both.
    const isFileLike = (x: unknown): x is File =>
      typeof x === 'object' &&
      x !== null &&
      typeof (x as { arrayBuffer?: unknown }).arrayBuffer === 'function' &&
      typeof (x as { size?: unknown }).size === 'number';
    if (!isFileLike(rawFile)) {
      throw BadRequest('Missing or invalid "file" field.');
    }
    if (rawFile.size > MAX_UPLOAD_BYTES) {
      throw BadRequest(
        `File too large (${(rawFile.size / 1024 / 1024).toFixed(1)} MB; max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
      );
    }

    const formParsed = formSchema.safeParse({
      language: form.get('language') ?? 'en',
      dryRun: form.get('dryRun') ?? 'true',
    });
    if (!formParsed.success) {
      throw BadRequest('Invalid form fields.', { issues: formParsed.error.issues });
    }
    const { language, dryRun } = formParsed.data;
    const lang: Language = language;

    // Parse first. The parser is pure (no I/O, no DB) and emits
    // row-level errors that the admin can correct and re-upload.
    const buf = Buffer.from(await rawFile.arrayBuffer());
    const parsed = await parseCurriculum(buf, { language: lang });

    // If the workbook has parse errors, surface them — the admin
    // can correct the file and re-upload. We do this even in
    // apply mode (the import would be a partial write without
    // the bad rows).
    if (parsed.errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          dryRun,
          parsed,
          report: null,
        },
        { status: 422 },
      );
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        parsed,
        report: null,
      });
    }

    // Apply the parsed tree via the importer. The importer is
    // idempotent (Sprint 3.6 §5.0 invariant #3) — every write
    // is ON CONFLICT DO UPDATE.
    const { supabase } = await requireAdminRoute();
    const report = await importParsedCurriculum(
      supabase as unknown as Parameters<typeof importParsedCurriculum>[0],
      parsed,
    );
    logger.info('import-excel: applied', {
      language,
      counts: report.counts,
      errors: report.errors.length,
    });
    return NextResponse.json({
      ok: report.ok,
      dryRun: false,
      parsed,
      report,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
