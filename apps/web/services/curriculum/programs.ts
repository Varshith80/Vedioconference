import 'server-only';
import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { describeError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { Program, Grade } from '@/types/domain';

/**
 * `services/curriculum/programs.ts` — read access to the
 * `programs` and `grades` tables. The 5 known programs are
 * seeded by migration 20260714000000_programs_grades.sql.
 *
 * The marketing routes under /[locale]/levels/* read from
 * these helpers to render the new hierarchy. The slugs are
 * the canonical identifiers (high_school, preparatory, bts_abm,
 * bts_optics, bts_bioalc).
 */

export interface ProgramWithGrades extends Program {
  grades: ReadonlyArray<Grade>;
}

/**
 * List all published programs, ordered by `sort_order` then
 * `title`. Used by the `/[locale]/levels` page.
 */
export const getPublishedPrograms = cache(
  async (): Promise<ReadonlyArray<Program>> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
        .order('title', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ReadonlyArray<Program>;
    } catch (e) {
      logger.error('getPublishedPrograms failed', describeError(e));
      return [];
    }
  },
);

/**
 * Fetch a single program by its slug. Returns `null` on
 * miss (the caller decides how to render — a 404 page or a
 * fall-through redirect to the levels index).
 */
export const getProgramBySlug = cache(
  async (slug: string): Promise<Program | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('programs')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Program | null;
    } catch (e) {
      logger.error('getProgramBySlug failed', { slug, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Fetch a single program with its grades eagerly joined.
 * Used by the `/[locale]/levels/[levelSlug]` page when the
 * program is `high_school` (the only program with grades).
 */
export const getProgramWithGrades = cache(
  async (programId: string): Promise<ProgramWithGrades | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('programs')
        .select('*, grades(*)')
        .eq('id', programId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return data as unknown as ProgramWithGrades;
    } catch (e) {
      logger.error('getProgramWithGrades failed', { programId, ...describeError(e) });
      return null;
    }
  },
);

/**
 * Fetch a grade by its slug, scoped to a program. The pair
 * (programId, slug) is unique by the `grades` table constraint.
 */
export const getGradeBySlug = cache(
  async (programId: string, slug: string): Promise<Grade | null> => {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from('grades')
        .select('*')
        .eq('program_id', programId)
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Grade | null;
    } catch (e) {
      logger.error('getGradeBySlug failed', { programId, slug, ...describeError(e) });
      return null;
    }
  },
);
