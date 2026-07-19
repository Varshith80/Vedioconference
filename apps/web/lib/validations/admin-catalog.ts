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
  sort_order: z.coerce.number().int().nonnegative().optional(),
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
  // Sprint 3.8 — dedicated assigned-tutor FK on the session.
  // Nullable: a session can be unassigned at edit time and the
  // booking will then inherit no tutor from the session.
  tutor_id: z.string().uuid().nullable().optional(),
});
export type AdminSessionEditInput = z.infer<typeof adminSessionEditSchema>;

// =====================================================================
// Sprint 3.8 — Admin Manual CRUD plan §5. The eight new schemas
// below cover the full curriculum CRUD surface (Programs / Grades
// / Courses / Chapters / Sessions) and the Sessions create form.
// Manual CRUD coexists with the Excel importer on the same natural
// keys (unique constraints are the contract).
// =====================================================================

// Programs (Levels)
export const adminProgramCreateSchema = z.object({
  slug: slugField,
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  sort_order: z.coerce.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
});
export type AdminProgramCreateInput = z.infer<typeof adminProgramCreateSchema>;

export const adminProgramEditSchema = adminProgramCreateSchema.partial();
export type AdminProgramEditInput = z.infer<typeof adminProgramEditSchema>;

// Grades
export const adminGradeCreateSchema = z.object({
  program_slug: z.string().min(1).max(120),
  slug: slugField,
  title: z.string().min(1).max(200),
  sort_order: z.coerce.number().int().nonnegative().optional(),
});
export type AdminGradeCreateInput = z.infer<typeof adminGradeCreateSchema>;

export const adminGradeEditSchema = adminGradeCreateSchema.partial();
export type AdminGradeEditInput = z.infer<typeof adminGradeEditSchema>;

// Courses (edit only — create already lives in adminCourseCreateSchema)
export const adminCourseEditSchema = z.object({
  slug: slugField.optional(),
  title: z.string().min(1).max(200).optional(),
  subtitle: z.string().max(400).optional(),
  description: z.string().max(5000).optional(),
  program_slug: z.string().min(1).max(120).optional(),
  grade_slug: z.string().min(1).max(120).optional(),
  is_published: z.boolean().optional(),
});
export type AdminCourseEditInput = z.infer<typeof adminCourseEditSchema>;

// Chapters (edit only — create already lives in adminChapterCreateSchema)
export const adminChapterEditSchema = z.object({
  slug: slugField.optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  default_duration_min: z.coerce.number().int().positive().nullable().optional(),
  sort_order: z.coerce.number().int().nonnegative().optional(),
  is_published: z.boolean().optional(),
});
export type AdminChapterEditInput = z.infer<typeof adminChapterEditSchema>;

// Sessions (create). Mirrors the API schema in
// app/api/sessions/route.ts + adds the new tutor_id field.
export const adminSessionCreateSchema = z.object({
  chapter_id: z.string().uuid(),
  position: z.coerce.number().int().positive(),
  slug: slugField,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  duration_min: z.coerce.number().int().positive().nullable().optional(),
  price_cents: z.coerce.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).optional(),
  calendly_event_uri: z.string().url().optional(),
  tutor_id: z.string().uuid().nullable().optional(),
  is_published: z.boolean().optional(),
  is_preview: z.boolean().optional(),
});
export type AdminSessionCreateInput = z.infer<typeof adminSessionCreateSchema>;

// Tutors (create). Standalone reference record — the table has
// no auth.users, no profile_id, no tutor-side UI. The Admin
// maintains this list purely for session assignment and for
// knowing who to send Zoom meeting details to. Fields match
// the standalone `public.tutors` table (Sprint 3.8).
export const adminTutorCreateSchema = z.object({
  full_name: z.string().min(1).max(200),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
  notes: z.string().max(5000).optional().nullable(),
});
export type AdminTutorCreateInput = z.infer<typeof adminTutorCreateSchema>;

// Tutors (edit). Mirrors the create schema, all fields optional.
export const adminTutorEditSchema = adminTutorCreateSchema.partial();
export type AdminTutorEditInput = z.infer<typeof adminTutorEditSchema>;
