import type { Database } from './database.generated';

export type Course   = Database['public']['Tables']['courses']['Row'];
export type Tutor    = Database['public']['Tables']['tutors']['Row'];
export type Profile  = Database['public']['Tables']['profiles']['Row'];
export type Booking  = Database['public']['Tables']['bookings']['Row'];
export type Payment  = Database['public']['Tables']['payments']['Row'];
export type Resource = Database['public']['Tables']['resources']['Row'];
export type MeetingLink    = Database['public']['Tables']['meeting_links']['Row'];
export type Notification   = Database['public']['Tables']['notifications']['Row'];

export type BookingStatus   = Database['public']['Enums']['booking_status'];
export type PaymentStatus   = Database['public']['Enums']['payment_status'];
export type UserRole        = Database['public']['Enums']['user_role'];
