import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Sprint 3.5 unit test for `getCourseWithChapters` — the
 * service the marketing course detail page uses to render
 * the chapter + session accordion.
 */

// Mocks must come before the service import.
const mockFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

async function loadServerMockMocked(from: (table: string) => unknown) {
  const { createSupabaseServerClient } = await import('@/lib/supabase/server');
  (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    from,
  });
}

interface Row { data: unknown; error: null }

function tableQueue(responses: Row[]) {
  let i = 0;
  return (_table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'in', 'order', 'maybeSingle'];
    for (const m of methods) (chain as Record<string, unknown>)[m] = vi.fn(() => chain);
    Object.defineProperty(chain, 'then', {
      get() {
        return (resolve: (r: Row) => void) => {
          resolve(responses[i++] ?? { data: null, error: null });
        };
      },
    });
    return chain;
  };
}

const COURSE_ROW = {
  id: 'c1',
  slug: 'maths-1ere',
  title: 'Mathématiques — Première',
  subtitle: 'Programme de Première',
  description: null,
  program: { id: 'p1', slug: 'high_school', title: 'High School' },
  grade: { id: 'g1', slug: 'grade_11', title: 'Grade 11' },
};
const CHAPTERS = [
  { id: 'ch1', course_id: 'c1', position: 1, slug: 'algebra', title: 'Algebra' },
  { id: 'ch2', course_id: 'c1', position: 2, slug: 'geometry', title: 'Geometry' },
];
const SESSIONS = [
  { id: 's1', chapter_id: 'ch1', position: 1, title: 'Linear equations', price_cents: 4500, currency: 'EUR' },
  { id: 's2', chapter_id: 'ch1', position: 2, title: 'Quadratic equations', price_cents: 4500, currency: 'EUR' },
  { id: 's3', chapter_id: 'ch2', position: 1, title: 'Triangles', price_cents: null, currency: 'EUR' },
];

const { getCourseWithChapters } = await import('@/services/curriculum/courses');

describe('getCourseWithChapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a course with its chapters and sessions eagerly joined, in position order', async () => {
    await loadServerMockMocked(
      tableQueue([
        { data: COURSE_ROW, error: null },
        { data: CHAPTERS, error: null },
        { data: SESSIONS, error: null },
      ]),
    );
    const course = await getCourseWithChapters('maths-1ere');
    expect(course).not.toBeNull();
    expect(course?.id).toBe('c1');
    expect(course?.program.slug).toBe('high_school');
    expect(course?.grade?.slug).toBe('grade_11');
    expect(course?.chapters).toHaveLength(2);
    expect(course?.chapters[0]?.id).toBe('ch1');
    expect(course?.chapters[0]?.sessions).toHaveLength(2);
    expect(course?.chapters[1]?.id).toBe('ch2');
    expect(course?.chapters[1]?.sessions).toHaveLength(1);
  });

  it('returns null when the course does not exist', async () => {
    await loadServerMockMocked(
      tableQueue([{ data: null, error: null }]),
    );
    const course = await getCourseWithChapters('does-not-exist');
    expect(course).toBeNull();
  });

  it('returns the course with an empty chapters list when no chapters exist', async () => {
    await loadServerMockMocked(
      tableQueue([
        { data: COURSE_ROW, error: null },
        { data: [], error: null },
      ]),
    );
    const course = await getCourseWithChapters('maths-1ere');
    expect(course?.chapters).toHaveLength(0);
  });
});
