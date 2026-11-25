import type { SupabaseClient } from "@supabase/supabase-js";

const RECEIPT_SCAN_LIMIT = 96;
const providers = ["lichess", "chesscom"] as const;
type Provider = typeof providers[number];
type ReviewReason = "PROVIDER_FAILURE" | "PROVIDER_RETRY_RECORDED" | "LOOKUP_DISCARDED";
type Receipt = {
  recorded_at: string;
  outcome: string;
  error_code: string | null;
  source_username: string;
  input_digest: string;
  job: {
    provider: Provider;
    source_username: string;
    input_digest: string;
    handle_revision: number;
    created_at: string;
    consent: {
      id: string;
      provider: Provider;
      enabled: boolean;
      source_username: string;
      handle_revision: number;
      consented_at: string;
      learner: { lichess_username: string | null; chesscom_username: string | null };
    };
  };
};
const providerCodes = new Set([
  "ACCOUNT_NOT_FOUND", "PROVIDER_DENIED", "PROVIDER_RESPONSE", "RATING_UNAVAILABLE",
  "RATE_LIMITED", "PROVIDER_UNAVAILABLE",
]);

function recordedReason(receipt: Receipt): ReviewReason | null {
  if (receipt.outcome === "stale") return "LOOKUP_DISCARDED";
  if (!receipt.error_code || !providerCodes.has(receipt.error_code)) return null;
  if (receipt.outcome === "failed") return "PROVIDER_FAILURE";
  if (receipt.outcome === "retry") return "PROVIDER_RETRY_RECORDED";
  return null;
}

/** Recorded receipts on the displayed civil day, read under the owner's RLS.
 * Not a feed of last-known ratings, a freshness policy or a provider health test. */
export async function teacherDailyRatingReview(
  db: SupabaseClient, teacherId: string, workplaceId: string | null,
  dayStart: Date, dayEnd: Date, now: Date,
) {
  if (workplaceId !== null) return { status: "workplace_scope_unavailable" as const };
  const upper = new Date(Math.min(dayEnd.getTime(), now.getTime()));
  if (upper <= dayStart) return { status: "ready" as const, issues: [], truncated: false };
  const result = await db.from("student_rating_refresh_receipts").select(
    "recorded_at,outcome,error_code,source_username,input_digest," +
    "job:student_rating_refresh_jobs!inner(provider,source_username,input_digest,handle_revision,created_at," +
    "consent:student_rating_sync_consents!inner(id,provider,enabled,source_username,handle_revision,consented_at," +
    "learner:students!inner(lichess_username,chesscom_username,archived_at)))",
  ).eq("teacher_id", teacherId)
    .eq("job.consent.enabled", true)
    .is("job.consent.learner.archived_at", null)
    .in("job.trigger_kind", ["profile_save", "manual", "scheduled"])
    .gte("recorded_at", dayStart.toISOString()).lt("recorded_at", upper.toISOString())
    .order("recorded_at", { ascending: false }).order("id", { ascending: false })
    .limit(RECEIPT_SCAN_LIMIT + 1)
    .overrideTypes<Receipt[], { merge: false }>();
  if (result.error || !result.data) return { status: "unavailable" as const };
  const seen = new Set<string>();
  const counts = new Map<string, { provider: Provider; reason: ReviewReason; count: number }>();
  for (const receipt of result.data.slice(0, RECEIPT_SCAN_LIMIT)) {
    const { job } = receipt;
    const { consent } = job;
    const username = job.provider === "lichess" ? consent.learner.lichess_username : consent.learner.chesscom_username;
    // Use the same literal current handle and epoch as the worker, without
    // disclosing username, learner identity, digests or raw provider errors.
    if (seen.has(consent.id) || !providers.includes(job.provider) || consent.provider !== job.provider ||
        !consent.enabled || !Number.isSafeInteger(job.handle_revision) ||
        job.handle_revision !== consent.handle_revision ||
        job.source_username !== consent.source_username || job.source_username !== username?.trim() ||
        !/^[A-Za-z0-9_-]{2,30}$/.test(job.source_username) ||
        receipt.source_username !== job.source_username || receipt.input_digest !== job.input_digest ||
        !consent.consented_at || Date.parse(consent.consented_at) > Date.parse(job.created_at) ||
        Date.parse(receipt.recorded_at) < Date.parse(job.created_at)) continue;
    seen.add(consent.id);
    const reason = recordedReason(receipt);
    if (!reason) continue;
    const key = job.provider + ":" + reason;
    const prior = counts.get(key);
    if (prior) prior.count++;
    else counts.set(key, {provider: job.provider, reason, count: 1});
  }
  return { status: "ready" as const, issues: [...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,issue])=>issue),
    truncated: result.data.length > RECEIPT_SCAN_LIMIT };
}
