import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { teacherWorkplaceContextGet } from "@/lib/server/teacher-workplace-context";

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
function homeworkEvidenceQuery(db: SupabaseClient, teacherId: string, date: string, includeLearner = false) {
  return db.from("training_assignments").select(
    "id,due_on,learner:students!inner(archived_at" + (includeLearner ? ",name" : "") + "),material:learning_materials(title)," +
    "submissions:assignment_attempts(id,recorded_at)," +
    "reviews:assignment_reviews(id,attempt_id,verdict,reviewed_at)",
  ).eq("teacher_id", teacherId).is("learner.archived_at", null).lte("due_on", date)
    .in("submissions.outcome", ["submitted", "completed"])
    .order("recorded_at", { referencedTable: "submissions", ascending: false })
    .order("id", { referencedTable: "submissions", ascending: false })
    .order("reviewed_at", { referencedTable: "reviews", ascending: false })
    .order("id", { referencedTable: "reviews", ascending: false })
    .limit(EVIDENCE_LIMIT + 1, { referencedTable: "submissions" })
    .limit(EVIDENCE_LIMIT + 1, { referencedTable: "reviews" });
}

function currentReason(row: Assignment): HomeworkReason | null {
  if (row.submissions.length > EVIDENCE_LIMIT || row.reviews.length > EVIDENCE_LIMIT) {
    return "EVIDENCE_LIMIT_EXCEEDED";
  }
  const submission = row.submissions[0];
  // Same database serialization retains sub-millisecond precision. An older
  // general review cannot cover a newer submission.
  const latest = row.reviews.find(r => r.attempt_id === submission?.id ||
    (r.attempt_id === null && (!submission || r.reviewed_at >= submission.recorded_at)));
  if (latest?.verdict === "reviewed") return null;
  return latest?.verdict === "needs_work" ? "REVIEW_NEEDS_WORK"
    : submission ? "SUBMISSION_AWAITING_REVIEW" : "DUE_AWAITING_SUBMISSION";
}

export async function teacherDailyHomework(
  db: SupabaseClient, teacherId: string, workplaceId: string | null, date: string, after?: string,
) {
  if (workplaceId !== null) return { status: "workplace_scope_unavailable" as const };
  let query = homeworkEvidenceQuery(db, teacherId, date)
    .order("due_on").order("id").limit(HOMEWORK_PAGE_SIZE + 1);
  if (after) {
    // Only a date and UUID can reach this expression via the shared strict input.
    const [, due, id] = after.split("~");
    query = query.or("due_on.gt." + due + ",and(due_on.eq." + due + ",id.gt." + id + ")");
  }
  const result = await query.overrideTypes<Assignment[], { merge: false }>();
  if (result.error || !result.data) return { status: "unavailable" as const };
  const scanned = result.data.slice(0, HOMEWORK_PAGE_SIZE);
  const assignments = scanned.flatMap(row => {
    const reason = currentReason(row);
    return reason ? [{ assignmentId: row.id, dueOn: row.due_on, materialTitle: row.material?.title ?? null, reason }] : [];
  });
  const last = scanned.at(-1);
  const nextAfter = result.data.length > HOMEWORK_PAGE_SIZE && last
    ? date + "~" + last.due_on + "~" + last.id : null;
  return { status: "ready" as const, dueThrough: date, evidence: "current" as const, assignments,
    nextAfter, limit: HOMEWORK_PAGE_SIZE };
}


export const dailyHomeworkFocusInput = z.object({
  assignmentId: z.string().uuid(),
  dueThrough: z.iso.date(),
}).strict();

/** Same current evidence as the queue, selecting just one owner-scoped row
 * independent of the current page. This returns no notes or other learners. */
export async function teacherDailyHomeworkFocus(
  db: SupabaseClient, teacherId: string,
  input: z.infer<typeof dailyHomeworkFocusInput>,
) {
  let workplaceId: string | null;
  try {
    ({ selectedWorkplaceId: workplaceId } = await teacherWorkplaceContextGet(db, teacherId));
  } catch {
    return { status: "unavailable" as const };
  }
  if (workplaceId !== null) return { status: "workplace_scope_unavailable" as const };
  const result = await homeworkEvidenceQuery(db, teacherId, input.dueThrough, true)
    .eq("id", input.assignmentId).maybeSingle()
    .overrideTypes<Assignment & { learner: { name: string } }, { merge: false }>();
  if (result.error) return { status: "unavailable" as const };
  const row = result.data;
  const reason = row && currentReason(row);
  const learnerName = row?.learner?.name;
  if (!row || !reason || !learnerName) return { status: "not_actionable" as const };
  return { status: "ready" as const, assignmentId: row.id, dueOn: row.due_on,
    materialTitle: row.material?.title ?? null, reason, learnerName };
}
