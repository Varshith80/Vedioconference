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
 * Sprint 3.6 changes from the Sprint 3.5 shape:
 *   - 5 v1 tables DROPPED: `modules`, `enrollments`,
 *     `module_progress`, `module_bookings`, `_bookings_legacy`
 *     (migration `20260715000000_drop_v1_back_compat_tables.sql`).
 *   - The v1 row interfaces (`ModuleRow`, `EnrollmentRow`,
 *     `ModuleBookingRow`, `BookingsLegacyRow`,
 *     `ModuleProgressRow`) are removed from this file.
 *   - `payments` loses the v1 FK columns (`booking_id`,
 *     `enrollment_id`, `module_booking_id`); only the v2
 *     `session_grant_id` remains.
 *   - `meeting_links` loses the v1 FK columns (`booking_id`,
 *     `module_booking_id`); only the v2 `session_booking_id`
 *     remains.
 *   - `resource_grants` loses the v1 `enrollment_id` column;
 *     only the v2 `session_grant_id` remains.
 *   - 2 v1 functions removed: `fn_module_bookings_completion`,
 *     `fn_enrollments_completion`. `fn_enrollments_refund` is
 *     re-created as v2-only (session_grant cascade only).
 *   - 0 new tables / 0 new enums.
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
 * Sprint 3.6 note: the Sprint B2 "5 new tables" section in the
 * previous version of this file is gone with the v1 back-compat
 * migration. The Sprint 3.5 §Sprint 3.6 changelog at the top
 * of this file is the single source of truth for the table set.
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
 * `public.tutors` — STANDALONE reference records (Sprint 3.8).
 * No `profile_id` FK, no auth.users linkage, no RLS for self-read.
 * Used only for session assignment and Zoom meeting ownership.
 * (Migration 03)
 */
export interface TutorRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: 'active' | 'inactive';
  notes: string | null;
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
 * `public.tutors` is now a standalone reference table (Sprint 3.8)
 * — the previous many-to-many `course_tutors` join is removed.
 * Sessions carry their assigned tutor directly via
 * `sessions.tutor_id`. See `SessionRow.tutor_id` below.
 */

/**
 * `public.payments` — one row per payment attempt. The unit of
 * payment is the v2 `session_grant`; the `session_grant_id` FK
 * is non-null in normal use. (Migration 04 + migration 14 §4.
 * The v1 `enrollment_id` / `module_booking_id` / `booking_id`
 * columns were dropped in Sprint 3.6 with the v1 back-compat
 * migration `20260715000000_drop_v1_back_compat_tables.sql`.)
 */
export interface PaymentRow {
  id: string;
  session_grant_id: string | null;
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
 * session_booking. The v1 `module_booking_id` and `booking_id`
 * columns were dropped in Sprint 3.6 with the v1 back-compat
 * migration `20260715000000_drop_v1_back_compat_tables.sql`.
 * (Migration 04 + migration 14 §3)
 */
export interface MeetingLinkRow {
  id: string;
  session_booking_id: string | null;
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
 *
 * Sprint 3.8 — `tutor_id` column removed. Tutors are standalone
 * reference records with no authorship role. Resources are
 * uploaded by admins (via `uploaded_by`, which still points to
 * `public.profiles` for the real user that performed the upload).
 */
export interface ResourceRow {
  id: string;
  course_id: string | null;
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
 * `public.resource_grants` — per-session_grant access to a
 * resource (replaces the pre-Sprint-3.6 per-enrollment join).
 * PK on (resource_id, session_grant_id). (Migration 05 +
 * migration `20260715000000_drop_v1_back_compat_tables.sql`
 * which re-anchored the PK from `enrollment_id` to
 * `session_grant_id`.)
 */
export interface ResourceGrantRow {
  resource_id: string;
  session_grant_id: string;
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
 * `public.programs` — top of the curriculum hierarchy.
 * (Migration 14 §1)
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
  // Sprint 3.8 — assigned-tutor FK. NULLable so existing
  // Excel-imported sessions stay valid until the admin
  // backfills via /admin/sessions/[id]. See
  // supabase/migrations/20260719000001_sessions_tutor_id.sql.
  tutor_id: string | null;
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
      // Sprint 3.6 — the v1 hierarchy is DROPPED with migration
      // `20260715000000_drop_v1_back_compat_tables.sql`. The
      // `modules`, `enrollments`, `module_bookings`,
      // `module_progress`, and `_bookings_legacy` tables are
      // gone from the DB. The v2 hierarchy below is the only
      // curriculum surface.
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
      // Sprint 3.8 — `fn_lock_tutor_profile_id` is REMOVED.
      // Tutors are standalone (no `profile_id` column), so the
      // immutability trigger has no column to guard.
      fn_block_late_cancel: FunctionDef<Record<string, never>, unknown>;
      // Sprint 3.5 — the no-op completion hook for
      // session_grants. Triggered on session_bookings updates;
      // the body is intentionally minimal in Sprint 3.5 and
      // can be extended in a later sprint without a schema
      // change.
      fn_session_grants_completion: FunctionDef<Record<string, never>, unknown>;
      // Sprint 3.6 — the v2-only refund cascade function. Replaces
      // the Sprint C `fn_enrollments_refund` (the v1 branch is
      // dropped; the v2 session_grant branch is preserved).
      fn_enrollments_refund: FunctionDef<Record<string, never>, unknown>;
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
      // Sprint 3.6 — `module_progress_status` is gone (the
      // `module_progress` table is dropped).
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
