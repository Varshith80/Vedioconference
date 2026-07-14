import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.6 — POST /api/admin/import-excel route test.
//
// Asserts:
//   - 401 for anonymous
//   - 400 for missing file
//   - 400 for a too-large file
//   - dry-run (default): parses, no DB writes
//   - dry-run=false: applies via the importer; 200 on full success
//   - 422 when the parser surfaces row-level errors
// =====================================================================

const mockRequireAdminRoute = vi.fn();
const mockParseCurriculum = vi.fn();
const mockImportParsedCurriculum = vi.fn();

vi.mock('@/lib/auth/require-admin-route', () => ({
  requireAdminRoute: mockRequireAdminRoute,
}));

vi.mock('@/lib/excel/parse-curriculum', () => ({
  parseCurriculum: mockParseCurriculum,
}));

vi.mock('@/lib/excel/import', () => ({
  importParsedCurriculum: mockImportParsedCurriculum,
}));

const { POST } = await import('@/app/api/admin/import-excel/route');
import { NextRequest as NextRequestCtor } from 'next/server';

// Build a multipart form-data body manually. Next.js's
// req.formData() requires the request to have a real
// multipart/form-data body with a boundary header; passing
// a FormData object directly to new Request() does not
// always encode it that way in the test runtime. Building
// the bytes ourselves avoids the round-trip.
function makeMultipartReq(fields: Record<string, string | { name: string; type?: string; content: string }>) {
  const boundary = '----TestBoundary' + Math.random().toString(36).slice(2);
  const enc = (s: string) => new TextEncoder().encode(s);
  const parts: Uint8Array[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(enc(`--${boundary}\r\n`));
    if (typeof v === 'string') {
      parts.push(enc(`Content-Disposition: form-data; name="${k}"\r\n\r\n`));
      parts.push(enc(`${v}\r\n`));
    } else {
      const ct = v.type ?? 'application/octet-stream';
      parts.push(
        enc(
          `Content-Disposition: form-data; name="${k}"; filename="${v.name}"\r\nContent-Type: ${ct}\r\n\r\n`,
        ),
      );
      parts.push(enc(v.content));
      parts.push(enc('\r\n'));
    }
  }
  parts.push(enc(`--${boundary}--\r\n`));
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    body.set(p, off);
    off += p.length;
  }
  return new NextRequestCtor('http://localhost/api/admin/import-excel', {
    method: 'POST',
    body,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  });
}

const okParsed = {
  language: 'en' as const,
  programs: [{ slug: 'p', title: 'P', subtitle: null, sheetName: 'P', sessionCount: 0 }],
  grades: [],
  courses: [],
  chapters: [],
  sessions: [],
  errors: [],
};

const parsedWithErrors = {
  ...okParsed,
  errors: [{ sheet: 'P', row: 5, reason: 'bad row' }],
};

describe('POST /api/admin/import-excel', () => {
  beforeEach(() => {
    mockRequireAdminRoute.mockReset();
    mockParseCurriculum.mockReset();
    mockImportParsedCurriculum.mockReset();
  });

  it('returns 401 when not signed in', async () => {
    const { Unauthorized } = await import('@/lib/utils/errors');
    mockRequireAdminRoute.mockRejectedValue(Unauthorized('You must be signed in.'));
    const res = await POST(
      makeMultipartReq({
        file: { name: 'a.xlsx', content: 'fake' },
        language: 'en',
        dryRun: 'true',
      }) as never,
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when file is missing', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    const res = await POST(
      makeMultipartReq({ language: 'en', dryRun: 'true' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when file is over 25 MB', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    const big = 'x'.repeat(26 * 1024 * 1024);
    const res = await POST(
      makeMultipartReq({
        file: { name: 'big.xlsx', content: big },
        language: 'en',
        dryRun: 'true',
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('dry-run: returns the parsed tree without writing to the DB', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    mockParseCurriculum.mockResolvedValue(okParsed);
    const res = await POST(
      makeMultipartReq({
        file: { name: 'a.xlsx', content: 'fake' },
        language: 'en',
        dryRun: 'true',
      }) as never,
    );
    const txt = await res.text();
    // Print on failure for diagnostics.
    if (res.status !== 200) {
      // eslint-disable-next-line no-console
      console.log('dry-run status', res.status, 'body', txt);
    }
    expect(res.status).toBe(200);
    const body = (await JSON.parse(txt)) as { ok: boolean; dryRun: boolean; report: unknown };
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(true);
    expect(body.report).toBeNull();
    expect(mockImportParsedCurriculum).not.toHaveBeenCalled();
  });

  it('apply: runs the importer and returns the report', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    mockParseCurriculum.mockResolvedValue(okParsed);
    mockImportParsedCurriculum.mockResolvedValue({
      ok: true,
      counts: { programs: 1, grades: 0, courses: 0, chapters: 0, sessions: 0, skipped: 0 },
      errors: [],
    });
    const res = await POST(
      makeMultipartReq({
        file: { name: 'a.xlsx', content: 'fake' },
        language: 'en',
        dryRun: 'false',
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; dryRun: boolean; report: { ok: boolean; counts: { programs: number } } };
    expect(body.ok).toBe(true);
    expect(body.dryRun).toBe(false);
    expect(body.report.ok).toBe(true);
    expect(body.report.counts.programs).toBe(1);
    expect(mockImportParsedCurriculum).toHaveBeenCalledTimes(1);
  });

  it('returns 422 when the parser surfaces row-level errors', async () => {
    mockRequireAdminRoute.mockResolvedValue({ supabase: {} });
    mockParseCurriculum.mockResolvedValue(parsedWithErrors);
    const res = await POST(
      makeMultipartReq({
        file: { name: 'a.xlsx', content: 'fake' },
        language: 'en',
        dryRun: 'false',
      }) as never,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; report: unknown };
    expect(body.ok).toBe(false);
    expect(body.report).toBeNull();
    expect(mockImportParsedCurriculum).not.toHaveBeenCalled();
  });
});
