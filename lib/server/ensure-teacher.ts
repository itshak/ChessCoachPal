import type { SupabaseClient } from "@supabase/supabase-js";
import { hostedSignupFields, getDeploymentMode, getHostedLimits } from "@/lib/entitlements";
import { isUniqueViolation } from "@/lib/onboarding";
import { ensureStudioPolicyRow } from "@/lib/server/ensure-policy";
import { ensureWelcomeNotification } from "@/lib/server/notifications";

/**
 * Ensure a teachers row (+ studio policy) exists for an auth user.
 * Uses the service client (authenticated role cannot INSERT teachers).
 * Hosted signups get trial fields from hostedSignupFields().
 *
 * Also seeds the one-time welcome notification for accounts that have not
 * finished the first-run tour. Safe to call on signup, email confirm, and
 * later sign-in.
 */
export async function ensureTeacherForAuthUser(
  serviceClient: SupabaseClient,
  opts: {
    userId: string;
    email: string;
    displayName?: string | null;
    timezone?: string | null;
  }
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { data: existing } = await serviceClient
    .from("teachers")
    .select("id, onboarding_tour_completed_at")
    .eq("id", opts.userId)
    .maybeSingle();

  const hostedEnforced = getDeploymentMode()==="hosted";
  const hostedCapacity = getHostedLimits().maxStudents;
  let created = false;
  let tourCompletedAt: string | null = existing?.onboarding_tour_completed_at ?? null;

  if (!existing) {
    const hosted = hostedSignupFields();
    const display =
      opts.displayName?.trim() ||
      opts.email.split("@")[0] ||
      "Teacher";

    const { error } = await serviceClient.from("teachers").insert({
      id: opts.userId,
      email: opts.email,
      display_name: display,
      hosted_plan: hosted.hosted_plan,
      trial_ends_at: hosted.trial_ends_at,
      hosted_enforced: hostedEnforced,
      hosted_max_active_students: hostedCapacity,
    });

    if (error && isUniqueViolation(error)) {
      const { data: raced } = await serviceClient
        .from("teachers")
        .select("id, onboarding_tour_completed_at")
        .eq("id", opts.userId)
        .maybeSingle();
      tourCompletedAt = raced?.onboarding_tour_completed_at ?? null;
    } else if (error) {
      console.error("Failed to create teacher row:", error);
      return { ok: false, error: "Failed to set up account" };
    } else {
      created = true;
      tourCompletedAt = null;
    }
  }

  // Entitlement provisioning is privileged and cannot be spoofed by a teacher JWT.
  if (existing && hostedEnforced) {
    const {error:capacityError}=await serviceClient.from("teachers").update({
      hosted_enforced:true,hosted_max_active_students:hostedCapacity,
    }).eq("id",opts.userId);
    if(capacityError)return {ok:false,error:"Failed to verify hosted capacity"};
  }

  await ensureStudioPolicyRow(
    serviceClient,
    opts.userId,
    opts.timezone ?? null
  );

  if (tourCompletedAt == null) {
    await ensureWelcomeNotification(serviceClient, opts.userId);
  }

  return { ok: true, created };
}
