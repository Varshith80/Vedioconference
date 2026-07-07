import { z } from 'zod';

export const courseFiltersSchema = z.object({
  subject:     z.string().optional(),
  level_group: z.enum(['high_school', 'preparatory']).optional(),
  q:           z.string().max(120).optional(),
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().min(1).max(100).default(12),
});
export type CourseFilters = z.infer<typeof courseFiltersSchema>;
