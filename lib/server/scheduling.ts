import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_POLICY,
  normalizeDurationRates,
  type TeacherPolicy,
} from "@/lib/schedule";

/**
 * Server-side scheduling operations, shared by the teacher schedule page,
 * the parent portal, and the .ics feed. Works with either an RLS-scoped
 * client (teacher pages) or the service-role client (portal/token access).
 * Canonical slot materialization is implemented in canonical-slot-service.
 */

function normalizeCancellationWindowHours(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value : DEFAULT_POLICY.cancellation_window_hours;
}

/** Narrow scalar read for an already authorized guest scope. Never read credentials. */
export async function getCancellationWindowHours(
  supabase: SupabaseClient,
  teacherId: string,
): Promise<number> {
  const { data } = await supabase.from("teacher_settings")
    .select("cancellation_window_hours").eq("teacher_id", teacherId).maybeSingle();
  return normalizeCancellationWindowHours(data?.cancellation_window_hours);
}

export async function getPolicy(
  supabase: SupabaseClient,
  teacherId: string
): Promise<TeacherPolicy> {
  const { data } = await supabase
    .from("teacher_settings")
    .select("*")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!data) return DEFAULT_POLICY;
  const policy = { ...DEFAULT_POLICY, ...data };
  policy.cancellation_window_hours = normalizeCancellationWindowHours(data.cancellation_window_hours);
  policy.duration_rate_cents = normalizeDurationRates(
    (data as { duration_rate_cents?: unknown }).duration_rate_cents
  );
  // BYO secrets are encrypted at rest; every server-side consumer reads
  // policies through here, so this is the single decryption point.
  const { decryptSecret } = await import("@/lib/token");
  policy.stripe_secret_key = decryptSecret(policy.stripe_secret_key);
  policy.stripe_webhook_secret = decryptSecret(policy.stripe_webhook_secret);
  policy.ai_api_key = decryptSecret(policy.ai_api_key);
  return policy;
}

