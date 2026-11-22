import type { SupabaseClient } from "@supabase/supabase-js";
import {z} from "zod";
import type {Database} from "@/lib/supabase/types";
import {resolveTeacherWorkplaceFilter,WorkplaceContextError} from "@/lib/server/teacher-workplace-context";
import {workplaceRosterDate} from "@/lib/server/workplace-student-scope";
import {getPolicy} from "@/lib/server/scheduling";
import {toLocalDateString} from "@/lib/schedule";

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
  fideId?:string|null;
  fideFederationCode?:string|null;
  nationalFederationPreference?:string|null;
  chessGoals?: string | null;
  chessRatings?: Record<string,Record<string,number|null>>;
  teacherNotes?: string | null;
  level?: string | null;
  birthdate?: string | null;
  practiceStartDate?: string | null;
  defaultRateCents?: number | string | null;
  travelFeeCents?: number | string | null;
};
export const studentRosterWorkplaceFilter=z.union([z.string().uuid(),z.literal("context"),z.null()]).optional();
/** Bounded, navigable roster. Archived students remain accessible via explicit filter. */
export async function teacherStudentsRoster(db: Db, teacherId: string,
  opts: { query?: string; includeArchived?: boolean; archivedOnly?: boolean;
    workplaceId?:z.infer<typeof studentRosterWorkplaceFilter>; offset?: number; limit?: number } = {}) {
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 1000));
  const offset = Math.min(100000, Math.max(0, opts.offset ?? 0));
  let workplaceId:string|null, today:string|null=null;
  try{
    // Omitted preserves the historical global identity chooser. Roster views
    // opt into the saved context, or explicitly pick All or an owned UUID.
    workplaceId=await resolveTeacherWorkplaceFilter(db,teacherId,
      opts.workplaceId==="context"?undefined:opts.workplaceId??null);
    if(workplaceId)today=await workplaceRosterDate(db,teacherId,workplaceId);
  }catch(error){
    if(error instanceof WorkplaceContextError)throw new StudentProfileError(error.status,error.code,error.message);
    throw new StudentProfileError(500,"DATABASE_ERROR","Workplace roster unavailable");
  }
  if(workplaceId&&!today)throw new StudentProfileError(404,"NOT_FOUND","Workplace not found");
  const mixed=Boolean(workplaceId&&opts.includeArchived&&!opts.archivedOnly);
  const relation="workplace_enrollments!workplace_enrollments_student_id_teacher_id_fkey";
  const projection=workplaceId?(mixed?`*,current_membership:${relation}(),past_membership:${relation}()`:
    `*,membership:${relation}!inner()`):"*";
  let query = db.from("students")
    .select(projection, {count:"exact"})
    .eq("teacher_id", teacherId).order("name").order("id")
    .range(offset, offset + limit - 1);
  if (opts.archivedOnly) query = query.not("archived_at", "is", null);
  else if (!opts.includeArchived) query = query.is("archived_at", null);
  if(workplaceId){
    for(const alias of mixed?["current_membership","past_membership"]:["membership"]){
      query=query.eq(alias+".teacher_id",teacherId).eq(alias+".workplace_id",workplaceId)
        .is(alias+".cancelled_at",null).or(`starts_on.is.null,starts_on.lte.${today}`,{referencedTable:alias});
      const current=mixed?alias==="current_membership":!opts.archivedOnly;
      if(current)query=query.or(`ends_on.is.null,ends_on.gte.${today}`,{referencedTable:alias});
    }
    // PostgREST applies embedded existence to each canonical top-level row;
    // ended intervals are evidence for archived learners only, not active.
    if(mixed)query=query.or("and(archived_at.is.null,current_membership.not.is.null),and(archived_at.not.is.null,past_membership.not.is.null)");
  }
  if (opts.query?.trim()) {
    const literal = opts.query.trim().replace(/[\\%_]/g, "\\$&");
    query = query.ilike("name_search", `%${literal}%`);
  }
  const { data, error, count } = await query;
  if (error || typeof count !== "number")
    throw new StudentProfileError(500,"DATABASE_ERROR","Student roster or pagination count unavailable");
  return {
    students:(data??[]) as unknown as Database["public"]["Tables"]["students"]["Row"][],
    nextOffset:count > offset+(data?.length??0) ? offset+(data?.length??0) : null,
  };
}
export async function teacherStudentProfile(db: Db, teacherId: string, studentId: string) {
  const {data,error} = await db.from("students").select("*")
    .eq("teacher_id",teacherId).eq("id",studentId).maybeSingle();
  if (error) throw new StudentProfileError(500,"DATABASE_ERROR","Student lookup failed");
  if (!data) throw new StudentProfileError(404,"NOT_FOUND","Student not found");
  return data;
}
/** Append-only, owner-scoped manual chess ratings/strength/goals audit history. */
export async function teacherStudentChessHistory(db:Db,teacherId:string,studentId:string,
  opts:{offset?:number;limit?:number}={}){
 // Query-string values from the website must have the same bounded pagination
 // semantics as MCP's integer schema; never pass NaN or silently clamp.
 const offset=opts.offset??0,limit=opts.limit??50;
 if(!Number.isSafeInteger(offset)||offset<0||offset>100000||
    !Number.isSafeInteger(limit)||limit<1||limit>100)
   throw new StudentProfileError(400,"VALIDATION_ERROR","Invalid chess history pagination");
 await teacherStudentProfile(db,teacherId,studentId);
 const {data,error}=await db.from("student_chess_profile_history")
  .select("id,field_name,previous_value,next_value,created_at")
  .eq("teacher_id",teacherId).eq("student_id",studentId)
  .order("created_at",{ascending:false}).order("id",{ascending:false})
  .range(offset,offset+limit);
 if(error)throw new StudentProfileError(500,"DATABASE_ERROR",
   "Chess profile history unavailable");
 return {studentId,entries:(data??[]).slice(0,limit),
   nextOffset:(data?.length??0)>limit?offset+limit:null};
}

/** Advisory preflight shared by website and delegated MCP. Fail closed on query errors. */
export async function teacherStudentArchivePreview(db: Db, teacherId: string, studentId: string) {
  const student = await teacherStudentProfile(db, teacherId, studentId);
  const now = new Date().toISOString();
  // Archived historical periods are not current membership blockers.
  const policy=await getPolicy(db,teacherId);
  const today=toLocalDateString(new Date(),policy.timezone);
  const checks = await Promise.all([
    db.from("lesson_slots").select("id", {count:"exact", head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId).eq("active",true),
    // The slot is scheduling intent, not another physical lesson.
    db.from("teaching_sessions").select("id",{count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .eq("status","scheduled").gte("starts_at",now)
      .not("slot_id","is",null),
    db.from("teaching_sessions").select("id",{count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .eq("status","scheduled").gte("starts_at",now)
      .is("slot_id",null),
    db.from("session_participants")
      .select("session_id,teaching_sessions!session_participants_session_id_teacher_id_fkey!inner(id)",
       {count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .eq("teaching_sessions.status","scheduled")
      .gte("teaching_sessions.starts_at",now)
      .is("teaching_sessions.student_id",null),
    db.from("group_enrollments").select("id", {count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId),
    db.from("workplace_enrollments").select("id",{count:"exact",head:true})
      .eq("teacher_id",teacherId).eq("student_id",studentId)
      .is("cancelled_at",null)
      .or(`starts_on.is.null,starts_on.lte.${today}`)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  if (checks.some(({error})=>error))
    throw new StudentProfileError(503,"PREVIEW_UNAVAILABLE","Cannot verify future commitments; archive was not performed");
  const [recurringSlots,futurePrivateLessons,futureDirectSessions,
    futureGroupSessions,activeGroupMemberships,currentWorkplaceEnrollments] =
      checks.map(({count})=>count ?? 0);
  const blockers = {recurringSlots,futurePrivateLessons,futureDirectSessions,
    futureGroupSessions,activeGroupMemberships,currentWorkplaceEnrollments};
  return {studentId,archived:Boolean(student.archived_at),updatedAt:student.updated_at,
    blockers,canArchive:Object.values(blockers).every(count=>count===0),
    creditPolicy:"hold_without_refund_transfer_or_expiry_change",
    membershipPolicy:"historical_periods_retained_no_automatic_reenrollment"};
}

/** Website and MCP execute this exact code with the same RLS-bound teacher database client. */
export async function teacherStudentPatch(db: Db, teacherId: string, studentId: string,
  patch: StudentProfilePatch, expectedUpdatedAt?: string) {
  const existing = await teacherStudentProfile(db, teacherId, studentId);
  if (expectedUpdatedAt && existing.updated_at !== expectedUpdatedAt)
    throw new StudentProfileError(409,"CONFLICT","Student was modified; reload before editing");
  // Never round, clamp, or silently coerce malformed monetary inputs.
  // Shared website/MCP service enforces the same integer-cent invariant.
  const cents = (value:number|string|null) => {
    if(value===null)return null;
    if(typeof value==="string"){
      const normalized=value.trim();
      if(normalized==="")return null;
      if(!/^\d{1,8}$/.test(normalized))
        throw new StudentProfileError(400,"VALIDATION_ERROR","Rate/fee must be whole cents");
      value=Number(normalized);
    }
    if(!Number.isSafeInteger(value)||value<0||value>10_000_000)
      throw new StudentProfileError(400,"VALIDATION_ERROR","Rate/fee must be 0–10,000,000 whole cents");
    return value;
  };
  const update: Record<string,unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.nameAliases !== undefined) update.name_aliases = [...new Set(patch.nameAliases.map(x=>x.trim()).filter(Boolean))];
  if (patch.strength !== undefined) update.strength = patch.strength;
  if (patch.lichessUsername !== undefined) update.lichess_username = patch.lichessUsername;
  if (patch.chesscomUsername !== undefined) update.chesscom_username = patch.chesscomUsername;
  if (patch.lichessRating !== undefined) update.lichess_rating = patch.lichessRating;
  if (patch.chesscomRating !== undefined) update.chesscom_rating = patch.chesscomRating;
  if(patch.fideId!==undefined)update.fide_id=patch.fideId;
  if(patch.fideFederationCode!==undefined)update.fide_federation_code=patch.fideFederationCode;
  if(patch.nationalFederationPreference!==undefined)
    update.national_federation_preference=patch.nationalFederationPreference;
  if (patch.chessGoals !== undefined) update.chess_goals = patch.chessGoals ?? "";
  if (patch.chessRatings !== undefined) {
    const existingRatings=(existing.chess_ratings??{}) as Record<string,Record<string,number|null>>;
    const merged:Record<string,Record<string,number|null>>={...existingRatings};
    for(const [provider,values] of Object.entries(patch.chessRatings)){
      merged[provider]={...(existingRatings[provider]??{}),...values};
    }
    update.chess_ratings=merged;
  }
  // teacher_notes is NOT NULL in the canonical schema. Treat nullable API
  // clearing as an empty note instead of writing SQL NULL and returning 500.
  if (patch.teacherNotes !== undefined) update.teacher_notes = patch.teacherNotes ?? "";
  if (patch.level !== undefined) update.level = patch.level?.trim() || null;
  if (patch.birthdate !== undefined) update.birthdate = patch.birthdate || null;
  if (patch.practiceStartDate !== undefined) update.practice_start_date = patch.practiceStartDate || null;
  if (patch.defaultRateCents !== undefined) update.default_rate_cents = cents(patch.defaultRateCents);
  if (patch.travelFeeCents !== undefined) update.travel_fee_cents = cents(patch.travelFeeCents);
  if (!Object.keys(update).length) throw new StudentProfileError(400,"VALIDATION_ERROR","No profile changes specified");
  let request = db.from("students").update(update).eq("teacher_id",teacherId).eq("id",studentId);
  if (expectedUpdatedAt) request = request.eq("updated_at",expectedUpdatedAt);
  const {data,error} = await request.select("*").maybeSingle();
  if (/CAPACITY_EXCEEDED|HOSTED_LIMIT_REACHED/.test(error?.message??""))
    throw new StudentProfileError(409,"CAPACITY_EXCEEDED","Active-student capacity reached");
  if (error?.message?.includes("FUTURE_COMMITMENTS"))
    throw new StudentProfileError(409,"FUTURE_COMMITMENTS","Resolve future commitments before archiving");
  if (error) throw new StudentProfileError(500,"DATABASE_ERROR","Student update failed");
  if (!data) throw new StudentProfileError(409,"CONFLICT","Student changed or was deleted; reload before editing");
  return data;
}

/** Deletion is distinct from archiving. Never silently cascade linked teaching history. */
export async function teacherStudentDeleteImpact(db: Db, teacherId: string, studentId: string) {
  const student=await teacherStudentProfile(db,teacherId,studentId);
  const references=[
    ["privateLessons","lessons",true],["recurringSlots","lesson_slots",true],
    ["directSessions","teaching_sessions",true],["sessionParticipants","session_participants",true],
    ["groupMemberships","group_enrollments",true],["workplaceMemberships","workplace_enrollments",true],
    ["skills","skill_assessments",false],["materialLinks","material_links",true],
    ["observations","chess_observations",true],
    ["materialTeachingEvidence","material_teaching_evidence",true],
    ["events","event_students",false],["credits","credit_packages",false],
    ["chessProfileHistory","student_chess_profile_history",true],
    ["typedHomework","training_assignments",true],
    ["trainingPlans","student_training_plans",true],
    ["historicalAttendance","ccp_historical_attendance_evidence",true],
    ["studentContactLinks","student_contacts",true],
  ] as const;
  const counts=await Promise.all(references.map(([,table,scope])=>{
    let query=db.from(table).select("student_id",{count:"exact",head:true}).eq("student_id",studentId);
    if(scope)query=query.eq("teacher_id",teacherId);
    return query;
  }));
  if(counts.some(row=>row.error))
    throw new StudentProfileError(503,"PREVIEW_UNAVAILABLE","Unable to verify linked teaching history; deletion not performed");
  const blockers=Object.fromEntries(references.map(([name],i)=>[name,counts[i].count??0])) as Record<string,number>;
  return {studentId,name:student.name,archived:Boolean(student.archived_at),
    updatedAt:student.updated_at,blockers,canDelete:Object.values(blockers).every(count=>count===0)};
}

/** Only empty profiles can be removed through ordinary website/MCP workflows.
 * Historical erasure with regulatory retention requirements needs a dedicated flow.
 */
export async function teacherStudentDelete(db:Db,teacherId:string,studentId:string,expectedUpdatedAt:string){
  const preview=await teacherStudentDeleteImpact(db,teacherId,studentId);
  if(preview.updatedAt!==expectedUpdatedAt)
    throw new StudentProfileError(409,"CONFLICT","Student changed; review deletion impact again");
  if(!preview.canDelete)
    throw new StudentProfileError(409,"HISTORY_DEPENDENCIES",
      "Linked teaching, group, chess progress or financial history exists. Archive the student instead.");
  const {data,error}=await db.from("students").delete().eq("teacher_id",teacherId)
    .eq("id",studentId).eq("updated_at",expectedUpdatedAt)
    .select("id").maybeSingle();
  if(error?.code==="23503" && error.message?.includes("HISTORY_DEPENDENCIES"))
    throw new StudentProfileError(409,"HISTORY_DEPENDENCIES",
      "Linked teaching, group, chess progress or financial history exists. Archive the student instead.");
  if(error)throw new StudentProfileError(409,"DELETE_BLOCKED","Deletion failed; linked history or concurrent edits may exist");
  if(!data)throw new StudentProfileError(409,"CONFLICT","Student changed or was removed; re-read before deleting");
  // Deletion of a student never implies permission to remove an independent
  // contact identity or revoke a separately authorized scoped portal grant.
  return {deleted:true,studentId:data.id};
}
