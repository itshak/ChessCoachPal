import type { SupabaseClient } from "@supabase/supabase-js";
import { isUniqueViolation } from "@/lib/onboarding";
import { ensureTeacherPolicyRow } from "@/lib/server/ensure-policy";
import { ensureWelcomeNotification } from "@/lib/server/notifications";
import {isAppLocale,type AppLocale} from "@/i18n/locales";

/**
 * Ensure a teachers row (+ studio policy) exists for an auth user.
 * Uses the service client (authenticated role cannot INSERT teachers).
 * The database provisions one Personal workplace and Free entitlement row.
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
    preferredLocale?: AppLocale;
  }
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const { data: existing } = await serviceClient
    .from("teachers")
    .select("id, onboarding_tour_completed_at")
    .eq("id", opts.userId)
    .maybeSingle();

  let created = false;
  let tourCompletedAt: string | null = existing?.onboarding_tour_completed_at ?? null;

  if (!existing) {
    const display =
      opts.displayName?.trim() ||
      opts.email.split("@")[0] ||
      "Teacher";

    const { error } = await serviceClient.from("teachers").insert({
      id: opts.userId,
      email: opts.email,
      display_name: display,
      ...(isAppLocale(opts.preferredLocale)?{preferred_locale:opts.preferredLocale}:{}),
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


  await ensureTeacherPolicyRow(
    serviceClient,
    opts.userId,
    opts.timezone ?? null
  );

  if (tourCompletedAt == null) {
    await ensureWelcomeNotification(serviceClient, opts.userId);
  }

  return { ok: true, created };
}
