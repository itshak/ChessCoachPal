import type { SupabaseClient } from "@supabase/supabase-js";
import { assertWithinHostedLimit, limitReachedResponse } from "@/lib/server/entitlements";
import { retireEmptyGuardians } from "@/lib/server/families";

type Db = SupabaseClient;
export class StudentProfileError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export type StudentProfilePatch = {
  name?: string;
  nameAliases?: string[];
  strength?: number | null;
  lichessUsername?: string | null;
  chesscomUsername?: string | null;
  lichessRating?: number | null;
  chesscomRating?: number | null;
  teacherNotes?: string | null;
  parentContact?: string | null;
  guardianId?: string | null;
  level?: string | null;
  birthdate?: string | null;
  practiceStartDate?: string | null;
  defaultRateCents?: number | string | null;
  travelFeeCents?: number | string | null;
  archived?: boolean;
};
/** Bounded, navigable roster. Archived students remain accessible via explicit filter. */
export async function teacherStudentsRoster(db: Db, teacherId: string,
  opts: { query?: string; includeArchived?: boolean; offset?: number; limit?: number } = {}) {
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 1000));
  const offset = Math.min(100000, Math.max(0, opts.offset ?? 0));
  let query = db.from("students")
    .select("*")
    .eq("teacher_id", teacherId).order("name").order("id")
    .range(offset, offset + limit);
  if (!opts.includeArchived) query = query.is("archived_at", null);
  if (opts.query?.trim()) {
    const literal = opts.query.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name_search", `%${literal}%`);
  }
  const { data, error } = await query;
  if (error) throw new StudentProfileError(500,"DATABASE_ERROR","Student roster unavailable");
  return { students: (data ?? []).slice(0, limit), nextOffset: (data?.length ?? 0) > limit ? offset+limit : null };
}
export async function teacherStudentProfile(db: Db, teacherId: string, studentId: string) {
  const {data,error} = await db.from("students").select("*")
    .eq("teacher_id",teacherId).eq("id",studentId).maybeSingle();
  if (error) throw new StudentProfileError(500,"DATABASE_ERROR","Student lookup failed");
  if (!data) throw new StudentProfileError(404,"NOT_FOUND","Student not found");
  return data;
}
/** Advisory preflight shared by website and delegated MCP. Fail closed on query errors. */
export async function teacherStudentArchivePreview(db: Db, teacherId: string, studentId: string) {
  const student = await teacherStudentProfile(db, teacherId, studentId);
  const now = new Date().toISOString();
  const checks = await Promise.all([
    db.from("lesson_slots").select("id", {count:"exact", head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId).eq("active",true),
    db.from("lessons").select("id", {count:"exact", head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId).gte("starts_at",now),
    db.from("teaching_sessions").select("id", {count:"exact", head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .eq("status","scheduled").gte("starts_at",now),
    db.from("session_participants")
      .select("session_id,teaching_sessions!inner(id)", {count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .eq("teaching_sessions.status","scheduled")
      .gte("teaching_sessions.starts_at",now),
    db.from("group_enrollments").select("id", {count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId),
  ]);
  if (checks.some(({error})=>error))
    throw new StudentProfileError(503,"PREVIEW_UNAVAILABLE","Cannot verify future commitments; archive was not performed");
  const [recurringSlots,futurePrivateLessons,futureDirectSessions,
    futureGroupSessions,activeGroupMemberships] = checks.map(({count})=>count ?? 0);
  const blockers = {recurringSlots,futurePrivateLessons,futureDirectSessions,
    futureGroupSessions,activeGroupMemberships};
  return {studentId,archived:Boolean(student.archived_at),updatedAt:student.updated_at,
    blockers,canArchive:Object.values(blockers).every(count=>count===0)};
}

/** Website and MCP execute this exact code with the same RLS-bound teacher database client. */
export async function teacherStudentPatch(db: Db, teacherId: string, studentId: string,
  patch: StudentProfilePatch, expectedUpdatedAt?: string) {
  const existing = await teacherStudentProfile(db, teacherId, studentId);
  if (expectedUpdatedAt && existing.updated_at !== expectedUpdatedAt)
    throw new StudentProfileError(409,"CONFLICT","Student was modified; reload before editing");
  if (patch.guardianId) {
    const {data: guardian} = await db.from("guardians").select("id")
      .eq("teacher_id",teacherId).eq("id",patch.guardianId).maybeSingle();
    if (!guardian) throw new StudentProfileError(404,"NOT_FOUND","Family not found");
  }
  if (patch.archived === false && existing.archived_at) {
    const allowed = await assertWithinHostedLimit(db,teacherId,"students");
    if (!allowed.allowed) {
      const result = limitReachedResponse(allowed);
      throw new StudentProfileError(403,result.code,result.error);
    }
  }
  if (patch.archived === true && !existing.archived_at) {
    const preview=await teacherStudentArchivePreview(db,teacherId,studentId);
    if (!preview.canArchive)
      throw new StudentProfileError(409,"FUTURE_COMMITMENTS",
        "Resolve recurring slots, future private/group lessons and current group membership before archiving");
  }
  const cents = (value:number|string|null) => value === null || value === "" ? null :
    Math.max(0,Math.round(Number(value)));
  const update: Record<string,unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.nameAliases !== undefined) update.name_aliases = [...new Set(patch.nameAliases.map(x=>x.trim()).filter(Boolean))];
  if (patch.strength !== undefined) update.strength = patch.strength;
  if (patch.lichessUsername !== undefined) update.lichess_username = patch.lichessUsername;
  if (patch.chesscomUsername !== undefined) update.chesscom_username = patch.chesscomUsername;
  if (patch.lichessRating !== undefined) update.lichess_rating = patch.lichessRating;
  if (patch.chesscomRating !== undefined) update.chesscom_rating = patch.chesscomRating;
  if (patch.teacherNotes !== undefined) update.teacher_notes = patch.teacherNotes;
  if (patch.parentContact !== undefined) update.parent_contact = patch.parentContact;
  if (patch.guardianId !== undefined) update.guardian_id = patch.guardianId || null;
  if (patch.level !== undefined) update.level = patch.level?.trim() || null;
  if (patch.birthdate !== undefined) update.birthdate = patch.birthdate || null;
  if (patch.practiceStartDate !== undefined) update.practice_start_date = patch.practiceStartDate || null;
  if (patch.defaultRateCents !== undefined) update.default_rate_cents = cents(patch.defaultRateCents);
  if (patch.travelFeeCents !== undefined) update.travel_fee_cents = cents(patch.travelFeeCents);
  if (patch.archived !== undefined) update.archived_at = patch.archived ? existing.archived_at ?? new Date().toISOString() : null;
  if (!Object.keys(update).length) throw new StudentProfileError(400,"VALIDATION_ERROR","No profile changes specified");
  let request = db.from("students").update(update).eq("teacher_id",teacherId).eq("id",studentId);
  if (expectedUpdatedAt) request = request.eq("updated_at",expectedUpdatedAt);
  const {data,error} = await request.select("*").maybeSingle();
  if (error) throw new StudentProfileError(500,"DATABASE_ERROR","Student update failed");
  if (!data) throw new StudentProfileError(409,"CONFLICT","Student changed or was deleted; reload before editing");
  if (existing.guardian_id && patch.guardianId !== undefined && existing.guardian_id !== (patch.guardianId || null))
    await retireEmptyGuardians(db,teacherId,[existing.guardian_id]);
  return data;
}
