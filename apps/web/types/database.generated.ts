/**
 * `database.generated.ts` — the typed shape of the live Supabase
 * schema. Mirror of `supabase/migrations/*.sql` as of Sprint B2.
 *
 * This file is hand-maintained to match the schema the Supabase
 * CLI would produce via:
 *
 *   pnpm db:types
 *
 * The CLI requires a running local Supabase stack (`supabase
 * start`); the canonical build is generated against the linked
 * remote project. When the schema changes, run `pnpm db:types`
 * and overwrite this file with the CLI output. The hand-written
 * version below is identical in shape — same Json / Database
 * envelope, same per-table Row/Insert/Update/Relationships,
 * same enums, same functions.
 *
 * Why a hand-maintained copy?
 *   - Sprint B2 ships the typed boundary to services that read
 *     from `enrollments`, `module_bookings`, `module_progress`,
 *     `modules`. Without a precise `Database['public']['Tables']`
 *     the select chains fall back to `never` and the Supabase
 *     queries lose type-safety.
 *   - The legacy `AnyTable` stand-in (Phase 1) made the existing
 *     21 route handlers type-check at the cost of any real
 *     column shape. The new shape restores it.
 *   - When the CLI version is upgraded, the shape can change
 *     (e.g. `Relationships` becoming a richer tuple). The
 *     migration is one of: (a) re-run `pnpm db:types` and
 *     `git diff`, or (b) bump the version in the header.
 *
 * Sprint 3.5 changes from the Sprint B2 / Sprint C shape:
 *   - 6 new tables: `programs`, `grades`, `chapters`, `sessions`,
 *     `session_grants`, `session_bookings` (migrations 14
 *     §1-§3).
 *   - `module_progress` is DROPPED. The `ModuleProgressRow`
 *     interface is retained for backwards compatibility with the
 *     `@deprecated` JSDoc references but the table is gone.
 *   - `payments` gains nullable `session_grant_id`.
 *   - `meeting_links` gains nullable `session_booking_id`.
 *   - `courses` gains nullable `program_id`, `grade_id`. The
 *     existing `level_group`, `price_cents`, `is_subscription`
 *     columns are KEPT in the DB for backwards compatibility.
 *   - 1 new trigger function: `fn_session_grants_completion`
 *     (no-op in Sprint 3.5; extension point for Sprint 5+).
 *   - 0 new enums: `enrollment_status` is REUSED for
 *     `session_grants.status` (the user-approved Q6 answer).
 *
 * Conventions:
 *   - UUID columns → `string`.
 *   - Timestamps → `string` (ISO-8601 UTC; the app renders in
 *     the user's locale).
 *   - Money → `number` (integer cents).
 *   - `numeric` / `citext` / `text` columns that Postgres may
 *     return as a JS `number` or `string` → `number | string`
 *     (the lib normalises at the boundary).
 *   - `jsonb` → `Json` (recursive JSON value).
 *   - Enums → string-literal unions (mirror the Postgres
 *     CREATE TYPE statements).
 *   - The `Relationships: []` tuple (vs the broader
 *     `GenericRelationship[]`) is required by
 *     `@supabase/postgrest-js` so the select-chain type
 *     inferrer doesn't fall through to `SelectQueryError<…>`,
 *     which is `never`.
 *
 * Sprint B2 changes from the Phase 1 stand-in:
 *   - 5 new tables: `modules`, `enrollments`, `module_progress`,
 *     `module_bookings`, `_bookings_legacy` (renamed from
 *     `bookings`).
 *   - `payments` gains nullable `enrollment_id` and
 *     `module_booking_id`; `booking_id` is re-pointed at
 *     `_bookings_legacy`.
 *   - `meeting_links` gains nullable `module_booking_id`;
 *     `booking_id` is re-pointed at `_bookings_legacy`.
 *   - `resource_grants` swaps `booking_id` for `enrollment_id`.
 *   - 3 new enums: `enrollment_status`,
 *     `module_progress_status`; `booking_status` gains
 *     `'scheduled'`.
 *   - 2 new views (none; views stay empty).
 *   - 1 new function: `fn_module_bookings_completion`,
 *     `fn_enrollments_completion` (declared in Functions for
 *     completeness, even though they are not RPCs the app
 *     calls).
 */
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

// -- Table envelopes -------------------------------------------------------
type TableInsert<T> = {
  [K in keyof T]?: T[K] | null;
};
type TableUpdate<T> = {
  [K in keyof T]?: T[K] | null;
};
type Relationships = [];

// -- Enum literals (mirror Postgres `create type … as enum`) --------------
export type UserRole = 'student' | 'admin' | 'super_admin';
export type BookingStatus =
  | 'pending_payment'
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';
export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';
export type PaymentProvider = 'stripe' | 'other';
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'incomplete'
  | 'incomplete_expired';
export type CouponKind = 'percent' | 'amount';
export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';
export type EnrollmentStatus =
  | 'pending_payment'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'refunded';
export type ModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';
// Sprint 3.5: `module_progress_status` is dropped from the
// `Enums` envelope (the `module_progress` table is gone). The
// string-literal type is kept exported for the @deprecated
// code paths in `domain.ts`. It is no longer reachable via
// `Database['public']['Enums']['module_progress_status']`.

// -- Row shapes ------------------------------------------------------------

/**
 * `public.profiles` — public-facing user data + role.
 * (Migration 02)
 */
export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  timezone: string;
  role: UserRole;
  locale: string;
  is_active: boolean;
  last_login_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.tutors` — 1:1 with a profile. Holds the Calendly
 * event type and the Zoom user id. (Migration 03)
 */
export interface TutorRow {
  id: string;
  profile_id: string;
  bio: string | null;
  headline: string | null;
  years_experience: number | null;
  hourly_rate: number | string; // numeric(10,2)
  currency: string;
  calendly_event_uri: string | null;
  zoom_user_id: string | null;
  is_published: boolean;
  rating_avg: number | string | null; // numeric(3,2)
  rating_count: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.courses` — tutoring offerings. (Migration 03)
 *
 * Sprint 3.5 changes:
 *   - Two new nullable FKs: `program_id`, `grade_id`. The
 *     existing `level_group` column is KEPT for backwards
 *     compatibility with the marketing routes; a follow-up
 *     cleanup migration drops it.
 *   - `price_cents` and `is_subscription` are KEPT in the DB
 *     for backwards compatibility. New code reads from
 *     `sessions.price_cents` (the per-session price, set by
 *     the Sprint 5 Excel import).
 */
export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  subject: string;
  level: string;
  level_group: string;
  program_id: string | null;
  grade_id: string | null;
  price_cents: number;
  currency: string;
  duration_min: number;
  is_subscription: boolean;
  is_published: boolean;
  cover_image: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.course_tutors` — many-to-many course ↔ tutor. (Migration 03)
 */
export interface CourseTutorRow {
  course_id: string;
  tutor_id: string;
  is_primary: boolean;
  created_at: string;
}

/**
 * `public._bookings_legacy` — DEPRECATED. The pre-Sprint-B2
 * `bookings` table, renamed for safety. RLS is off. New code
 * MUST NOT read this table. Will be dropped in a future
 * cleanup migration. (Migration 09 §0)
 *
 * The shape is preserved for diagnostic reads only.
 */
export interface BookingsLegacyRow {
  id: string;
  student_id: string;
  tutor_id: string;
  course_id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.payments` — one row per payment attempt. Tied to a
 * session_grant (preferred — Sprint 3.5+), an enrollment
 * (pre-Sprint-3.5), a module_booking (legacy), or a
 * `_bookings_legacy` (the legacy table). Exactly one of the
 * four FKs is set in normal use. (Migration 04 + migration
 * 09 §6 + migration 14 §4)
 */
export interface PaymentRow {
  id: string;
  enrollment_id: string | null;
  module_booking_id: string | null;
  session_grant_id: string | null;
  booking_id: string | null;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_receipt_url: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refunded_amount_cents: number | null;
  raw_payload: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.meeting_links` — one Zoom meeting per confirmed
 * session_booking (preferred — Sprint 3.5+), per confirmed
 * module_booking (legacy), or per legacy booking.
 * (Migration 04 + migration 09 §7 + migration 14 §3)
 */
export interface MeetingLinkRow {
  id: string;
  module_booking_id: string | null;
  session_booking_id: string | null;
  booking_id: string | null;
  provider: string;
  meeting_id: string;
  join_url: string;
  start_url: string | null;
  passcode: string | null;
  host_url: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.resources` — study material. Visibility is `public`,
 * `enrolled`, or `private`. (Migration 05)
 */
export interface ResourceRow {
  id: string;
  course_id: string | null;
  tutor_id: string | null;
  title: string;
  description: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  visibility: 'public' | 'enrolled' | 'private';
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `public.resource_grants` — per-enrollment access to a resource
 * (replaces the per-booking join). PK on (resource_id,
 * enrollment_id). (Migration 05 + migration 09 §8)
 */
export interface ResourceGrantRow {
  resource_id: string;
  enrollment_id: string;
  granted_at: string;
}

/**
 * `public.notifications` — in-app + sent-email mirror. (Migration 05)
 */
export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  subject: string | null;
  body: string | null;
  payload: Json;
  read_at: string | null;
  sent_at: string;
  created_at: string;
}

/**
 * `public.audit_logs` — append-only log of mutations. Populated
 * by `fn_audit_changes` triggers. (Migration 05)
 */
export interface AuditLogRow {
  id: string;
  table_name: string;
  row_id: string | null;
  action: 'insert' | 'update' | 'delete';
  actor_id: string | null;
  changes: Json;
  created_at: string;
}

/**
 * `public.subscriptions` — recurring billing. (Migration 08)
 */
export interface SubscriptionRow {
  id: string;
  student_id: string;
  course_id: string | null;
  status: SubscriptionStatus;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.coupons` — discount codes. (Migration 08)
 */
export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string | null;
  max_redemptions: number | null;
  redeemed_count: number;
  expires_at: string | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.webhook_events` — inbound-webhook idempotency log.
 * (Migration 08)
 */
export interface WebhookEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  payload: Json;
  processed: boolean;
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

/**
 * `public.n8n_executions` — n8n observability. (Migration 08)
 */
export interface N8nExecutionRow {
  id: string;
  workflow: string;
  run_id: string | null;
  status: string;
  attempts: number;
  request_id: string | null;
  payload: Json;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

/**
 * `public.n8n_dead_letters` — n8n permanent-failure queue.
 * (Migration 08)
 */
export interface N8nDeadLetterRow {
  id: string;
  workflow: string;
  original_event: Json;
  error: string;
  retry_count: number;
  resolved_at: string | null;
  created_at: string;
}

/**
 * `public.invoices` — Stripe invoice mirror. (Migration 08)
 */
export interface InvoiceRow {
  id: string;
  student_id: string;
  booking_id: string | null;
  subscription_id: string | null;
  status: InvoiceStatus;
  amount_cents: number;
  currency: string;
  stripe_invoice_id: string | null;
  pdf_url: string | null;
  issued_at: string | null;
  paid_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.modules` — pre-created pedagogical atoms of a course.
 * Each has its own Calendly event type. (Migration 09 §2)
 */
export interface ModuleRow {
  id: string;
  course_id: string;
  position: number;
  slug: string;
  title: string;
  description: string | null;
  duration_min: number;
  is_published: boolean;
  is_preview: boolean;
  calendly_event_uri: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.enrollments` — paid access to a course. The unit of
 * payment. One row per (student, course) for the active
 * enrollment. (Migration 09 §3)
 */
export interface EnrollmentRow {
  id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentStatus;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  paid_at: string | null;
  refunded_at: string | null;
  refunded_amount_cents: number;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.module_bookings` — DEPRECATED (Sprint 3.5). One row
 * per live session under the v1 hierarchy. The table is
 * KEPT in the DB but no new rows are inserted. New code uses
 * `session_bookings` (the v2 hierarchy). (Migration 09 §5)
 *
 * The shape is preserved for diagnostic reads only.
 */
export interface ModuleBookingRow {
  id: string;
  enrollment_id: string;
  module_id: string;
  tutor_id: string;
  student_id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.programs` — top of the curriculum hierarchy. The 5
 * known programs: High School, Prep School, BTS ABM, BTS
 * Optics, BTS BioALC. (Migration 14 §1)
 */
export interface ProgramRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  is_published: boolean;
  sort_order: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.grades` — OPTIONAL middle layer of the curriculum
 * hierarchy. Only the High School program has rows. (Migration
 * 14 §2)
 */
export interface GradeRow {
  id: string;
  program_id: string;
  slug: string;
  title: string;
  sort_order: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.chapters` — a pedagogical chapter of a course. Each
 * chapter groups N sessions. (Migration 14 §2)
 */
export interface ChapterRow {
  id: string;
  course_id: string;
  position: number;
  slug: string;
  title: string;
  description: string | null;
  default_duration_min: number;
  is_published: boolean;
  sort_order: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.sessions` — the atomic unit of the platform: one
 * Stripe charge, one Calendly booking, one Zoom meeting, one
 * attendance record, one progress signal. NULL `price_cents`
 * means "price TBD" (set by the Sprint 5 Excel import).
 * (Migration 14 §3)
 */
export interface SessionRow {
  id: string;
  chapter_id: string;
  position: number;
  slug: string;
  title: string;
  description: string | null;
  duration_min: number | null;
  price_cents: number | null;
  currency: string;
  is_published: boolean;
  is_preview: boolean;
  calendly_event_uri: string | null;
  sort_order: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.session_grants` — per-student × per-session payment.
 * The unit of Stripe Checkout in Sprint 3.5+. Reuses the
 * `enrollment_status` enum. (Migration 14 §2)
 */
export interface SessionGrantRow {
  id: string;
  student_id: string;
  session_id: string;
  status: EnrollmentStatus;
  stripe_session_id: string | null;
  stripe_payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  paid_at: string | null;
  refunded_at: string | null;
  refunded_amount_cents: number;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

/**
 * `public.session_bookings` — one row per live session. The
 * unit of a Zoom meeting in Sprint 3.5+. Calendly is the
 * source of truth for `scheduled_start` / `scheduled_end`.
 * (Migration 14 §3)
 */
export interface SessionBookingRow {
  id: string;
  session_grant_id: string;
  session_id: string;
  tutor_id: string;
  student_id: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  calendly_event_uri: string | null;
  calendly_invitee_uri: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  rescheduled_from: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

// -- Database envelope -----------------------------------------------------

interface Table<Row> {
  Row: Row;
  Insert: TableInsert<Row>;
  Update: TableUpdate<Row>;
  Relationships: Relationships;
}

interface View<Row> {
  Row: Row;
}

interface FunctionDef<Args, Returns> {
  Args: Args;
  Returns: Returns;
}

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow>;
      tutors: Table<TutorRow>;
      courses: Table<CourseRow>;
      course_tutors: Table<CourseTutorRow>;
      _bookings_legacy: Table<BookingsLegacyRow>;
      payments: Table<PaymentRow>;
      meeting_links: Table<MeetingLinkRow>;
      resources: Table<ResourceRow>;
      resource_grants: Table<ResourceGrantRow>;
      notifications: Table<NotificationRow>;
      audit_logs: Table<AuditLogRow>;
      subscriptions: Table<SubscriptionRow>;
      coupons: Table<CouponRow>;
      webhook_events: Table<WebhookEventRow>;
      n8n_executions: Table<N8nExecutionRow>;
      n8n_dead_letters: Table<N8nDeadLetterRow>;
      invoices: Table<InvoiceRow>;
      // Sprint 3.5 — the v1 hierarchy (modules, enrollments,
      // module_progress, module_bookings) is KEPT in the DB for
      // backwards compatibility but no new rows are inserted.
      modules: Table<ModuleRow>;
      enrollments: Table<EnrollmentRow>;
      // `module_progress` is DROPPED in Sprint 3.5 (migration 14
      // §5). The table is gone from the DB. The interface below
      // is retained for diagnostic reads only and the `Database`
      // envelope no longer references it.
      module_bookings: Table<ModuleBookingRow>;
      // Sprint 3.5 — the new hierarchy.
      programs: Table<ProgramRow>;
      grades: Table<GradeRow>;
      chapters: Table<ChapterRow>;
      sessions: Table<SessionRow>;
      session_grants: Table<SessionGrantRow>;
      session_bookings: Table<SessionBookingRow>;
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: FunctionDef<Record<string, never>, UserRole>;
      is_admin: FunctionDef<Record<string, never>, boolean>;
      is_super_admin: FunctionDef<Record<string, never>, boolean>;
      set_updated_at: FunctionDef<Record<string, never>, unknown>;
      fn_audit_changes: FunctionDef<Record<string, never>, unknown>;
      handle_new_user: FunctionDef<Record<string, never>, unknown>;
      fn_no_tutor_overlap: FunctionDef<Record<string, never>, unknown>;
      fn_block_role_self_escalation: FunctionDef<Record<string, never>, unknown>;
      fn_lock_tutor_profile_id: FunctionDef<Record<string, never>, unknown>;
      fn_block_late_cancel: FunctionDef<Record<string, never>, unknown>;
      fn_module_bookings_completion: FunctionDef<Record<string, never>, unknown>;
      fn_enrollments_completion: FunctionDef<Record<string, never>, unknown>;
      // Sprint 3.5 — the new no-op completion hook for
      // session_grants. Triggered on session_bookings updates;
      // the body is intentionally minimal in Sprint 3.5 and
      // can be extended in a later sprint without a schema
      // change.
      fn_session_grants_completion: FunctionDef<Record<string, never>, unknown>;
    };
    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
      payment_status: PaymentStatus;
      payment_provider: PaymentProvider;
      subscription_status: SubscriptionStatus;
      coupon_kind: CouponKind;
      invoice_status: InvoiceStatus;
      enrollment_status: EnrollmentStatus;
      // Sprint 3.5 — `module_progress_status` is dropped (the
      // `module_progress` table is gone). The `enrollment_status`
      // enum is REUSED for `session_grants.status` — see
      // migration 14 §2.
    };
    CompositeTypes: Record<string, Record<string, never>>;
  };
  /**
   * Marker required by `@supabase/supabase-js` ≥2.50. The
   * PostgrestQueryBuilder infers the schema from
   * `Database['__InternalSupabase']`; without this marker the
   * chain falls through to `SelectQueryError` and every column
   * access becomes `never`. The `PostgrestVersion` is the
   * version of `@supabase/postgrest-js` that produced the
   * schema. See `node_modules/@supabase/supabase-js/dist/index.d.cts`.
   */
  __InternalSupabase: {
    PostgrestVersion: '13.0.0';
  };
};
