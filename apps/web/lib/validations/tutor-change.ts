import { z } from 'zod';

// =====================================================================
// Sprint 6 — Zod schemas for the tutor-change-request flow.
//
// Body contracts
// --------------
// Student POST /api/student/tutor-change-requests
//   { session_booking_id: uuid; student_reason?: string }
//
// Admin  PATCH /api/admin/tutor-change-requests/[id]/alternatives
//   { alternative_tutor_ids: uuid[] (length 1..3) }
//
// Student PATCH /api/student/tutor-change-requests/[id]/selection
//   { selected_tutor_id: uuid }
//
// Admin  PATCH /api/admin/tutor-change-requests/[id]/resolution
//   { admin_notes?: string; selected_tutor_id?: uuid }
//
// Notes
// -----
// - All UUIDs are validated by Zod BEFORE the route handler
//   runs. The DB layer still enforces the same invariants; the
//   Zod check is the first gate.
// - `alternative_tutor_ids` is capped at 3 to match the DB CHECK
//   constraint `tutor_change_requests_max_three_alternatives`.
//   The minimum is 1 — the admin cannot "propose" zero
//   alternatives.
// - `student_reason` is optional but capped at 2000 chars to
//   keep the in-app notification body bounded.
// - `admin_notes` is optional and capped at 2000 chars for the
//   same reason.
// =====================================================================

// ----- Student: create a new tutor-change request ---------------
export const createTutorChangeRequestSchema = z.object({
  session_booking_id: z.string().uuid({
    message: 'session_booking_id must be a valid UUID.',
  }),
  student_reason: z.string().max(2000).optional(),
});
export type CreateTutorChangeRequestInput = z.infer<
  typeof createTutorChangeRequestSchema
>;

// ----- Admin: propose 1..3 alternative tutors -------------------
export const adminProposeAlternativesSchema = z.object({
  alternative_tutor_ids: z
    .array(z.string().uuid())
    .min(1, 'Provide at least one alternative tutor.')
    .max(3, 'Provide at most three alternative tutors.'),
});
export type AdminProposeAlternativesInput = z.infer<
  typeof adminProposeAlternativesSchema
>;

// ----- Student: pick one of the proposed alternatives -----------
export const studentSelectAlternativeSchema = z.object({
  selected_tutor_id: z.string().uuid({
    message: 'selected_tutor_id must be a valid UUID.',
  }),
});
export type StudentSelectAlternativeInput = z.infer<
  typeof studentSelectAlternativeSchema
>;

// ----- Admin: record the resolution (optional re-pointing) -------
// The admin uses this to either cancel a request or record a
// resolution note after the student picked (or after the admin
// picked on behalf of the student when the student did not
// respond in time). The re-pointing to `session_bookings.tutor_id`
// is performed by the service layer when `selected_tutor_id` is
// supplied.
export const adminResolveRequestSchema = z.object({
  admin_notes: z.string().max(2000).optional(),
  selected_tutor_id: z.string().uuid().optional(),
});
export type AdminResolveRequestInput = z.infer<
  typeof adminResolveRequestSchema
>;
