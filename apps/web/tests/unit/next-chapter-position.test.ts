import { describe, it, expect, vi, beforeEach } from 'vitest';

// =====================================================================
// Sprint 3.8 — getNextChapterPosition() helper.
//
// Pre-fill `position` in the chapter-create form. Returns
// max(position)+1 for the course, or 1 when the course has no
// chapters yet. Mirrors getNextSessionPosition() for sessions.
//
// The helper runs ONE query against `chapters`:
//   SELECT position FROM chapters
//     WHERE course_id = $1
//     ORDER BY position DESC
//     LIMIT 1
// =====================================================================

const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServerClientUntyped: vi.fn(() => Promise.resolve({ from: mockFrom })),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const { getNextChapterPosition } = await import('@/services/admin/catalog');

type Result = { data: unknown; error: unknown };

function buildChaptersHandler(result: Result) {
  const chain: Record<string, unknown> = {};
  const self = chain;
  self.select = () => self;
  self.eq = () => self;
  self.order = () => self;
  self.limit = () => self;
  self.maybeSingle = () => Promise.resolve(result);
  return self;
}

describe('admin.getNextChapterPosition', () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('returns max(position)+1 for a course that already has chapters', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return buildChaptersHandler({
          data: { position: 5 },
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const pos = await getNextChapterPosition('course-1');
    expect(pos).toBe(6);
  });

  it('returns 1 when the course has no chapters yet', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return buildChaptersHandler({
          data: null,
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const pos = await getNextChapterPosition('course-1');
    expect(pos).toBe(1);
  });

  it('returns 1 (safe fallback) when the DB query throws', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'chapters') {
        return buildChaptersHandler({
          data: null,
          error: { code: '42P01', message: 'relation does not exist' },
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const pos = await getNextChapterPosition('course-1');
    // 0 + 1 fallback.
    expect(pos).toBe(1);
  });
});
