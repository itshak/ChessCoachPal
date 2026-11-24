import type { SupabaseClient } from "@supabase/supabase-js";

export const HOMEWORK_PAGE_SIZE = 24;
const EVIDENCE_LIMIT = 128;

type Attempt = { id: string; recorded_at: string };
type Review = { id: string; attempt_id: string | null; verdict: "reviewed" | "needs_work"; reviewed_at: string };
type Assignment = {
  id: string; due_on: string; material: { title: string } | null;
  submissions: Attempt[]; reviews: Review[];
};

export type HomeworkReason =
  | "SUBMISSION_AWAITING_REVIEW"
  | "REVIEW_NEEDS_WORK"
  | "DUE_AWAITING_SUBMISSION"
  | "EVIDENCE_LIMIT_EXCEEDED";

/** One embedded database snapshot. Never use enrollment as assignment provenance. */
export async function teacherDailyHomework(
  db: SupabaseClient, teacherId: string, workplaceId: string | null, date: string, after?: string,
) {
  if (workplaceId !== null) return { status: "workplace_scope_unavailable" as const };
  let query = db.from("training_assignments").select(
    "id,due_on,learner:students!inner(archived_at),material:learning_materials(title)," +
    "submissions:assignment_attempts(id,recorded_at)," +
    "reviews:assignment_reviews(id,attempt_id,verdict,reviewed_at)",
  ).eq("teacher_id", teacherId).is("learner.archived_at", null).lte("due_on", date)
    .in("submissions.outcome", ["submitted", "completed"])
    .order("due_on").order("id").limit(HOMEWORK_PAGE_SIZE + 1)
    .order("recorded_at", { referencedTable: "submissions", ascending: false })
    .order("id", { referencedTable: "submissions", ascending: false })
    .order("reviewed_at", { referencedTable: "reviews", ascending: false })
    .order("id", { referencedTable: "reviews", ascending: false })
    .limit(EVIDENCE_LIMIT + 1, { referencedTable: "submissions" })
    .limit(EVIDENCE_LIMIT + 1, { referencedTable: "reviews" });
  if (after) {
    // Only a date and UUID can reach this expression via the shared strict input.
    const [, due, id] = after.split("~");
    query = query.or("due_on.gt." + due + ",and(due_on.eq." + due + ",id.gt." + id + ")");
  }
  const result = await query.overrideTypes<Assignment[], { merge: false }>();
  if (result.error || !result.data) return { status: "unavailable" as const };
  const scanned = result.data.slice(0, HOMEWORK_PAGE_SIZE);
  const assignments = scanned.flatMap(row => {
    let reason: HomeworkReason;
    if (row.submissions.length > EVIDENCE_LIMIT || row.reviews.length > EVIDENCE_LIMIT) {
      reason = "EVIDENCE_LIMIT_EXCEEDED";
    } else {
      const submission = row.submissions[0];
      // Timestamps in both embeds use the same database serialization, retaining
      // sub-millisecond precision; an older general review cannot cover a new attempt.
      const latest = row.reviews.find(r => r.attempt_id === submission?.id ||
        (r.attempt_id === null && (!submission || r.reviewed_at >= submission.recorded_at)));
      if (latest?.verdict === "reviewed") return [];
      reason = latest?.verdict === "needs_work" ? "REVIEW_NEEDS_WORK"
        : submission ? "SUBMISSION_AWAITING_REVIEW" : "DUE_AWAITING_SUBMISSION";
    }
    return [{ assignmentId: row.id, dueOn: row.due_on, materialTitle: row.material?.title ?? null, reason }];
  });
  const last = scanned.at(-1);
  const nextAfter = result.data.length > HOMEWORK_PAGE_SIZE && last
    ? date + "~" + last.due_on + "~" + last.id : null;
  return { status: "ready" as const, dueThrough: date, evidence: "current" as const, assignments,
    nextAfter, limit: HOMEWORK_PAGE_SIZE };
}
