import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DailyCloseError, dailyCloseScope, teacherDailyClosePreview } from "@/lib/server/daily-lesson-close";
import { toLocalDateString } from "@/lib/schedule";

const uuid = z.string().uuid();
const originalRevision = z.iso.datetime({ offset: true });
const decisionsSchema = z.array(z.object({
  studentId: uuid,
  status: z.enum(["present", "late", "absent", "excused"]),
  note: z.string().max(5000),
  expectedUpdatedAt: originalRevision.nullable(),
}).strict()).min(1).max(50);
const taughtIds = z.array(uuid).min(1).max(50);

const proposed = {
  sessionId: uuid,
  expectedUpdatedAt: originalRevision,
  dailyWorkplaceId: dailyCloseScope,
  materialId: uuid,
  lessonNote: z.string().max(10000).optional(),
  taughtStudentIds: taughtIds,
};
function verifyRoster(x: {
  attendance: { studentId: string; status: "present" | "late" | "absent" | "excused" }[];
  taughtStudentIds: string[];
}, ctx: z.RefinementCtx) {
  const decisions = new Map(x.attendance.map(row => [row.studentId, row.status]));
  if (decisions.size !== x.attendance.length) {
    ctx.addIssue({ code: "custom", path: ["attendance"], message: "One explicit decision per learner is required" });
  }
  if (new Set(x.taughtStudentIds).size !== x.taughtStudentIds.length ||
      x.taughtStudentIds.some(id => !["present", "late"].includes(decisions.get(id) ?? ""))) {
    ctx.addIssue({ code: "custom", path: ["taughtStudentIds"], message: "Select each taught learner once, from proposed present or late decisions" });
  }
}
export const dailyCombinedPreviewInput = z.object({
  ...proposed, attendance: decisionsSchema,
}).strict().superRefine(verifyRoster);
export const dailyCombinedCommitInput = z.object({
  ...proposed,
  workplaceId: uuid,
  // PostgREST accepts a decimal parameter without letting JavaScript round bigint.
  materialRevision: z.string().regex(/^[1-9][0-9]{0,18}$/)
    .refine(revision => revision.length < 19 || revision <= "9223372036854775807"),
  occurredOn: z.iso.date(),
  attendance: decisionsSchema,
  requestId: uuid,
  confirmed: z.literal(true),
}).strict().superRefine(verifyRoster);
export type DailyCombinedPreviewInput = z.input<typeof dailyCombinedPreviewInput>;
export type DailyCombinedCommitInput = z.input<typeof dailyCombinedCommitInput>;

type Db = SupabaseClient;
const fail = (status: number, code: string, message: string) => new DailyCloseError(status, code, message);

export async function teacherDailyCombinedPreview(db: Db, teacherId: string, input: DailyCombinedPreviewInput) {
  const x = dailyCombinedPreviewInput.parse(input);
  const roster = await teacherDailyClosePreview(db, teacherId, x.sessionId, x.dailyWorkplaceId);
  const proposedById = new Map(x.attendance.map(row => [row.studentId, row]));
  if (roster.participants.length !== x.attendance.length ||
      roster.participants.some(row => !proposedById.has(row.studentId))) {
    throw fail(400, "DAILY_LESSON_ROSTER_MISMATCH", "Review attendance for every exact frozen participant");
  }
  if (roster.updatedAt !== x.expectedUpdatedAt ||
      roster.attendance.some(row => proposedById.get(row.student_id)?.expectedUpdatedAt !== row.updated_at)) {
    throw fail(409, "DAILY_LESSON_REVIEW_CHANGED", "Lesson or attendance changed; reload the exact roster");
  }
  const [session, venue, material] = await Promise.all([
    db.from("teaching_sessions").select("starts_at,local_timezone,updated_at")
      .eq("teacher_id", teacherId).eq("id", roster.sessionId).maybeSingle(),
    db.from("workplaces").select("timezone").eq("teacher_id", teacherId).eq("id", roster.workplaceId).maybeSingle(),
    db.from("learning_materials").select("id,title,kind,revision:revision::text")
      .eq("teacher_id", teacherId).eq("id", x.materialId).is("archived_at", null).maybeSingle()
      .overrideTypes<{id:string;title:string;kind:string;revision:string},{merge:false}>(),
  ]);
  if (session.error || venue.error || material.error) {
    throw fail(503, "DATABASE_ERROR", "Unable to verify the exact lesson, workplace or material");
  }
  if (!session.data || !venue.data || !material.data) {
    throw fail(404, "NOT_FOUND", "Lesson or active material is not available");
  }
  if (session.data.updated_at !== roster.updatedAt) {
    throw fail(409, "DAILY_LESSON_NOT_ACTIONABLE", "Lesson changed during review");
  }
  const occurredOn = toLocalDateString(new Date(session.data.starts_at), session.data.local_timezone ?? venue.data.timezone);
  const attendance = roster.attendance.map(row => proposedById.get(row.student_id)!);
  return {
    requiresConfirmation: true as const, inferredMastery: false as const,
    title: roster.title, roster: roster.participants, material: material.data,
    proposed: {
      ...x, attendance, occurredOn, workplaceId: roster.workplaceId,
      expectedUpdatedAt: roster.updatedAt, materialRevision: material.data.revision,
      taughtStudentIds: [...x.taughtStudentIds].sort(),
    },
  };
}

const confirmedReceipt = z.object({
  sessionId: uuid, workplaceId: uuid, materialId: uuid, materialRevision: z.string(),
  status: z.literal("completed"), attendanceCount: z.number().int().min(1).max(50), linkId: uuid,
  evidenceIds: z.array(uuid).min(1).max(50), oneTransaction: z.literal(true),
  inferredMastery: z.literal(false), replayed: z.boolean(),
}).strict();

export async function teacherDailyCombinedCommit(db: Db, input: DailyCombinedCommitInput) {
  const x = dailyCombinedCommitInput.parse(input);
  const { data, error } = await db.rpc("ccp_teacher_daily_session_complete_with_material", {
    p_session_id: x.sessionId, p_workplace_id: x.workplaceId, p_context_workplace_id: x.dailyWorkplaceId,
    p_expected_updated_at: x.expectedUpdatedAt, p_lesson_note: x.lessonNote ?? null,
    p_attendance: x.attendance, p_material_id: x.materialId, p_material_revision: x.materialRevision,
    p_taught_students: x.taughtStudentIds, p_occurred_on: x.occurredOn,
    p_request_id: x.requestId, p_confirmed: x.confirmed,
  });
  if (error) {
    const code = error.message;
    if (error.code === "42501") throw fail(404, "NOT_FOUND", "The exact lesson or material is not available");
    if (error.code === "55P03") throw fail(409, "DAILY_MATERIAL_REVIEW_BUSY", "This material is being edited; review again");
    const scopedCodes = [
      "STALE_DAILY_MATERIAL_REVISION", "STALE_WORKPLACE_CONTEXT", "DAILY_LESSON_NOT_ACTIONABLE",
      "LESSON_CANCELLATION_REVIEW_REQUIRED", "DAILY_COMBINED_REPLAY_CONFLICT",
      "ATTENDANCE_REVISION_CONFLICT_OR_NOT_FOUND", "MATERIAL_ALREADY_LINKED",
      "MATERIAL_LEARNER_NOT_PRESENT", "MATERIAL_DATE_MISMATCH",
    ];
    if (scopedCodes.includes(code)) {
      throw fail(409, code, "The exact lesson or material review changed; review again before saving");
    }
    if (error.code === "22023" || error.code === "23514" || error.code === "22P02") {
      throw fail(400, "VALIDATION_ERROR", "The reviewed completion is not valid");
    }
    throw fail(503, "DATABASE_ERROR", "Unable to verify the atomic completion result");
  }
  const receipt = confirmedReceipt.safeParse(data);
  if (!receipt.success || receipt.data.sessionId !== x.sessionId || receipt.data.materialId !== x.materialId ||
      receipt.data.materialRevision !== x.materialRevision || receipt.data.workplaceId !== x.workplaceId ||
      receipt.data.attendanceCount !== x.attendance.length || receipt.data.evidenceIds.length !== x.taughtStudentIds.length) {
    throw fail(503, "DATABASE_ERROR", "Unable to verify the atomic completion receipt; retry the same approved request");
  }
  return receipt.data;
}
