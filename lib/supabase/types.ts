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
export type SessionAttendanceStatus = "present" | "late" | "absent" | "excused" | "student_cancelled" | "teacher_cancelled";
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

      session_amendment_events: {
        Row: {id:string;teacher_id:string;session_id:string;
          previous_state:Json;next_state:Json;actor_id:string|null;
          source:"authenticated"|"service";changed_at:string};
        Insert: {id?:string;teacher_id:string;session_id:string;
          previous_state:Json;next_state:Json;actor_id?:string|null;
          source:"authenticated"|"service";changed_at?:string};
        Update: never;
      };
      // ADR-0019 reviewed cross-domain schema contracts; trusted writes only.
      rating_providers: {
        Row: {code:string;provider_kind:"online"|"federation";display_name:string;registry_revision:number;active:boolean;created_at:string};
        Insert: {code:string;provider_kind:"online"|"federation";display_name:string;registry_revision?:number;active?:boolean;created_at?:string};
        Update: never;
      };
      rating_categories: {
        Row: {provider_code:string;code:string;display_name:string;registry_revision:number;active:boolean;created_at:string};
        Insert: {provider_code:string;code:string;display_name:string;registry_revision?:number;active?:boolean;created_at?:string};
        Update: never;
      };
      slot_occurrence_exceptions: {
        Row: {id:string;teacher_id:string;slot_id:string;original_occurrence_on:string;
          action:"cancel"|"reschedule"|"override";revised_starts_at:string|null;
          revised_timezone:string|null;revised_duration_minutes:number|null;
          session_id:string|null;approved_by:string;approved_at:string;
          reason:string;request_id:string;revision:number;revoked_at:string|null;revoked_by:string|null;revocation_request_id:string|null;created_at:string};
        Insert: {id?:string;teacher_id:string;slot_id:string;original_occurrence_on:string;
          action:"cancel"|"reschedule"|"override";revised_starts_at?:string|null;
          revised_timezone?:string|null;revised_duration_minutes?:number|null;
          session_id?:string|null;approved_by:string;approved_at?:string;
          reason:string;request_id:string;revision?:number;revoked_at?:string|null;revoked_by?:string|null;revocation_request_id?:string|null;created_at?:string};
        Update: never;
      };
      report_publications: {
        Row: {id:string;teacher_id:string;student_id:string|null;workplace_id:string|null;
          snapshot_digest:string;snapshot_storage_ref:string;output_locale:string;
          approved_by:string;approved_at:string;request_id:string;revision:number;
          superseded_by:string|null;revoked_at:string|null;created_at:string};
        Insert: {id?:string;teacher_id:string;student_id?:string|null;workplace_id?:string|null;
          snapshot_digest:string;snapshot_storage_ref:string;output_locale:string;
          approved_by:string;approved_at:string;request_id:string;revision?:number;
          superseded_by?:string|null;revoked_at?:string|null;created_at?:string};
        Update: never;
      };
      report_publication_audiences: {
        Row: {publication_id:string;portal_grant_id:string;teacher_id:string;
          approved_by:string;approved_at:string;revoked_at:string|null;request_id:string};
        Insert: {publication_id:string;portal_grant_id:string;teacher_id:string;
          approved_by:string;approved_at?:string;revoked_at?:string|null;request_id:string};
        Update: never;
      };
      // Teacher-verifiable evidence distinct from material delivery and ratings.
      chess_observations: {
        Row: {id:string;teacher_id:string;student_id:string;session_id:string|null;
          category_id:string;observation:string;observed_at:string;
          source:"teacher"|"agent";verified_at:string|null;verified_by:string|null;
          request_id:string|null;created_at:string;updated_at:string;
          learning_stage:"introduced"|"practiced"|"demonstrated"|"needs_review"|null};
        Insert: {id?:string;teacher_id:string;student_id:string;session_id?:string|null;
          category_id:string;observation:string;observed_at?:string;
          source:"teacher"|"agent";verified_at?:string|null;verified_by?:string|null;
          request_id?:string|null;created_at?:string;updated_at?:string;
          learning_stage?:"introduced"|"practiced"|"demonstrated"|"needs_review"|null};
        Update: Partial<Database["public"]["Tables"]["chess_observations"]["Insert"]>;
      };
      material_teaching_evidence: {
        Row: {id:string;teacher_id:string;student_id:string;workplace_id:string|null;
          session_id:string|null;material_id:string;stage:"assigned"|"taught"|"completed";
          occurred_on:string;note:string;request_id:string;created_at:string;
          updated_at:string;voided_at:string|null;void_reason:string|null;
          learning_stage:"introduced"|"practiced"|"demonstrated"|"needs_review"|null;
          stage_verified_at:string|null;stage_verified_by:string|null};
        Insert: {id?:string;teacher_id:string;student_id:string;workplace_id?:string|null;
          session_id?:string|null;material_id:string;stage:"assigned"|"taught"|"completed";
          occurred_on:string;note?:string;request_id:string;created_at?:string;
          updated_at?:string;voided_at?:string|null;void_reason?:string|null;
          learning_stage?:"introduced"|"practiced"|"demonstrated"|"needs_review"|null;
          stage_verified_at?:string|null;stage_verified_by?:string|null};
        Update: Partial<Database["public"]["Tables"]["material_teaching_evidence"]["Insert"]>;
      };

      // ADR-0019 schema-only foundation. Trusted platform writes only.
      capability_definitions: {
        Row: {key:string;kind:"boolean"|"integer_limit";unit:string|null;security_class:"teacher"|"operator";definition_version:number;active:boolean;created_at:string};
        Insert: {key:string;kind:"boolean"|"integer_limit";unit?:string|null;security_class?:"teacher"|"operator";definition_version?:number;active?:boolean;created_at?:string};
        Update: never;
      };
      plan_versions: {
        Row: {id:string;code:string;version:number;lifecycle:"draft"|"published"|"retired";effective_at:string|null;retired_at:string|null;priority:number;created_at:string};
        Insert: {id?:string;code:string;version:number;lifecycle?:"draft"|"published"|"retired";effective_at?:string|null;retired_at?:string|null;priority?:number;created_at?:string};
        Update: never;
      };
      plan_capabilities: {
        Row: {plan_version_id:string;capability_key:string;capability_kind:"boolean"|"integer_limit";boolean_value:boolean|null;integer_value:number|null;unlimited:boolean};
        Insert: {plan_version_id:string;capability_key:string;capability_kind:"boolean"|"integer_limit";boolean_value?:boolean|null;integer_value?:number|null;unlimited?:boolean};
        Update: never;
      };
      teacher_entitlement_state: {
        Row: {teacher_id:string;baseline_plan_version_id:string|null;revision:number;active_student_count:number;active_professional_workplace_count:number;evaluated_at:string|null;created_at:string;updated_at:string};
        Insert: {teacher_id:string;baseline_plan_version_id?:string|null;revision?:number;active_student_count?:number;active_professional_workplace_count?:number;evaluated_at?:string|null;created_at?:string;updated_at?:string};
        Update: never;
      };
      teacher_entitlement_grants: {
        Row: {id:string;teacher_id:string;kind:"plan_access"|"capability_boost";plan_version_id:string|null;capability_key:string|null;capability_kind:string|null;boolean_value:boolean|null;integer_value:number|null;unlimited:boolean;valid_from:string;expires_at:string|null;revoked_at:string|null;reason:string;issued_by:string|null;request_id:string;created_at:string};
        Insert: {id?:string;teacher_id:string;kind:"plan_access"|"capability_boost";plan_version_id?:string|null;capability_key?:string|null;capability_kind?:string|null;boolean_value?:boolean|null;integer_value?:number|null;unlimited?:boolean;valid_from?:string;expires_at?:string|null;revoked_at?:string|null;reason:string;issued_by?:string|null;request_id:string;created_at?:string};
        Update: never;
      };
      entitlement_audit_events: {
        Row: {id:string;teacher_id:string;actor_id:string|null;source:string;action:string;revision_before:number|null;revision_after:number|null;request_id:string;reason:string;occurred_at:string};
        Insert: {id?:string;teacher_id:string;actor_id?:string|null;source:string;action:string;revision_before?:number|null;revision_after?:number|null;request_id:string;reason:string;occurred_at?:string};
        Update: never;
      };
      account_usage_periods: {
        Row: {id:string;teacher_id:string;capability_key:string;period_start:string;period_end:string;used_count:number;reserved_count:number;created_at:string};
        Insert: {id?:string;teacher_id:string;capability_key:string;period_start:string;period_end:string;used_count?:number;reserved_count?:number;created_at?:string};
        Update: never;
      };
      account_usage_events: {
        Row: {id:string;teacher_id:string;capability_key:string;period_id:string;request_id:string;unit:string;amount:number;source:string;created_at:string};
        Insert: {id?:string;teacher_id:string;capability_key:string;period_id:string;request_id:string;unit:string;amount:number;source:string;created_at?:string};
        Update: never;
      };
      platform_billing_customers: {
        Row: {id:string;teacher_id:string;provider:string;merchant_scope:string;external_customer_id:string;disabled_at:string|null;created_at:string};
        Insert: {id?:string;teacher_id:string;provider:string;merchant_scope:string;external_customer_id:string;disabled_at?:string|null;created_at?:string};
        Update: never;
      };
      platform_subscription_offers: {
        Row: {id:string;plan_version_id:string;provider:string;merchant_scope:string;external_price_id:string;currency:string;billing_interval:"month"|"year";effective_from:string;effective_to:string|null;created_at:string};
        Insert: {id?:string;plan_version_id:string;provider:string;merchant_scope:string;external_price_id:string;currency:string;billing_interval:"month"|"year";effective_from:string;effective_to?:string|null;created_at?:string};
        Update: never;
      };
      platform_subscriptions: {
        Row: {id:string;teacher_id:string;customer_id:string;offer_id:string;provider:string;merchant_scope:string;external_subscription_id:string;state:"trialing"|"active"|"past_due"|"grace"|"cancel_at_period_end"|"canceled"|"expired"|"refunded"|"disputed";current_period_end:string|null;paid_through:string|null;grace_until:string|null;cancel_at:string|null;latest_event_time:string|null;latest_event_version:string|null;revision:number;created_at:string;updated_at:string};
        Insert: {id?:string;teacher_id:string;customer_id:string;offer_id:string;provider:string;merchant_scope:string;external_subscription_id:string;state:"trialing"|"active"|"past_due"|"grace"|"cancel_at_period_end"|"canceled"|"expired"|"refunded"|"disputed";current_period_end?:string|null;paid_through?:string|null;grace_until?:string|null;cancel_at?:string|null;latest_event_time?:string|null;latest_event_version?:string|null;revision?:number;created_at?:string;updated_at?:string};
        Update: never;
      };
      platform_billing_events: {
        Row: {id:string;provider:string;merchant_scope:string;external_event_id:string;external_subscription_id:string|null;teacher_id:string|null;event_type:string;external_created_at:string|null;payload_sha256:string;signature_verified_at:string;processing_state:"pending"|"applied"|"ignored"|"retry"|"failed";attempt_count:number;error_code:string|null;applied_at:string|null;received_at:string};
        Insert: {id?:string;provider:string;merchant_scope:string;external_event_id:string;external_subscription_id?:string|null;teacher_id?:string|null;event_type:string;external_created_at?:string|null;payload_sha256:string;signature_verified_at:string;processing_state?:"pending"|"applied"|"ignored"|"retry"|"failed";attempt_count?:number;error_code?:string|null;applied_at?:string|null;received_at?:string};
        Update: never;
      };
      // Core operator-owned teaching tables. These must remain synchronized
      // with the one canonical SQL baseline, not inferred from old Studio models.
      workplaces: {
        Row: {
          id: string; teacher_id: string; name: string; timezone: string;
          currency: string; locale: string; policy: Json; created_at: string; cancellation_window_hours:number|null;
          kind: "personal"|"professional"; archived_at: string|null;
          revision: number; updated_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; name: string; timezone?: string;
          currency?: string; locale?: string; policy?: Json; created_at?: string; cancellation_window_hours?:number|null;
          kind?: "personal"|"professional"; archived_at?: string|null;
          revision?: number; updated_at?: string;
        };
        Update: {
          name?: string; timezone?: string; currency?: string; locale?: string;
          policy?: Json; archived_at?: string|null; cancellation_window_hours?:number|null;
        };
      };
      class_groups: {
        Row: { id: string; teacher_id: string; workplace_id: string; name: string; created_at: string; updated_at: string };
        Insert: { id?: string; teacher_id: string; workplace_id: string; name: string; created_at?: string; updated_at?: string };
        Update: { name?: string; updated_at?: string };
      };
      group_enrollments: {
        Row: { id: string; teacher_id: string; group_id: string; workplace_id: string; student_id: string; created_at: string };
        Insert: { id?: string; teacher_id: string; group_id: string; workplace_id: string; student_id: string; created_at?: string };
        Update: { group_id?: string; workplace_id?: string; student_id?: string };
      };
      learning_materials: {
        Row: {
          id: string; teacher_id: string; kind: "game"|"puzzle"|"drill"|"study_chapter"|"external_link";
          title: string; description: string; source_url: string|null;
          request_id: string; request_hash: string; created_at: string; updated_at: string;
          revision: number;
          archived_at: string | null;
        };
        Insert: {
          id?: string; teacher_id: string; kind: "game"|"puzzle"|"drill"|"study_chapter"|"external_link";
          title: string; description?: string; source_url?: string|null;
          request_id: string; request_hash: string; created_at?: string; updated_at?: string;
          revision?: number;
          archived_at?: string | null;
        };
        Update: { title?: string; description?: string; source_url?: string|null; updated_at?: string; archived_at?: string | null };
      };
      // Unified schema only; provider-sync API/workers require separate OpenSpec.
      student_rating_sync_consents: {
        Row:{id:string;teacher_id:string;student_id:string;provider:"lichess"|"chesscom";
          source_username:string;handle_revision:number;enabled:boolean;
          consented_at:string|null;revoked_at:string|null;revision:number;
          last_request_id:string|null;last_request_hash:string|null;
          created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;student_id:string;provider:"lichess"|"chesscom";
          source_username:string;handle_revision?:number;enabled?:boolean;
          consented_at?:string|null;revoked_at?:string|null;revision?:number;
          last_request_id?:string|null;last_request_hash?:string|null;
          created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["student_rating_sync_consents"]["Insert"]>;
      };
      student_rating_refresh_jobs: {
        Row:{id:string;teacher_id:string;student_id:string;consent_id:string;
          provider:"lichess"|"chesscom";source_username:string;handle_revision:number;
          input_digest:string;idempotency_key:string;
          trigger_kind:"profile_save"|"manual"|"scheduled"|"history_backfill";
          status:"pending"|"running"|"retry"|"succeeded"|"stale"|"failed"|"cancelled";
          attempt_count:number;run_after:string;lease_token:string|null;
          lease_until:string|null;last_error_code:string|null;
          finished_at:string|null;created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;student_id:string;consent_id:string;
          provider:"lichess"|"chesscom";source_username:string;handle_revision:number;
          input_digest:string;idempotency_key:string;
          trigger_kind:"profile_save"|"manual"|"scheduled"|"history_backfill";
          status?:"pending"|"running"|"retry"|"succeeded"|"stale"|"failed"|"cancelled";
          attempt_count?:number;run_after?:string;lease_token?:string|null;
          lease_until?:string|null;last_error_code?:string|null;
          finished_at?:string|null;created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["student_rating_refresh_jobs"]["Insert"]>;
      };
      student_rating_refresh_receipts: {
        Row:{id:string;teacher_id:string;student_id:string;job_id:string;
          attempt_number:number;outcome:"succeeded"|"stale"|"retry"|"failed"|"cancelled";
          source_username:string;input_digest:string;evidence_digest:string|null;
          snapshots_written:number;error_code:string|null;observed_at:string|null;
          fetched_at:string|null;recorded_at:string};
        Insert:{id?:string;teacher_id:string;student_id:string;job_id:string;
          attempt_number:number;outcome:"succeeded"|"stale"|"retry"|"failed"|"cancelled";
          source_username:string;input_digest:string;evidence_digest?:string|null;
          snapshots_written?:number;error_code?:string|null;observed_at?:string|null;
          fetched_at?:string|null;recorded_at?:string};
        Update:Partial<Database["public"]["Tables"]["student_rating_refresh_receipts"]["Insert"]>;
      };
      // Canonical rating and finance tables, modeled from the single
      // fresh-install SQL baseline. Runtime RLS/ledger functions enforce writes.
      student_rating_snapshots: {
        Row: {
          id: string; teacher_id: string; student_id: string;
          provider: string;
          time_control: string;
          rating: number; rating_deviation: number | null; provisional: boolean | null;
          games: number | null; source: "teacher_manual" | "provider_api";
          observed_at: string; fetched_at: string | null;
          request_id: string; created_at: string;
          effective_at:string|null;provider_list_version:string|null;
          source_url:string|null;source_digest:string|null;
          verification_state:"unverified"|"provider_published";
          external_player_id:string|null;source_handle_revision:number|null;
          preview_digest: string | null;
          source_username: string | null;
        };
        Insert: {
          id?: string; teacher_id: string; student_id: string;
          provider: string;
          time_control: string;
          rating: number; rating_deviation?: number | null; provisional?: boolean | null;
          games?: number | null; source: "teacher_manual" | "provider_api";
          observed_at: string; fetched_at?: string | null;
          request_id: string; created_at?: string;
          effective_at?:string|null;provider_list_version?:string|null;
          source_url?:string|null;source_digest?:string|null;
          verification_state?:"unverified"|"provider_published";
          external_player_id?:string|null;source_handle_revision?:number|null;
          preview_digest?: string | null;
          source_username?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["student_rating_snapshots"]["Insert"]>;
      };
      financial_obligations: {
        Row: {
          id: string; teacher_id: string; workplace_id: string;
          billing_account_id: string; agreement_id: string; agreement_revision: number;
          agreement_snapshot: Json; session_id: string | null; student_id: string | null;
          period_start: string; period_end: string;
          kind: "coach_earning" | "participant_charge" | "period_compensation";
          amount_cents: number; currency: string; source_key: string;
          source_hash: string; approval_request_id: string; created_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; workplace_id: string;
          billing_account_id: string; agreement_id: string; agreement_revision: number;
          agreement_snapshot: Json; session_id?: string | null; student_id?: string | null;
          period_start: string; period_end: string;
          kind: "coach_earning" | "participant_charge" | "period_compensation";
          amount_cents: number; currency: string; source_key: string;
          source_hash: string; approval_request_id: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["financial_obligations"]["Insert"]>;
      };
      received_payments: {
        Row: {
          id: string; teacher_id: string; billing_account_id: string;
          currency: string; amount_cents: number; received_at: string;
          method: "cash" | "bank_transfer" | "card" | "stripe" | "other";
          provenance: "teacher_confirmed" | "provider_verified";
          external_reference: string | null; request_id: string;
          request_hash: string; created_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; billing_account_id: string;
          currency: string; amount_cents: number; received_at: string;
          method: "cash" | "bank_transfer" | "card" | "stripe" | "other";
          provenance: "teacher_confirmed" | "provider_verified";
          external_reference?: string | null; request_id: string;
          request_hash: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["received_payments"]["Insert"]>;
      };
      payment_allocations: {
        Row: {
          id: string; teacher_id: string; received_payment_id: string;
          obligation_id: string; amount_cents: number; request_id: string;
          created_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; received_payment_id: string;
          obligation_id: string; amount_cents: number; request_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payment_allocations"]["Insert"]>;
      };
      financial_reversals: {
        Row: {
          id: string; teacher_id: string;
          kind: "allocation_reversal" | "payment_refund" | "obligation_correction";
          allocation_id: string | null; received_payment_id: string | null;
          obligation_id: string | null; amount_cents: number;
          request_id: string; request_hash: string; reason: string; created_at: string;
        };
        Insert: {
          id?: string; teacher_id: string;
          kind: "allocation_reversal" | "payment_refund" | "obligation_correction";
          allocation_id?: string | null; received_payment_id?: string | null;
          obligation_id?: string | null; amount_cents: number;
          request_id: string; request_hash: string; reason: string; created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["financial_reversals"]["Insert"]>;
      };
      // Current canonical contacts and per-workplace finance model. Old
      // guardian/Studio generated types below are transitional WIP until the
      // one final ADR-0017 cutover, never an accepted compatibility surface.
      contacts: {
        Row:{id:string;teacher_id:string;display_name:string;kind:"person"|"organization";
          email:string|null;phone:string|null;preferred_locale:"en"|"he"|"ru"|null;
          status:"active"|"archived";revision:number;created_at:string;
          updated_at:string;last_request_id:string|null;last_request_hash:string|null};
        Insert:{id?:string;teacher_id:string;display_name:string;kind?:"person"|"organization";
          email?:string|null;phone?:string|null;preferred_locale?:"en"|"he"|"ru"|null;
          status?:"active"|"archived";revision?:number;last_request_id?:string|null;
          last_request_hash?:string|null;created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
      };
      student_contacts: {
        Row:{id:string;teacher_id:string;student_id:string;contact_id:string;
          relationship_label:string;is_legal_guardian:boolean;may_receive_messages:boolean;
          emergency_priority:number|null;active_from:string|null;active_to:string|null;
          revision:number;created_at:string;last_request_id:string|null;last_request_hash:string|null};
        Insert:{id?:string;teacher_id:string;student_id:string;contact_id:string;
          relationship_label:string;is_legal_guardian?:boolean;may_receive_messages?:boolean;
          emergency_priority?:number|null;active_from?:string|null;active_to?:string|null;
          revision?:number;created_at?:string;last_request_id?:string|null;last_request_hash?:string|null};
        Update:Partial<Database["public"]["Tables"]["student_contacts"]["Insert"]>;
      };
      billing_accounts: {
        Row:{id:string;teacher_id:string;display_name:string;account_kind:"person"|"organization";
          contact_id:string|null;status:"active"|"archived";revision:number;
          last_request_id:string|null;last_request_hash:string|null;created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;display_name:string;account_kind?:"person"|"organization";
          contact_id?:string|null;status?:"active"|"archived";revision?:number;
          last_request_id?:string|null;last_request_hash?:string|null;
          created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["billing_accounts"]["Insert"]>;
      };
      // Date-scoped payer contracts: financial identity is immutable after
      // creation. Only the reviewed end-date operation can shorten a period.
      student_billing_assignments: {
        Row: {
          id: string; teacher_id: string; workplace_id: string;
          student_id: string; billing_account_id: string;
          effective_from: string; effective_to: string | null;
          revision: number; last_request_id: string | null;
          last_request_hash: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; workplace_id: string;
          student_id: string; billing_account_id: string;
          effective_from: string; effective_to?: string | null;
          revision?: number; last_request_id?: string | null;
          last_request_hash?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: {
          effective_to?: string | null; revision?: number;
          last_request_id?: string | null; last_request_hash?: string | null;
          updated_at?: string;
        };
      };
      portal_access_grants: {
        Row:{id:string;teacher_id:string;contact_id:string;student_id:string;workplace_id:string;
          billing_account_id:string|null;permissions:string[];token_digest:string|null;
          issued_at:string|null;expires_at:string;revoked_at:string|null;revision:number;
          last_request_id:string|null;last_request_hash:string|null;created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;contact_id:string;student_id:string;workplace_id:string;
          billing_account_id?:string|null;permissions:string[];token_digest?:string|null;
          issued_at?:string|null;expires_at:string;revoked_at?:string|null;revision?:number;
          last_request_id?:string|null;last_request_hash?:string|null;
          created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["portal_access_grants"]["Insert"]>;
      };
      portal_event_invitations: {
        Row:{id:string;teacher_id:string;event_id:string;portal_grant_id:string;
          status:RsvpStatus;party_size:number|null;note:string;responded_at:string|null;
          revoked_at:string|null;revision:number;last_request_id:string|null;
          last_request_hash:string|null;created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;event_id:string;portal_grant_id:string;
          status?:RsvpStatus;party_size?:number|null;note?:string;
          responded_at?:string|null;revoked_at?:string|null;revision?:number;
          last_request_id?:string|null;last_request_hash?:string|null;
          created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["portal_event_invitations"]["Insert"]>;
      };
      student_federation_memberships: {
        Row:{id:string;teacher_id:string;student_id:string;federation_code:string;
          player_id:string;membership_status:"unverified"|"source_matched";
          verified_at:string|null;source_url:string|null;revision:number;
          created_at:string;last_request_id:string|null;last_request_hash:string|null};
        Insert:{id?:string;teacher_id:string;student_id:string;federation_code:string;
          player_id:string;membership_status?:"unverified"|"source_matched";
          verified_at?:string|null;source_url?:string|null;revision?:number;
          created_at?:string;last_request_id?:string|null;last_request_hash?:string|null};
        Update:Partial<Database["public"]["Tables"]["student_federation_memberships"]["Insert"]>;
      };
      compensation_agreements: {
        Row:{id:string;teacher_id:string;workplace_id:string;student_id:string|null;
          group_id:string|null;exact_session_id:string|null;private_series_id:string|null;billing_account_id:string;
          agreement_role:"coach_earning"|"participant_charge";
          model:"hourly"|"per_session"|"per_student"|"fixed_period";
          rate_cents:number;currency:string;effective_from:string;effective_to:string|null;
          status:"active"|"archived";revision:number;last_request_id:string|null;
          last_request_hash:string|null;created_at:string;updated_at:string};
        Insert:{id?:string;teacher_id:string;workplace_id:string;student_id?:string|null;
          group_id?:string|null;exact_session_id?:string|null;billing_account_id:string;
          agreement_role:"coach_earning"|"participant_charge";
          model:"hourly"|"per_session"|"per_student"|"fixed_period";
          rate_cents:number;currency:string;effective_from:string;effective_to?:string|null;
          status?:"active"|"archived";revision?:number;last_request_id?:string|null;
          last_request_hash?:string|null;created_at?:string;updated_at?:string};
        Update:Partial<Database["public"]["Tables"]["compensation_agreements"]["Insert"]>;
      };
      teachers: {
        Row: {
          id: string;
          email: string;
          display_name: string;
          avatar_url: string | null;
          preferred_locale: string;
          selected_workplace_id: string | null;
          created_at: string;
          onboarding_tour_completed_at: string | null;
          calendar_token: string;
          default_national_federation_code: string | null;
        };
        Insert: {
          id: string;
          email: string;
          display_name: string;
          avatar_url?: string | null;
          preferred_locale?: string;
          selected_workplace_id?: string | null;
          created_at?: string;
          onboarding_tour_completed_at?: string | null;
          calendar_token?: string;
          default_national_federation_code?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string;
          avatar_url?: string | null;
          preferred_locale?: string;
          selected_workplace_id?: string | null;
          onboarding_tour_completed_at?: string | null;
          calendar_token?: string;
          default_national_federation_code?: string | null;
        };
      };
      students: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          parent_contact: string | null;
          fide_id:string|null;
          fide_federation_code:string|null;
          national_federation_preference:string|null;
          teacher_notes: string;
          level: string | null;
          birthdate: string | null;
          practice_start_date: string | null;
          default_rate_cents: number | null;
          travel_fee_cents: number | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
          name_aliases: string[];
          strength: number | null;
          lichess_username: string | null;
          chesscom_username: string | null;
          lichess_rating: number | null;
          chesscom_rating: number | null;
          name_search: string;
          chess_goals: string;
          chess_ratings: Json;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          parent_contact?: string | null;
          fide_id?:string|null;
          fide_federation_code?:string|null;
          national_federation_preference?:string|null;
          teacher_notes?: string;
          level?: string | null;
          birthdate?: string | null;
          practice_start_date?: string | null;
          default_rate_cents?: number | null;
          travel_fee_cents?: number | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
          name_aliases?: string[];
          strength?: number | null;
          lichess_username?: string | null;
          chesscom_username?: string | null;
          lichess_rating?: number | null;
          chesscom_rating?: number | null;
          chess_goals?: string;
          chess_ratings?: Json;
        };
        Update: {
          name?: string;
          parent_contact?: string | null;
          fide_id?:string|null;
          fide_federation_code?:string|null;
          national_federation_preference?:string|null;
          teacher_notes?: string;
          level?: string | null;
          birthdate?: string | null;
          practice_start_date?: string | null;
          default_rate_cents?: number | null;
          travel_fee_cents?: number | null;
          archived_at?: string | null;
          name_aliases?: string[];
          strength?: number | null;
          lichess_username?: string | null;
          chesscom_username?: string | null;
          lichess_rating?: number | null;
          chesscom_rating?: number | null;
          chess_goals?: string;
          chess_ratings?: Json;
        };
      };
      teacher_settings: {
        Row: {
          teacher_id: string;
          business_name: string;
          business_website: string;
          business_contact: string;
          business_info: string;
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
          bcc_contact_emails: boolean;
          bcc_email: string | null;
          ai_provider: "none" | "openai" | "anthropic";
          ai_api_key: string | null;
          policies_updated_at: string | null;
          updated_at: string;
        };
        Insert: {
          teacher_id: string;
          business_name?: string;
          business_website?: string;
          business_contact?: string;
          business_info?: string;
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
          bcc_contact_emails?: boolean;
          bcc_email?: string | null;
          ai_provider?: "none" | "openai" | "anthropic";
          ai_api_key?: string | null;
          policies_updated_at?: string | null;
        };
        Update: {
          business_name?: string;
          business_website?: string;
          business_contact?: string;
          business_info?: string;
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
          bcc_contact_emails?: boolean;
          bcc_email?: string | null;
          ai_provider?: "none" | "openai" | "anthropic";
          ai_api_key?: string | null;
          policies_updated_at?: string | null;
        };
      };
      lesson_slots: {
        Row: {
          id: string;
          series_id: string;
          series_workplace_scope: string;
          teacher_id: string;
          student_id: string;
          workplace_id: string | null;
          day_of_week: number;
          start_time: string;
          duration_minutes: number;
          start_date: string;
          end_date: string | null;
          active: boolean;
          rate_cents: number | null;
          is_home_visit: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          series_id?: string;
          teacher_id: string;
          student_id: string;
          workplace_id?: string | null;
          day_of_week: number;
          start_time: string;
          duration_minutes?: number;
          start_date?: string;
          end_date?: string | null;
          active?: boolean;
          rate_cents?: number | null;
          is_home_visit?: boolean;
          updated_at?: string;
        };
        Update: {
          workplace_id?: string | null;
          day_of_week?: number;
          start_time?: string;
          duration_minutes?: number;
          start_date?: string;
          end_date?: string | null;
          active?: boolean;
          rate_cents?: number | null;
          is_home_visit?: boolean;
          updated_at?: string;
        };
      };
      invoices: {
        Row: {
          id: string;
          teacher_id: string;
          billing_account_id: string;
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
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          billing_account_id: string;
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
          updated_at?: string;
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
          updated_at?: string;
        };
      };
      invoice_items: {
        Row: {
          id: string;
          invoice_id: string;
          session_id: string | null;
          student_id: string | null;
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
          session_id?: string | null;
          student_id?: string | null;
          kind?: InvoiceItemKind;
          description: string;
          quantity?: number;
          unit_cents: number;
          amount_cents: number;
          sort_order?: number;
        };
        Update: {
          session_id?: string | null;
          student_id?: string | null;
          description?: string;
          quantity?: number;
          unit_cents?: number;
          amount_cents?: number;
          sort_order?: number;
        };
      };
      // Temporal periods are the one canonical workplace-membership history.
      workplace_enrollments: {
        Row: {
          id: string; teacher_id: string; workplace_id: string; student_id: string;
          created_at: string; starts_on: string | null; ends_on: string | null;
          start_date_unknown: boolean; cancelled_at: string | null;
          cancel_reason: string | null; end_reason: string | null;
          source: "manual" | "spreadsheet" | "group" | "reimport" | "legacy_operator";
          revision: number; updated_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; workplace_id: string; student_id: string;
          created_at?: string; starts_on?: string | null; ends_on?: string | null;
          start_date_unknown?: boolean; cancelled_at?: string | null;
          cancel_reason?: string | null; end_reason?: string | null;
          source?: "manual" | "spreadsheet" | "group" | "reimport" | "legacy_operator";
          revision?: number; updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workplace_enrollments"]["Insert"]>;
      };
      credit_adjustment_events: {
        Row: {
          id: string; teacher_id: string; student_id: string; package_id: string;
          kind: "manual_grant" | "forfeiture" | "refund_entitlement" |
            "transfer_out" | "transfer_in" | "expiry_extension";
          credits_delta: number; transfer_id: string | null;
          new_expires_on: string | null; source_payment_id: string | null;
          refund_reversal_id: string | null;
          approved_request_id: string; approval_reason: string;
          evidence: Record<string, unknown>; recorded_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; student_id: string; package_id: string;
          kind: Database["public"]["Tables"]["credit_adjustment_events"]["Row"]["kind"];
          credits_delta: number; transfer_id?: string | null;
          new_expires_on?: string | null; source_payment_id?: string | null;
          refund_reversal_id?: string | null;
          approved_request_id: string; approval_reason: string;
          evidence?: Record<string, unknown>; recorded_at?: string;
        };
        Update: Record<string, never>;
      };
      credit_packages: {
        Row: {
          id: string;
          teacher_id: string;
          student_id: string;
          invoice_id: string;
          workplace_id: string;
          request_id: string | null;
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
          workplace_id: string;
          request_id?: string | null;
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
          session_id: string;
          student_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          package_id: string;
          session_id: string;
          student_id: string;
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
      teaching_sessions: {
        Row: {
          id: string; teacher_id: string; workplace_id: string;
          group_id: string | null; student_id: string | null;
          title: string; starts_at: string; duration_minutes: number;
          status: "scheduled" | "completed" | "cancelled";
          updated_at: string; lesson_note: string; request_id: string | null;
          created_at: string; slot_id: string | null; slot_rate_cents: number | null;
          slot_occurrence_date: string | null; local_timezone: string | null;
          is_home_visit: boolean; rescheduled_from_date: string | null;
          makeup_for_session_id: string | null; makeup_for_student_id: string | null;
          roster_mode: "standard" | "ad_hoc";
          source_private_series_id: string | null;
        };
        Insert: {
          id?: string; teacher_id: string; workplace_id: string;
          group_id?: string | null; student_id?: string | null;
          title: string; starts_at: string; duration_minutes: number;
          status?: "scheduled" | "completed" | "cancelled";
          lesson_note?: string; request_id?: string | null;
          slot_id?: string | null; slot_rate_cents?: number | null;
          slot_occurrence_date?: string | null; local_timezone?: string | null;
          is_home_visit?: boolean; rescheduled_from_date?: string | null;
          makeup_for_session_id?: string | null; makeup_for_student_id?: string | null;
          roster_mode?: "standard" | "ad_hoc";
        };
        Update: {
          workplace_id?: string; group_id?: string | null;
          student_id?: string | null; title?: string; starts_at?: string;
          duration_minutes?: number; status?: "scheduled" | "completed" | "cancelled";
          lesson_note?: string; slot_id?: string | null;
          slot_rate_cents?: number | null; slot_occurrence_date?: string | null;
          local_timezone?: string | null; is_home_visit?: boolean;
          rescheduled_from_date?: string | null;
          makeup_for_session_id?: string | null; makeup_for_student_id?: string | null;
          updated_at?: string;
          roster_mode?: "standard" | "ad_hoc";
        };
      };
      session_participants: {
        Row: { teacher_id: string; session_id: string; student_id: string; sponsor_billing_review_required: boolean };
        Insert: { teacher_id: string; session_id: string; student_id: string };
        Update: Record<string, never>;
      };
      session_attendance: {
        Row: {
          id: string; teacher_id: string; session_id: string; student_id: string;
          status: SessionAttendanceStatus; note: string; notice_at: string | null;
          cancelled_by: "student" | "teacher" | null; cancel_reason: string;
          marked_at: string | null; marked_by: string | null; updated_at: string;
          cancellation_window_hours_snapshot:number|null;
          cancellation_session_starts_at_snapshot:string|null;
          cancellation_timely_earns_makeup_snapshot:boolean|null;
          cancellation_late_earns_makeup_snapshot:boolean|null;
          cancellation_policy_snapshot_origin:"observed"|"restored_unverified"|null;
          cancellation_was_timely_snapshot:boolean|null;
        };
        Insert: {
          id?: string; teacher_id: string; session_id: string; student_id: string;
          status: SessionAttendanceStatus; note?: string; notice_at?: string | null;
          cancelled_by?: "student" | "teacher" | null; cancel_reason?: string;
          marked_at?: string | null; marked_by?: string | null;
        };
        Update: {
          status?: SessionAttendanceStatus; note?: string; notice_at?: string | null;
          cancelled_by?: "student" | "teacher" | null; cancel_reason?: string;
          marked_at?: string | null; marked_by?: string | null;
          updated_at?: string;
        };
      };
      session_notes: {
        Row: {
          id: string; teacher_id: string; session_id: string;
          student_id: string | null; body: string; private_body: string;
          shared_with_contacts: boolean; emailed_at: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; teacher_id: string; session_id: string;
          student_id?: string | null; body?: string; private_body?: string;
          shared_with_contacts?: boolean; emailed_at?: string | null;
        };
        Update: {
          body?: string; private_body?: string; shared_with_contacts?: boolean;
          emailed_at?: string | null; updated_at?: string;
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
      events: {
        Row: {
          id: string;
          teacher_id: string;
          workplace_id: string | null;
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
          workplace_id?: string | null;
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
          workplace_id?: string | null;
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
    };
    Enums: {
      rsvp_status: RsvpStatus;
    };
  };
}
