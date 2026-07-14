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
/**
 * Sprint 3.5 changes:
 *   - New v2 entities: `Program`, `Grade`, `Chapter`, `Session`,
 *     `SessionGrant`, `SessionBooking`.
 *   - The v1 `Module` / `Enrollment` / `ModuleProgress` /
 *     `ModuleBooking` types are KEPT and marked `@deprecated`.
 *     They are referenced by the 410-stamped v1 route handlers
 *     and the deprecated `services/{enrollments,module-bookings}.ts`
 *     files. They are removed in Sprint 3.6.
 *   - `Payment`, `MeetingLink`, `ResourceGrant` get the new
 *     nullable `session_grant_id` / `session_booking_id` columns.
 *   - The `enrollment_status` enum is reused for
 *     `session_grants.status` (the user-approved Q6 answer).
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
// Sprint 3.5: `module_progress_status` enum is dropped (the
// `module_progress` table is gone). The string-literal type
// is kept as a local type alias for the @deprecated
// `ModuleProgress` interface's `status` field. It is not
// exported.
type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';

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

// -- Sprint B2 new entities (DEPRECATED since Sprint 3.5) -------------------

/**
 * @deprecated Since Sprint 3.5. The new hierarchy uses
 * `Chapter` and `Session`; the v1 `Module` is now an alias for
 * a `Chapter` (one v1 module = one v2 chapter + one v2 session,
 * 1:1 in the backfill; Sprint 5 splits chapters into N sessions).
 * New code MUST use `Chapter` and `Session`. The interface is
 * retained so the 410-stamped v1 route handlers still compile.
 * Will be removed in Sprint 3.6.
 */
export type Module = Database['public']['Tables']['modules']['Row'];

/**
 * @deprecated Since Sprint 3.5. The unit of payment is now
 * `SessionGrant`, not `Enrollment`. New code MUST use
 * `SessionGrant`. The interface is retained so the 410-stamped
 * v1 route handlers still compile. Will be removed in
 * Sprint 3.6.
 */
export type Enrollment = Database['public']['Tables']['enrollments']['Row'];

/**
 * @deprecated Since Sprint 3.5. The `module_progress` table is
 * dropped (migration 14 §5). The new equivalent is
 * `session_bookings.status = 'completed'`. The interface is
 * retained only for the JSDoc references. Will be removed in
 * Sprint 3.6.
 */
export type ModuleProgress = {
  id: string;
  enrollment_id: string;
  module_id: string;
  status: ModuleProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * @deprecated Since Sprint 3.5. The unit of a Zoom meeting is
 * now `SessionBooking`, not `ModuleBooking`. New code MUST use
 * `SessionBooking`. The interface is retained so the 410-stamped
 * v1 route handlers still compile. Will be removed in
 * Sprint 3.6.
 */
export type ModuleBooking = Database['public']['Tables']['module_bookings']['Row'];

// -- Helpers ---------------------------------------------------------------

/** Re-export Database for the rare caller that needs it. The
 *  cast at the service boundary is the only place it is used. */
export type { Database, Json };

// -- Convenience aliases for services and components ----------------------

/**
 * @deprecated Since Sprint 3.5. Use `CourseWithChapters` instead.
 * The interface is retained so the deprecated
 * `services/courses.ts` (v1) and the `course-detail.tsx`
 * component still compile. Will be removed in Sprint 3.6.
 */
export interface CourseWithModules extends Course {
  modules: ReadonlyArray<Module>;
}

/**
 * @deprecated Since Sprint 3.5. Use `SessionBookingWithDetails`
 * instead. The interface is retained so the deprecated
 * `services/module-bookings.ts` (v1) still compiles. Will be
 * removed in Sprint 3.6.
 */
export interface ModuleBookingWithDetails extends ModuleBooking {
  module: Module;
  meeting: MeetingLink | null;
}

/**
 * @deprecated Since Sprint 3.5. The `Enrollment` type is
 * deprecated; the v2 equivalent is `SessionGrantWithDetails`.
 * Will be removed in Sprint 3.6.
 */
export interface EnrollmentWithProgress extends Enrollment {
  course: Course;
  progress: ReadonlyArray<ModuleProgress>;
}

// -- Sprint 3.5 new entities (v2 hierarchy) -------------------------------

/**
 * `programs` — top of the curriculum hierarchy. The 5 known
 * programs: High School, Prep School, BTS ABM, BTS Optics,
 * BTS BioALC. (Migration 14 §1)
 */
export type Program = Database['public']['Tables']['programs']['Row'];

/**
 * `grades` — OPTIONAL middle layer. Only the High School
 * program has rows. (Migration 14 §2)
 */
export type Grade = Database['public']['Tables']['grades']['Row'];

/**
 * `chapters` — a pedagogical chapter of a course. Each
 * chapter groups N sessions. (Migration 14 §2)
 */
export type Chapter = Database['public']['Tables']['chapters']['Row'];

/**
 * `sessions` — the atomic unit of the platform: one Stripe
 * charge, one Calendly booking, one Zoom meeting, one
 * attendance record, one progress signal. NULL `price_cents`
 * means "price TBD" (set by the Sprint 5 Excel import).
 * (Migration 14 §3)
 */
export type Session = Database['public']['Tables']['sessions']['Row'];

/**
 * `session_grants` — per-student × per-session payment. The
 * unit of Stripe Checkout in Sprint 3.5+. Reuses the
 * `enrollment_status` enum. (Migration 14 §2)
 */
export type SessionGrant = Database['public']['Tables']['session_grants']['Row'];

/**
 * `session_bookings` — one row per live session. The unit of
 * a Zoom meeting in Sprint 3.5+. Calendly is the source of
 * truth for `scheduled_start` / `scheduled_end`. (Migration
 * 14 §3)
 */
export type SessionBooking = Database['public']['Tables']['session_bookings']['Row'];

// -- Sprint 3.5 convenience aliases (v2) ---------------------------------

/**
 * A session with its parent chapter eagerly joined. Used by
 * the public session detail page and the dashboard's
 * session list.
 */
export interface SessionWithChapter extends Session {
  chapter: Chapter;
}

/**
 * A chapter with its sessions eagerly joined. Used by the
 * course detail page's chapter accordion.
 */
export interface ChapterWithSessions extends Chapter {
  sessions: ReadonlyArray<Session>;
}

/**
 * A course with its program, grade, and chapters-with-sessions
 * eagerly joined. Used by the marketing course detail page
 * and the public session detail page's back-link chain.
 */
export interface CourseWithChapters extends Course {
  program: Program;
  grade: Grade | null;
  chapters: ReadonlyArray<ChapterWithSessions>;
}

/**
 * A session booking with its session, chapter, and meeting
 * link eagerly joined. Used by the student dashboard's "my
 * sessions" list and the tutor dashboard.
 */
export interface SessionBookingWithDetails extends SessionBooking {
  session: SessionWithChapter;
  meeting: MeetingLink | null;
}

/**
 * A session grant with its session, chapter, course, program,
 * and grade eagerly joined. Used by the student dashboard's
 * "my programs" / "my sessions" lists.
 */
export interface SessionGrantWithDetails extends SessionGrant {
  session: SessionWithChapter;
  course: Course;
  program: Program;
  grade: Grade | null;
}
