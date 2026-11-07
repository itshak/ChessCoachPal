export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AttendanceStatus =
  | "attended"
  | "teacher_cancel"
  | "student_cancel"
  | "no_show";
export type EmailRecipients = "primary" | "secondary" | "both";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PaymentMethod = "manual" | "stripe";
export type InvoiceItemKind = "lesson" | "travel" | "credit_package";
export type InvoiceCadence = "monthly" | "manual";
export type PaymentProvider = "manual" | "stripe";
export type RateBasis = "per_lesson" | "per_hour";
export type RsvpStatus = "pending" | "yes" | "no" | "maybe";

export interface Database {
  public: {
    Tables: {
      teachers: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          created_at: string;
          hosted_plan: string;
          trial_ends_at: string | null;
          gifted_until: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_cancel_at: string | null;
          founding_number: number | null;
          onboarding_tour_completed_at: string | null;
          calendar_token: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          created_at?: string;
          hosted_plan?: string;
          trial_ends_at?: string | null;
          gifted_until?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_cancel_at?: string | null;
          founding_number?: number | null;
          onboarding_tour_completed_at?: string | null;
          calendar_token?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_url?: string | null;
          hosted_plan?: string;
          trial_ends_at?: string | null;
          gifted_until?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_cancel_at?: string | null;
          founding_number?: number | null;
          onboarding_tour_completed_at?: string | null;
          calendar_token?: string;
        };
      };
      students: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          parent_contact: string | null;
          guardian_id: string | null;
          teacher_notes: string;
          level: string | null;
          birthdate: string | null;
          practice_start_date: string | null;
          default_rate_cents: number | null;
          travel_fee_cents: number | null;
          archived_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          parent_contact?: string | null;
          guardian_id?: string | null;
          teacher_notes?: string;
          level?: string | null;
          birthdate?: string | null;
          practice_start_date?: string | null;
          default_rate_cents?: number | null;
          travel_fee_cents?: number | null;
          archived_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          parent_contact?: string | null;
          guardian_id?: string | null;
          teacher_notes?: string;
          level?: string | null;
          birthdate?: string | null;
          practice_start_date?: string | null;
          default_rate_cents?: number | null;
          travel_fee_cents?: number | null;
          archived_at?: string | null;
        };
      };
      guardians: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          family_name: string | null;
          email: string | null;
          phone: string | null;
          secondary_name: string | null;
          secondary_email: string | null;
          secondary_phone: string | null;
          email_recipients: EmailRecipients;
          portal_token: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          family_name?: string | null;
          email?: string | null;
          phone?: string | null;
          secondary_name?: string | null;
          secondary_email?: string | null;
          secondary_phone?: string | null;
          email_recipients?: EmailRecipients;
          portal_token: string;
          created_at?: string;
        };
        Update: {
          name?: string;
          family_name?: string | null;
          email?: string | null;
          phone?: string | null;
          secondary_name?: string | null;
          secondary_email?: string | null;
          secondary_phone?: string | null;
          email_recipients?: EmailRecipients;
          portal_token?: string;
        };
      };
      studio_policies: {
        Row: {
          teacher_id: string;
          studio_name: string;
          studio_website: string;
          studio_contact: string;
          studio_info: string;
          lesson_label: string;
          timezone: string;
          lesson_duration_options: number[];
          cancellation_window_hours: number;
          timely_cancel_earns_makeup: boolean;
          late_cancel_earns_makeup: boolean;
          no_show_earns_makeup: boolean;
          teacher_cancel_earns_makeup: boolean;
          makeup_credit_expiry_days: number | null;
          bill_attended: boolean;
          bill_no_show: boolean;
          bill_teacher_cancel: boolean;
          bill_timely_student_cancel: boolean;
          bill_late_student_cancel: boolean;
          bill_makeup: boolean;
          default_rate_cents: number | null;
          duration_rate_cents: Json;
          travel_fee_cents: number | null;
          rate_basis: RateBasis;
          currency: string;
          invoice_cadence: InvoiceCadence;
          payment_instructions: string;
          payment_qr_code: string | null;
          payment_provider: PaymentProvider;
          stripe_secret_key: string | null;
          stripe_publishable_key: string | null;
          stripe_webhook_secret: string | null;
          notify_in_app: boolean;
          notify_email_portal_cancel: boolean;
          notify_email_invoice_paid: boolean;
          bcc_family_emails: boolean;
          bcc_email: string | null;
          ai_provider: "none" | "openai" | "anthropic";
          ai_api_key: string | null;
          updated_at: string;
        };
        Insert: {
          teacher_id: string;
          studio_name?: string;
          studio_website?: string;
          studio_contact?: string;
          studio_info?: string;
          lesson_label?: string;
          timezone?: string;
          lesson_duration_options?: number[];
          cancellation_window_hours?: number;
          timely_cancel_earns_makeup?: boolean;
          late_cancel_earns_makeup?: boolean;
          no_show_earns_makeup?: boolean;
          teacher_cancel_earns_makeup?: boolean;
          makeup_credit_expiry_days?: number | null;
          bill_attended?: boolean;
          bill_no_show?: boolean;
          bill_teacher_cancel?: boolean;
          bill_timely_student_cancel?: boolean;
          bill_late_student_cancel?: boolean;
          bill_makeup?: boolean;
          default_rate_cents?: number | null;
          duration_rate_cents?: Json;
          travel_fee_cents?: number | null;
          rate_basis?: RateBasis;
          currency?: string;
          invoice_cadence?: InvoiceCadence;
          payment_instructions?: string;
          payment_qr_code?: string | null;
          payment_provider?: PaymentProvider;
          stripe_secret_key?: string | null;
          stripe_publishable_key?: string | null;
          stripe_webhook_secret?: string | null;
          notify_in_app?: boolean;
          notify_email_portal_cancel?: boolean;
          notify_email_invoice_paid?: boolean;
          bcc_family_emails?: boolean;
          bcc_email?: string | null;
          ai_provider?: "none" | "openai" | "anthropic";
          ai_api_key?: string | null;
        };
        Update: {
          studio_name?: string;
          studio_website?: string;
          studio_contact?: string;
          studio_info?: string;
          lesson_label?: string;
          timezone?: string;
          lesson_duration_options?: number[];
          cancellation_window_hours?: number;
          timely_cancel_earns_makeup?: boolean;
          late_cancel_earns_makeup?: boolean;
          no_show_earns_makeup?: boolean;
          teacher_cancel_earns_makeup?: boolean;
          makeup_credit_expiry_days?: number | null;
          bill_attended?: boolean;
          bill_no_show?: boolean;
          bill_teacher_cancel?: boolean;
          bill_timely_student_cancel?: boolean;
          bill_late_student_cancel?: boolean;
          bill_makeup?: boolean;
          default_rate_cents?: number | null;
          duration_rate_cents?: Json;
          travel_fee_cents?: number | null;
          rate_basis?: RateBasis;
          currency?: string;
          invoice_cadence?: InvoiceCadence;
          payment_instructions?: string;
          payment_qr_code?: string | null;
          payment_provider?: PaymentProvider;
          stripe_secret_key?: string | null;
          stripe_publishable_key?: string | null;
          stripe_webhook_secret?: string | null;
          notify_in_app?: boolean;
          notify_email_portal_cancel?: boolean;
          notify_email_invoice_paid?: boolean;
          bcc_family_emails?: boolean;
          bcc_email?: string | null;
          ai_provider?: "none" | "openai" | "anthropic";
          ai_api_key?: string | null;
        };
      };
      lesson_slots: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          day_of_week: number;
          start_time: string;
          duration_minutes: number;
          start_date: string;
          end_date: string | null;
          active: boolean;
          rate_cents: number | null;
          is_home_visit: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id: string;
          day_of_week: number;
          start_time: string;
          duration_minutes?: number;
          start_date?: string;
          end_date?: string | null;
          active?: boolean;
          rate_cents?: number | null;
          is_home_visit?: boolean;
        };
        Update: {
          day_of_week?: number;
          start_time?: string;
          duration_minutes?: number;
          start_date?: string;
          end_date?: string | null;
          active?: boolean;
          rate_cents?: number | null;
          is_home_visit?: boolean;
        };
      };
      invoices: {
        Row: {
          id: string;
          teacher_id: string;
          guardian_id: string;
          period_start: string;
          period_end: string;
          status: InvoiceStatus;
          subtotal_cents: number;
          currency: string;
          sent_at: string | null;
          paid_at: string | null;
          payment_method: PaymentMethod | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          stripe_checkout_url: string | null;
          notes: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          guardian_id: string;
          period_start: string;
          period_end: string;
          status?: InvoiceStatus;
          subtotal_cents?: number;
          currency?: string;
          sent_at?: string | null;
          paid_at?: string | null;
          payment_method?: PaymentMethod | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_checkout_url?: string | null;
          notes?: string;
        };
        Update: {
          status?: InvoiceStatus;
          subtotal_cents?: number;
          currency?: string;
          sent_at?: string | null;
          paid_at?: string | null;
          payment_method?: PaymentMethod | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          stripe_checkout_url?: string | null;
          notes?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          lesson_id: string | null;
          kind: InvoiceItemKind;
          description: string;
          quantity: number;
          unit_cents: number;
          amount_cents: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          lesson_id?: string | null;
          kind?: InvoiceItemKind;
          description: string;
          quantity?: number;
          unit_cents: number;
          amount_cents: number;
          sort_order?: number;
        };
        Update: {
          lesson_id?: string | null;
          description?: string;
          quantity?: number;
          unit_cents?: number;
          amount_cents?: number;
          sort_order?: number;
        };
      };
      credit_packages: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          invoice_id: string;
          credits: number;
          duration_minutes: number;
          price_cents: number;
          starts_on: string;
          expires_on: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id: string;
          invoice_id: string;
          credits: number;
          duration_minutes: number;
          price_cents: number;
          starts_on: string;
          expires_on?: string | null;
        };
        Update: {
          expires_on?: string | null;
        };
      };
      credit_redemptions: {
        Row: {
          id: string;
          teacher_id: string;
          package_id: string;
          lesson_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          package_id: string;
          lesson_id: string;
        };
        Update: Record<string, never>;
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          amount_cents: number;
          method: PaymentMethod;
          external_id: string | null;
          recorded_at: string;
          note: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          amount_cents: number;
          method: PaymentMethod;
          external_id?: string | null;
          recorded_at?: string;
          note?: string;
        };
        Update: {
          amount_cents?: number;
          method?: PaymentMethod;
          external_id?: string | null;
          note?: string;
        };
      };
      lessons: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          slot_id: string | null;
          lesson_date: string;
          starts_at: string;
          duration_minutes: number;
          makeup_for: string | null;
          is_home_visit: boolean;
          rescheduled_from_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          student_id: string;
          slot_id?: string | null;
          lesson_date: string;
          starts_at: string;
          duration_minutes: number;
          makeup_for?: string | null;
          is_home_visit?: boolean;
          rescheduled_from_date?: string | null;
        };
        Update: {
          lesson_date?: string;
          starts_at?: string;
          duration_minutes?: number;
          makeup_for?: string | null;
          is_home_visit?: boolean;
          rescheduled_from_date?: string | null;
        };
      };
      attendance: {
        Row: {
          id: string;
          lesson_id: string;
          status: AttendanceStatus;
          notice_at: string | null;
          cancel_note: string;
          marked_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          status: AttendanceStatus;
          notice_at?: string | null;
          cancel_note?: string;
          marked_at?: string;
        };
        Update: {
          status?: AttendanceStatus;
          notice_at?: string | null;
          cancel_note?: string;
          marked_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          teacher_id: string;
          type: "portal_cancel" | "invoice_paid" | "event_rsvp" | "welcome";
          title: string;
          body: string;
          href: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          type: "portal_cancel" | "invoice_paid" | "event_rsvp" | "welcome";
          title: string;
          body?: string;
          href?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
          title?: string;
          body?: string;
          href?: string | null;
        };
      };
      push_subscriptions: {
        Row: {
          id: string;
          teacher_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_seen_at?: string;
        };
        Update: {
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          last_seen_at?: string;
        };
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
        };
      };
      lesson_notes: {
        Row: {
          id: string;
          lesson_id: string;
          body: string;
          private_body: string;
          shared_with_parent: boolean;
          emailed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_id: string;
          body?: string;
          private_body?: string;
          shared_with_parent?: boolean;
          emailed_at?: string | null;
        };
        Update: {
          body?: string;
          private_body?: string;
          shared_with_parent?: boolean;
          emailed_at?: string | null;
        };
      };
      events: {
        Row: {
          id: string;
          teacher_id: string;
          title: string;
          description: string;
          location: string;
          starts_at: string;
          ends_at: string | null;
          send_reminder: boolean;
          reminder_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          title: string;
          description?: string;
          location?: string;
          starts_at: string;
          ends_at?: string | null;
          send_reminder?: boolean;
          reminder_sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string;
          location?: string;
          starts_at?: string;
          ends_at?: string | null;
          send_reminder?: boolean;
          reminder_sent_at?: string | null;
          updated_at?: string;
        };
      };
      event_students: {
        Row: {
          id: string;
          event_id: string;
          student_id: string;
          repertoire: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          event_id: string;
          student_id: string;
          repertoire?: string;
          sort_order?: number;
        };
        Update: {
          repertoire?: string;
          sort_order?: number;
        };
      };
      event_rsvps: {
        Row: {
          id: string;
          event_id: string;
          guardian_id: string;
          status: RsvpStatus;
          party_size: number | null;
          note: string;
          responded_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          guardian_id: string;
          status?: RsvpStatus;
          party_size?: number | null;
          note?: string;
          responded_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: RsvpStatus;
          party_size?: number | null;
          note?: string;
          responded_at?: string | null;
        };
      };
    };
    Enums: {
      rsvp_status: RsvpStatus;
    };
  };
}
