import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_POLICY,
  normalizeDurationRates,
  type StudioPolicy,
} from "@/lib/schedule";

/**
 * Server-side scheduling operations, shared by the teacher schedule page,
 * the parent portal, and the .ics feed. Works with either an RLS-scoped
 * client (teacher pages) or the service-role client (portal/token access).
 * Canonical slot materialization is implemented in canonical-slot-service.
 */

export async function getPolicy(
  supabase: SupabaseClient,
  teacherId: string
): Promise<StudioPolicy> {
  const { data } = await supabase
    .from("studio_policies")
    .select("*")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!data) return DEFAULT_POLICY;
  const policy = { ...DEFAULT_POLICY, ...data };
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

