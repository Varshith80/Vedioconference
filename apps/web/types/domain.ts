/**
 * Domain types — the strongly-typed shapes used by services and
 * components. Derived from the typed `Database` in
 * `database.generated.ts`.
 *
 * The boundary rule (CLAUDE.md §3.9):
 *   1. `apps/web/types/domain.ts` carries the *strong* types
 *      (this file).
 *   2. `apps/web/types/database.generated.ts` is the
 *      machine-generated mirror of the live Supabase schema.
 *   3. Services read from the Database (`Database['public']['Tables']`)
 *      and cast at the boundary: `as unknown as Course`, etc.
 *   4. Components consume only the domain types. They never
 *      import `Database` directly.
 *
 * Sprint B2 changes:
 *   - New B2 entities: `Module`, `Enrollment`, `ModuleProgress`,
 *     `ModuleBooking`.
 *   - `Payment`, `MeetingLink`, `ResourceGrant` get the new
 *     nullable `enrollment_id` / `module_booking_id` columns
 *     (and `ResourceGrant.booking_id` is removed).
 *   - `Booking` is now `LegacyBooking` (the renamed
 *     `_bookings_legacy` table). New code uses `ModuleBooking`.
 *   - `CouponKind` and `SubscriptionStatus` are aligned to the
 *     Postgres enum values (no more `free_session`, no more
 *     `canceled` — Postgres spelling is `cancelled` and
 *     `incomplete_expired`).
 */
import type { Database, Json } from './database.generated';

// -- Enums ----------------------------------------------------------------
export type BookingStatus = Database['public']['Enums']['booking_status'];
export type PaymentStatus = Database['public']['Enums']['payment_status'];
export type PaymentProvider = Database['public']['Enums']['payment_provider'];
export type UserRole = Database['public']['Enums']['user_role'];
export type SubscriptionStatus = Database['public']['Enums']['subscription_status'];
export type CouponKind = Database['public']['Enums']['coupon_kind'];
export type InvoiceStatus = Database['public']['Enums']['invoice_status'];
export type EnrollmentStatus = Database['public']['Enums']['enrollment_status'];
export type ModuleProgressStatus = Database['public']['Enums']['module_progress_status'];

// -- Row types (derived from the typed Database) ---------------------------

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Tutor = Database['public']['Tables']['tutors']['Row'];
export type Course = Database['public']['Tables']['courses']['Row'];
export type CourseTutor = Database['public']['Tables']['course_tutors']['Row'];

/**
 * DEPRECATED. The pre-Sprint-B2 `bookings` table, renamed to
 * `_bookings_legacy` in migration 09 §0. New code MUST NOT read
 * this table. Kept here only so legacy import sites type-check
 * until they are deleted in a later sprint.
 */
export type LegacyBooking = Database['public']['Tables']['_bookings_legacy']['Row'];

/**
 * `payments` — exactly one of `enrollment_id`, `module_booking_id`,
 * or `booking_id` (legacy) is set in normal use. The application
 * always writes `enrollment_id`.
 */
export type Payment = Database['public']['Tables']['payments']['Row'];

/**
 * `meeting_links` — one Zoom meeting per `module_booking_id` (new
 * path) or per `booking_id` (legacy). The new code path only
 * writes `module_booking_id`.
 */
export type MeetingLink = Database['public']['Tables']['meeting_links']['Row'];

export type Resource = Database['public']['Tables']['resources']['Row'];

/**
 * `resource_grants` — per-enrollment access to a resource.
 * (Replaces the pre-Sprint-B2 per-booking join.)
 */
export type ResourceGrant = Database['public']['Tables']['resource_grants']['Row'];

export type Notification = Database['public']['Tables']['notifications']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
export type Subscription = Database['public']['Tables']['subscriptions']['Row'];
export type Coupon = Database['public']['Tables']['coupons']['Row'];
export type WebhookEvent = Database['public']['Tables']['webhook_events']['Row'];
export type N8nExecution = Database['public']['Tables']['n8n_executions']['Row'];
export type N8nDeadLetter = Database['public']['Tables']['n8n_dead_letters']['Row'];
export type Invoice = Database['public']['Tables']['invoices']['Row'];

// -- Sprint B2 new entities ------------------------------------------------

/**
 * `modules` — pre-created pedagogical atoms of a course. Each
 * has its own Calendly event type. Source of truth for the
 * module's scheduled duration.
 */
export type Module = Database['public']['Tables']['modules']['Row'];

/**
 * `enrollments` — paid access to a course. The unit of payment.
 * One row per (student, course) for the active enrollment.
 * Re-enrollment is allowed once the prior row is `completed`,
 * `cancelled`, or `refunded`.
 */
export type Enrollment = Database['public']['Tables']['enrollments']['Row'];

/**
 * `module_progress` — per-enrollment × per-module state. Updated
 * by the `fn_module_bookings_completion` trigger when a
 * `module_bookings` row flips to `completed`, and the
 * `fn_enrollments_completion` trigger when every module for an
 * enrollment is completed.
 */
export type ModuleProgress = Database['public']['Tables']['module_progress']['Row'];

/**
 * `module_bookings` — one row per live session. The unit of a
 * Zoom meeting. Source of truth for `scheduled_start` /
 * `scheduled_end` is the Calendly webhook, never the client.
 */
export type ModuleBooking = Database['public']['Tables']['module_bookings']['Row'];

// -- Helpers ---------------------------------------------------------------

/** Re-export Database for the rare caller that needs it. The
 *  cast at the service boundary is the only place it is used. */
export type { Database, Json };

// -- Convenience aliases for services and components ----------------------

/**
 * A course with its published modules eagerly joined. The
 * services layer constructs this shape; components consume it
 * for the course-detail page.
 */
export interface CourseWithModules extends Course {
  modules: ReadonlyArray<Module>;
}

/**
 * A module booking with its module and (optional) meeting link
 * eagerly joined. Used by the student dashboard's "my bookings"
 * list and the tutor dashboard.
 */
export interface ModuleBookingWithDetails extends ModuleBooking {
  module: Module;
  meeting: MeetingLink | null;
}

/**
 * An enrollment with its course and module progress eagerly
 * joined. Used by the student dashboard.
 */
export interface EnrollmentWithProgress extends Enrollment {
  course: Course;
  progress: ReadonlyArray<ModuleProgress>;
}
