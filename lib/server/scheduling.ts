import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_POLICY,
  computeOccurrences,
  normalizeDurationRates,
  type StudioPolicy,
  type SlotRow,
} from "@/lib/schedule";
import { rescheduleSkipKeys } from "@/lib/reschedule";

/**
 * Server-side scheduling operations, shared by the teacher schedule page,
 * the parent portal, and the .ics feed. Works with either an RLS-scoped
 * client (teacher pages) or the service-role client (portal/token access).
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

const PAGE_SIZE = 500;
const MAX_ROWS = 20_000;

/**
 * The hosted PostgREST response cap is normally 1,000. Never materialize
 * against only the first page of slots or moved lessons: doing so can
 * create a "replacement" occurrence for a previously rescheduled lesson.
 * Both browser and MCP call this single tenant-scoped implementation.
 */
async function allPages<T>(
  page: (offset: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  name: string
): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await page(offset);
    if (error) throw new Error("Unable to load all " + name + ": " + error.message);
    const batch = data ?? [];
    if (result.length + batch.length > MAX_ROWS) {
      throw new Error("Too many " + name + " to materialize safely");
    }
    result.push(...batch);
    if (batch.length < PAGE_SIZE) return result;
  }
}

/**
 * Idempotently materialize lesson occurrences from active slots for
 * [from, to] (inclusive "YYYY-MM-DD" local dates). Existing rows are left
 * untouched via ON CONFLICT (slot_id, lesson_date) DO NOTHING, so manual
 * edits and attendance on already-materialized lessons are never clobbered.
 *
 * Fail closed on query errors and overlarge inventories: a partial moved
 * lesson inventory must NEVER silently create a conflicting occurrence.
 * This is still the pre-cutover calendar model; the canonical occurrence
 * change is a separate release blocker.
 */
export async function materializeLessons(
  supabase: SupabaseClient,
  teacherId: string,
  from: string,
  to: string
): Promise<void> {
  const policy = await getPolicy(supabase, teacherId);
  const slots = await allPages<SlotRow>(
    offset => supabase.from("lesson_slots").select("*")
      .eq("teacher_id", teacherId).eq("active", true)
      .order("id").range(offset, offset + PAGE_SIZE - 1),
    "recurring slots"
  );
  const moved = await allPages<{slot_id:string|null;rescheduled_from_date:string|null}>(
    offset => supabase.from("lessons")
      .select("slot_id,rescheduled_from_date")
      .eq("teacher_id", teacherId)
      .not("rescheduled_from_date", "is", null)
      .order("id").range(offset, offset + PAGE_SIZE - 1),
    "rescheduled lessons"
  );

  const skip = rescheduleSkipKeys(moved);
  const rows = slots
    .flatMap(slot => computeOccurrences(slot, from, to, policy.timezone))
    .filter(row => !skip.has(`${row.slot_id}|${row.lesson_date}`));
  if (rows.length > MAX_ROWS) {
    throw new Error("Too many lesson occurrences to materialize safely");
  }
  if (rows.length === 0) return;

  const { error } = await supabase.from("lessons").upsert(rows, {
    onConflict: "slot_id,lesson_date",
    ignoreDuplicates: true,
  });
  if (error) throw new Error("Unable to materialize lessons: " + error.message);
}
