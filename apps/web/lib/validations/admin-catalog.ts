import { z } from 'zod';

// =====================================================================
// Sprint 3.6 §4.5 — Zod schemas for the admin catalog forms
// (course create, chapter create, session edit). These
// match the API body schemas in app/api/courses/route.ts,
// app/api/chapters/route.ts, and app/api/sessions/[id]/
// route.ts. The form-level `refine`s add UX checks (slug
// format, price non-negative) that the server also enforces
// (defence in depth).
// =====================================================================

const slugRe =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export const slugField = z
  .string()
  .min(1)
  .max(120)
  .regex(slugRe, 'slug must be lowercase letters, digits, and dashes');

export const adminCourseCreateSchema = z.object({
  slug: slugField,
  title: z.string().min(1).max(200),
  subtitle: z.string().max(400).optional(),
  description: z.string().max(5000).optional(),
  program_slug: z.string().min(1).max(120),
  grade_slug: z.string().min(1).max(120).optional(),
  is_published: z.boolean().optional(),
});
export type AdminCourseCreateInput = z.infer<typeof adminCourseCreateSchema>;

export const adminChapterCreateSchema = z.object({
  course_slug: z.string().min(1).max(120),
  slug: slugField,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  default_duration_min: z.coerce.number().int().positive().nullable().optional(),
  is_published: z.boolean().optional(),
});
export type AdminChapterCreateInput = z.infer<typeof adminChapterCreateSchema>;

export const adminSessionEditSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  duration_min: z.coerce.number().int().positive().nullable().optional(),
  price_cents: z.coerce.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  calendly_event_uri: z.string().url().nullable().optional(),
  is_published: z.boolean().optional(),
  is_preview: z.boolean().optional(),
});
export type AdminSessionEditInput = z.infer<typeof adminSessionEditSchema>;
