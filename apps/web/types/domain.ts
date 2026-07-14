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
 * Sprint 3.6 changes:
 *   - Sprint 3.5 added: `Program`, `Grade`, `Chapter`, `Session`,
 *     `SessionGrant`, `SessionBooking` (and the four
 *     `*WithDetails` convenience interfaces).
 *   - Sprint 3.6 retires: the v1 `Module` / `Enrollment` /
 *     `ModuleProgress` / `ModuleBooking` / `CourseWithModules` /
 *     `ModuleBookingWithDetails` / `EnrollmentWithProgress`
 *     aliases. The 410-stamped route handlers, the v1 services,
 *     and the v1 dashboard `BookingCard` component are all
 *     deleted in this sprint. The `module_bookings` SQL table
 *     and the `_bookings_legacy` SQL table are also dropped
 *     (`20260715000000_drop_v1_back_compat_tables.sql`).
 *   - `Payment`, `MeetingLink`, `ResourceGrant` keep the new
 *     nullable `session_grant_id` / `session_booking_id`
 *     columns (the v1 `enrollment_id` / `module_booking_id`
 *     columns are dropped with the v1 tables).
 *   - The `enrollment_status` enum is reused for
 *     `session_grants.status` (the user-approved Q6 answer from
 *     Sprint 3.5).
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

// -- Row types (derived from the typed Database) ---------------------------

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Tutor = Database['public']['Tables']['tutors']['Row'];
export type Course = Database['public']['Tables']['courses']['Row'];
export type CourseTutor = Database['public']['Tables']['course_tutors']['Row'];

/**
 * `payments` — one row per Stripe charge. The unit of payment
 * is the v2 `session_grant` (the `session_grant_id` FK is
 * non-null in normal use).
 */
export type Payment = Database['public']['Tables']['payments']['Row'];

/**
 * `meeting_links` — one Zoom meeting per `session_booking_id`.
 * The v1 `booking_id` / `module_booking_id` columns were
 * dropped with the v1 back-compat migration
 * (`20260715000000_drop_v1_back_compat_tables.sql`).
 */
export type MeetingLink = Database['public']['Tables']['meeting_links']['Row'];

export type Resource = Database['public']['Tables']['resources']['Row'];

/**
 * `resource_grants` — per-session_grant access to a resource.
 * Replaces the pre-Sprint-B2 per-booking join.
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

// -- Helpers ---------------------------------------------------------------

/** Re-export Database for the rare caller that needs it. The
 *  cast at the service boundary is the only place it is used. */
export type { Database, Json };

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
