import {createHash} from "node:crypto";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {teacherStudentArchivePreview} from "@/lib/server/student-profile-service";

export class BulkLifecycleError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export const bulkLifecycleRowSchema=z.object({
  studentId:z.string().uuid(),archived:z.boolean(),
  expectedUpdatedAt:z.string().datetime({offset:true}),
}).strict();
export const bulkLifecyclePreviewSchema=z.object({
  rows:z.array(bulkLifecycleRowSchema).min(1).max(100),
}).strict();
export const bulkLifecycleCommitSchema=bulkLifecyclePreviewSchema.extend({
  previewDigest:z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey:z.string().uuid(),confirmed:z.literal(true),
}).strict();
export type BulkLifecycleRow=z.infer<typeof bulkLifecycleRowSchema>;

const fail=(status:number,code:string,message:string):never=>{
  throw new BulkLifecycleError(status,code,message);
};
const canonical=(rows:BulkLifecycleRow[])=>[...rows].sort((a,b)=>a.studentId.localeCompare(b.studentId));
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Advisory preview. The SQL commit independently locks and rechecks every invariant. */
export async function teacherBulkLifecyclePreview(db:SupabaseClient,teacherId:string,rows:BulkLifecycleRow[]){
  const parsed=bulkLifecyclePreviewSchema.safeParse({rows});
  if(!parsed.success) return fail(400,"VALIDATION_ERROR","Provide 1–100 rows with UUID, archived status and exact revision");
  const ordered=canonical(parsed.data.rows);
  if(new Set(ordered.map(r=>r.studentId)).size!==ordered.length)
    return fail(400,"DUPLICATE_STUDENT","A student may appear only once per batch");
  const ids=ordered.map(r=>r.studentId);
  const {data:students,error}=await db.from("students")
    .select("id,name,archived_at,updated_at")
    .eq("teacher_id",teacherId).in("id",ids);
  if(error)return fail(503,"PREVIEW_UNAVAILABLE","Student information unavailable");
  if((students??[]).length!==ids.length)
    return fail(404,"NOT_FOUND","One or more students are not in your account");
  const byId=new Map((students??[]).map(s=>[s.id,s]));
  const result=[];
  for(const row of ordered){
    const student=byId.get(row.studentId)!;
    const currentArchived=Boolean(student.archived_at);
    const blockers:Record<string,number>={};
    if(row.archived && !currentArchived){
      // Shared preview counts only active teacher-local, non-cancelled periods.
      const preview=await teacherStudentArchivePreview(db,teacherId,row.studentId);
      Object.assign(blockers,preview.blockers);
    }
    const stale=student.updated_at!==row.expectedUpdatedAt;
    const blocked=Object.values(blockers).some(n=>n>0);
    result.push({
      studentId:row.studentId,name:student.name,currentArchived,
      requestedArchived:row.archived,expectedUpdatedAt:row.expectedUpdatedAt,
      currentUpdatedAt:student.updated_at,blockers,stale,
      canChange:!stale&&!blocked,
    });
  }
  const totalDelta=result.filter(r=>r.currentArchived!==r.requestedArchived)
    .reduce((count,r)=>count+(r.requestedArchived?-1:1),0);
  const {data:teacher,error:te}=await db.from("teachers")
    .select("hosted_enforced,hosted_plan,hosted_max_active_students,active_student_count,trial_ends_at,gifted_until")
    .eq("id",teacherId).maybeSingle();
  if(te||!teacher)return fail(503,"PREVIEW_UNAVAILABLE","Active-student quota unavailable");
  const now=Date.now();
  const enforce=teacher.hosted_enforced&&(
    teacher.hosted_plan==="free"||
    (teacher.hosted_plan==="trial"&&(!teacher.trial_ends_at||Date.parse(teacher.trial_ends_at)<=now))||
    (teacher.hosted_plan==="gifted"&&(!teacher.gifted_until||Date.parse(teacher.gifted_until)<=now)));
  const quotaBlocked=Boolean(enforce&&teacher.active_student_count+totalDelta>teacher.hosted_max_active_students);
  const canCommit=!quotaBlocked&&result.every(r=>r.canChange);
  const previewDigest=digest({teacherId,rows:ordered,states:result.map(r=>({
    studentId:r.studentId,currentArchived:r.currentArchived,
    currentUpdatedAt:r.currentUpdatedAt,blockers:r.blockers,
  }))});
  return {rows:result,previewDigest,canCommit,quotaBlocked,
    activeStudentCountBefore:teacher.active_student_count,
    activeStudentCountAfter:teacher.active_student_count+totalDelta};
}
export async function teacherBulkLifecycleCommit(
  db:SupabaseClient,teacherId:string,input:z.infer<typeof bulkLifecycleCommitSchema>){
  const parsed=bulkLifecycleCommitSchema.safeParse(input);
  if(!parsed.success)return fail(400,"VALIDATION_ERROR","Invalid bulk lifecycle request");
  const ordered=canonical(parsed.data.rows);
  const {data:replayed,error:replayError}=await db.rpc("ccp_student_bulk_lifecycle_replay",{
    p_rows:ordered,p_request_id:parsed.data.idempotencyKey,
  });
  if(replayError){
    if(replayError.message?.includes("REPLAY_CONFLICT"))
      return fail(409,"CONFLICT","Idempotency key was already used with different details");
    return fail(503,"DATABASE_ERROR","Cannot verify existing lifecycle receipt");
  }
  if(replayed)return replayed;
  const preview=await teacherBulkLifecyclePreview(db,teacherId,parsed.data.rows);
  if(preview.previewDigest!==input.previewDigest)
    return fail(409,"PREVIEW_CHANGED","Student status or blockers changed since preview");
  if(!preview.canCommit)
    return fail(409,preview.quotaBlocked?"HOSTED_LIMIT_REACHED":"BLOCKED",
      "Resolve student commitments, active enrollment, quota or stale revisions before committing");
  const {data,error}=await db.rpc("ccp_student_bulk_lifecycle",{
    p_rows:canonical(parsed.data.rows),
    p_request_id:input.idempotencyKey,
  });
  if(error){
    const message=error.message??"";
    if(message.includes("HOSTED_LIMIT_REACHED"))
      return fail(403,"HOSTED_LIMIT_REACHED","Active-student quota reached");
    if(message.includes("REPLAY_CONFLICT")||message.includes("REVISION"))
      return fail(409,"CONFLICT","A student changed or the idempotency key was reused");
    if(message.includes("FUTURE_COMMITMENTS")||message.includes("ACTIVE_WORKPLACE"))
      return fail(409,"BLOCKED","Current enrollment or future commitments prevent archiving");
    if(message.includes("NOT_FOUND"))
      return fail(404,"NOT_FOUND","A student is no longer available");
    return fail(503,"DATABASE_ERROR","Atomic lifecycle update was not committed");
  }
  return data;
}
