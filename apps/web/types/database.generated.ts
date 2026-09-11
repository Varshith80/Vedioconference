export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          query?: string
          operationName?: string
          extensions?: Json
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          row_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes: Json
          created_at?: string
          id?: string
          row_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          row_id?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          course_id: string
          created_at: string
          default_duration_min: number
          description: string | null
          id: string
          is_published: boolean
          metadata: Json
          position: number
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          default_duration_min?: number
          description?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          position: number
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          default_duration_min?: number
          description?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          position?: number
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          amount_off_cents: number | null
          code: string
          created_at: string
          currency: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_redemptions: number | null
          metadata: Json
          percent_off: number | null
          redeemed_count: number
          updated_at: string
        }
        Insert: {
          amount_off_cents?: number | null
          code: string
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_redemptions?: number | null
          metadata?: Json
          percent_off?: number | null
          redeemed_count?: number
          updated_at?: string
        }
        Update: {
          amount_off_cents?: number | null
          code?: string
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_redemptions?: number | null
          metadata?: Json
          percent_off?: number | null
          redeemed_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          cover_image: string | null
          created_at: string
          currency: string
          description: string | null
          duration_min: number
          grade_id: string | null
          id: string
          is_published: boolean
          is_subscription: boolean
          level: string
          level_group: string
          metadata: Json
          price_cents: number
          program_id: string | null
          slug: string
          subject: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number
          grade_id?: string | null
          id?: string
          is_published?: boolean
          is_subscription?: boolean
          level: string
          level_group?: string
          metadata?: Json
          price_cents: number
          program_id?: string | null
          slug: string
          subject: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number
          grade_id?: string | null
          id?: string
          is_published?: boolean
          is_subscription?: boolean
          level?: string
          level_group?: string
          metadata?: Json
          price_cents?: number
          program_id?: string | null
          slug?: string
          subject?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          program_id: string
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          program_id: string
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          program_id?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          booking_id: string | null
          created_at: string
          currency: string
          id: string
          issued_at: string | null
          metadata: Json
          paid_at: string | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id: string | null
          student_id: string
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          metadata?: Json
          paid_at?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          student_id: string
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string | null
          metadata?: Json
          paid_at?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          stripe_invoice_id?: string | null
          student_id?: string
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_links: {
        Row: {
          created_at: string
          host_url: string | null
          id: string
          join_url: string
          meeting_id: string
          metadata: Json
          passcode: string | null
          provider: string
          session_booking_id: string | null
          start_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          host_url?: string | null
          id?: string
          join_url: string
          meeting_id: string
          metadata?: Json
          passcode?: string | null
          provider?: string
          session_booking_id?: string | null
          start_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          host_url?: string | null
          id?: string
          join_url?: string
          meeting_id?: string
          metadata?: Json
          passcode?: string | null
          provider?: string
          session_booking_id?: string | null
          start_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_links_session_booking_id_fkey"
            columns: ["session_booking_id"]
            isOneToOne: false
            referencedRelation: "session_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_dead_letters: {
        Row: {
          created_at: string
          error: string
          id: string
          original_event: Json
          resolved_at: string | null
          retry_count: number
          workflow: string
        }
        Insert: {
          created_at?: string
          error: string
          id?: string
          original_event: Json
          resolved_at?: string | null
          retry_count?: number
          workflow: string
        }
        Update: {
          created_at?: string
          error?: string
          id?: string
          original_event?: Json
          resolved_at?: string | null
          retry_count?: number
          workflow?: string
        }
        Relationships: []
      }
      n8n_executions: {
        Row: {
          attempts: number
          duration_ms: number | null
          error: string | null
          finished_at: string | null
          id: string
          payload: Json
          request_id: string | null
          run_id: string | null
          started_at: string
          status: string
          workflow: string
        }
        Insert: {
          attempts?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: Json
          request_id?: string | null
          run_id?: string | null
          started_at?: string
          status: string
          workflow: string
        }
        Update: {
          attempts?: number
          duration_ms?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          payload?: Json
          request_id?: string | null
          run_id?: string | null
          started_at?: string
          status?: string
          workflow?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          sent_at: string
          subject: string | null
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string
          subject?: string | null
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          sent_at?: string
          subject?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          paid_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          raw_payload: Json
          refunded_amount_cents: number | null
          refunded_at: string | null
          session_grant_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_receipt_url: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          raw_payload?: Json
          refunded_amount_cents?: number | null
          refunded_at?: string | null
          session_grant_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          raw_payload?: Json
          refunded_amount_cents?: number | null
          refunded_at?: string | null
          session_grant_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_receipt_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_session_grant_id_fkey"
            columns: ["session_grant_id"]
            isOneToOne: false
            referencedRelation: "session_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          locale: string
          metadata: Json
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          locale?: string
          metadata?: Json
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          locale?: string
          metadata?: Json
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          metadata: Json
          slug: string
          sort_order: number
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          slug: string
          sort_order?: number
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          metadata?: Json
          slug?: string
          sort_order?: number
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      resource_grants: {
        Row: {
          granted_at: string
          resource_id: string
          session_grant_id: string
        }
        Insert: {
          granted_at?: string
          resource_id: string
          session_grant_id: string
        }
        Update: {
          granted_at?: string
          resource_id?: string
          session_grant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_grants_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_grants_session_grant_id_fkey"
            columns: ["session_grant_id"]
            isOneToOne: false
            referencedRelation: "session_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          course_id: string | null
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          title: string
          tutor_id: string | null
          updated_at: string
          uploaded_by: string | null
          visibility: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          title: string
          tutor_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          title?: string
          tutor_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "resources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resources_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      session_bookings: {
        Row: {
          calendly_event_uri: string | null
          calendly_invitee_uri: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          id: string
          metadata: Json
          notes: string | null
          rescheduled_from: string | null
          scheduled_end: string
          scheduled_start: string
          session_grant_id: string
          session_id: string
          status: Database["public"]["Enums"]["booking_status"]
          student_id: string
          timezone: string
          tutor_id: string
          updated_at: string
        }
        Insert: {
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          rescheduled_from?: string | null
          scheduled_end: string
          scheduled_start: string
          session_grant_id: string
          session_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id: string
          timezone?: string
          tutor_id: string
          updated_at?: string
        }
        Update: {
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          notes?: string | null
          rescheduled_from?: string | null
          scheduled_end?: string
          scheduled_start?: string
          session_grant_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id?: string
          timezone?: string
          tutor_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_bookings_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "session_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_session_grant_id_fkey"
            columns: ["session_grant_id"]
            isOneToOne: false
            referencedRelation: "session_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_bookings_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      session_grants: {
        Row: {
          amount_cents: number
          cancelled_at: string | null
          cancelled_reason: string | null
          completed_at: string | null
          consumed_credits: number
          created_at: string
          currency: string
          expires_at: string | null
          grant_type: Database["public"]["Enums"]["grant_type"]
          id: string
          metadata: Json
          paid_at: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          session_id: string | null
          status: Database["public"]["Enums"]["enrollment_status"]
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          student_id: string
          total_credits: number | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          consumed_credits?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          grant_type?: Database["public"]["Enums"]["grant_type"]
          id?: string
          metadata?: Json
          paid_at?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          student_id: string
          total_credits?: number | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          cancelled_at?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          consumed_credits?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          grant_type?: Database["public"]["Enums"]["grant_type"]
          id?: string
          metadata?: Json
          paid_at?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          session_id?: string | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          student_id?: string
          total_credits?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_grants_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_grants_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          calendly_event_uri: string | null
          chapter_id: string
          created_at: string
          currency: string
          description: string | null
          duration_min: number | null
          id: string
          is_preview: boolean
          is_published: boolean
          metadata: Json
          position: number
          price_cents: number | null
          slug: string
          sort_order: number
          title: string
          tutor_id: string | null
          updated_at: string
        }
        Insert: {
          calendly_event_uri?: string | null
          chapter_id: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          is_preview?: boolean
          is_published?: boolean
          metadata?: Json
          position: number
          price_cents?: number | null
          slug: string
          sort_order?: number
          title: string
          tutor_id?: string | null
          updated_at?: string
        }
        Update: {
          calendly_event_uri?: string | null
          chapter_id?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_min?: number | null
          id?: string
          is_preview?: boolean
          is_published?: boolean
          metadata?: Json
          position?: number
          price_cents?: number | null
          slug?: string
          sort_order?: number
          title?: string
          tutor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          course_id: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          metadata: Json
          session_grant_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          course_id?: string | null
          created_at?: string
          current_period_end: string
          current_period_start: string
          id?: string
          metadata?: Json
          session_grant_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          course_id?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          metadata?: Json
          session_grant_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_session_grant_id_fkey"
            columns: ["session_grant_id"]
            isOneToOne: false
            referencedRelation: "session_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tutors: {
        Row: {
          calendly_event_uri: string | null
          created_at: string
          currency: string
          email: string | null
          full_name: string
          id: string
          metadata: Json
          notes: string | null
          phone: string | null
          rating_count: number
          status: string
          updated_at: string
          years_experience: number | null
          zoom_user_id: string | null
        }
        Insert: {
          calendly_event_uri?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name: string
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          rating_count?: number
          status?: string
          updated_at?: string
          years_experience?: number | null
          zoom_user_id?: string | null
        }
        Update: {
          calendly_event_uri?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name?: string
          id?: string
          metadata?: Json
          notes?: string | null
          phone?: string | null
          rating_count?: number
          status?: string
          updated_at?: string
          years_experience?: number | null
          zoom_user_id?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string
          id: string
          payload: Json
          processed: boolean
          processed_at: string | null
          provider: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          payload: Json
          processed?: boolean
          processed_at?: string | null
          provider: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      citext:
        | {
            Args: {
              "": boolean
            }
            Returns: string
          }
        | {
            Args: {
              "": string
            }
            Returns: string
          }
        | {
            Args: {
              "": unknown
            }
            Returns: string
          }
      citext_hash: {
        Args: {
          "": string
        }
        Returns: number
      }
      citextin: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextout: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      citextrecv: {
        Args: {
          "": unknown
        }
        Returns: string
      }
      citextsend: {
        Args: {
          "": string
        }
        Returns: string
      }
      current_user_role: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_super_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      booking_status:
        | "pending_payment"
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      coupon_kind: "percent" | "amount"
      enrollment_status:
        | "pending_payment"
        | "active"
        | "completed"
        | "cancelled"
        | "refunded"
      grant_type: "individual" | "pack" | "subscription"
      invoice_status: "draft" | "open" | "paid" | "void" | "uncollectible"
      payment_provider: "stripe" | "other"
      payment_status:
        | "pending"
        | "succeeded"
        | "failed"
        | "refunded"
        | "partially_refunded"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "incomplete"
        | "incomplete_expired"
      user_role: "student" | "admin" | "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: {
          expected_operations: string[]
        }
        Returns: boolean
      }
      allow_only_operation: {
        Args: {
          expected_operation: string
        }
        Returns: boolean
      }
      can_insert_object: {
        Args: {
          bucketid: string
          metadata: Json
          owner: string
          name: string
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_common_prefix: {
        Args: {
          p_delimiter: string
          p_prefix: string
          p_key: string
        }
        Returns: string
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          next_upload_token?: string
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
        }
        Returns: {
          id: string
          key: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          prefix_param: string
          sort_order?: string
          next_token?: string
          start_after?: string
          max_keys?: number
          delimiter_param: string
          _bucket_id: string
        }
        Returns: {
          last_accessed_at: string
          created_at: string
          updated_at: string
          metadata: Json
          id: string
          name: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_start_after: string
          p_prefix: string
          p_bucket_id: string
          p_limit: number
          p_level: number
          p_sort_order: string
          p_sort_column: string
          p_sort_column_after: string
        }
        Returns: {
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
          key: string
          name: string
          id: string
        }[]
      }
      search_v2: {
        Args: {
          prefix: string
          bucket_name: string
          limits?: number
          levels?: number
          start_after?: string
          sort_order?: string
          sort_column?: string
          sort_column_after?: string
        }
        Returns: {
          created_at: string
          last_accessed_at: string
          metadata: Json
          key: string
          name: string
          id: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

