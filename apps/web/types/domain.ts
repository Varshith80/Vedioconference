/**
 * Domain types — the strongly-typed shapes used by services and
 * components. These are derived from the SQL schema in
 * `supabase/migrations/`. Until `pnpm db:types` runs (which
 * regenerates `database.generated.ts` from the live database),
 * services cast their Supabase rows to these types at the
 * boundary (see `services/courses.ts`, `services/tutors.ts`).
 *
 * The Database type in `database.generated.ts` is intentionally
 * permissive (`Record<string, unknown>`) so that the 21 Phase-1
 * route handlers which do not import domain types keep
 * type-checking. Once the generated types land, the casts can be
 * removed and the domain types can be replaced by
 * `Database['public']['Tables']['courses']['Row']`, etc.
 */
import type { Database } from './database.generated';

// -- Enums (mirror Supabase enums) ----------------------------------------
export type BookingStatus =
  | 'pending_payment'
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

export type UserRole = 'student' | 'admin' | 'super_admin';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export type CouponKind = 'percent' | 'amount' | 'free_session';

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export type PaymentProvider = 'stripe' | 'other';

// -- Row types -------------------------------------------------------------
export interface Profile {
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
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Tutor {
  id: string;
  profile_id: string;
  bio: string | null;
  headline: string | null;
  years_experience: number | null;
  hourly_rate: number | string | null; // numeric(10,2) – may come as string
  currency: string;
  calendly_event_uri: string | null;
  zoom_user_id: string | null;
  is_published: boolean;
  rating_avg: number | string | null; // numeric(3,2)
  rating_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  subject: string;
  level: string;
  level_group: 'high_school' | 'preparatory';
  price_cents: number;
  currency: string;
  duration_min: number;
  is_subscription: boolean;
  is_published: boolean;
  cover_image: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CourseTutor {
  course_id: string;
  tutor_id: string;
  is_primary: boolean;
  created_at: string;
}

export interface Booking {
  id: string;
  student_id: string;
  tutor_id: string;
  course_id: string | null;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  meeting_url: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  provider: PaymentProvider;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  course_id: string | null;
  title: string;
  description: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingLink {
  id: string;
  booking_id: string;
  provider: 'zoom' | 'meet' | 'other';
  url: string;
  expires_at: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// Re-export Database for any caller that needs it; the cast at the
// service boundary is the only place it is used.
export type { Database };
