import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {CoachError,assertSessionSchedule} from "@/lib/server/coach-service";
import {studentLifecyclePreview} from "@/lib/server/student-lifecycle-service";
import {lessonIntervalConflicts} from "@/lib/server/lesson-schedule-inference";

const uuid=z.string().uuid();
const lessonFields=z.object({
 workplaceId:uuid,
 studentIds:z.array(uuid).min(1).max(50),
 title:z.string().trim().min(1).max(160),
 startsAt:z.string().datetime({offset:true}),
 durationMinutes:z.number().int().min(15).max(480),
 lessonNote:z.string().max(10000).default(""),
}).strict().superRefine((input,ctx)=>{
 if(new Set(input.studentIds).size!==input.studentIds.length)
  ctx.addIssue({code:"custom",path:["studentIds"],message:"Select each student only once"});
});
const reactivation=z.object({
 studentId:uuid,expectedUpdatedAt:z.string().datetime({offset:true}),
}).strict();
export const archivedLessonRecoveryPreviewSchema=lessonFields;
export const archivedLessonRecoveryCommitSchema=lessonFields.safeExtend({
 reactivations:z.array(reactivation).min(1).max(50),
 requestId:uuid,reason:z.string().trim().min(8).max(1000),
 confirmed:z.literal(true),
}).superRefine((input,ctx)=>{
 const roster=new Set(input.studentIds),used=new Set<string>();
 for(const [index,entry] of input.reactivations.entries()){
  if(!roster.has(entry.studentId)||used.has(entry.studentId))
   ctx.addIssue({code:"custom",path:["reactivations",index],
    message:"Each explicitly approved reactivation must appear exactly once in the roster"});
  used.add(entry.studentId);
 }
});
export type ArchivedLessonRecoveryPreviewInput=z.infer<typeof archivedLessonRecoveryPreviewSchema>;
export type ArchivedLessonRecoveryCommitInput=z.infer<typeof archivedLessonRecoveryCommitSchema>;

const issue=(code:string,message:string,studentId?:string)=>
 ({code,message,...(studentId?{studentId}:{})});

function lessonDay(startsAt:string,timezone:string){
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
 }).formatToParts(new Date(startsAt));
 const value=(kind:string)=>parts.find(p=>p.type===kind)?.value;
 return [value("year"),value("month"),value("day")].join("-");
}

/** Read-only confirmation of exact IDs, effective-dated enrollments and
 * archived lifecycle revisions. No credit, membership or session writes.
 * No lookup by fuzzy name: use ccp_lessons_capture_preview first.
 */
export async function teacherArchivedLessonRecoveryPreview(
 db:SupabaseClient,teacherId:string,input:ArchivedLessonRecoveryPreviewInput
){
 const args=archivedLessonRecoveryPreviewSchema.parse(input);
 assertSessionSchedule(args.startsAt,args.durationMinutes);
 const issues:Array<{code:string;message:string;studentId?:string}>=[];
 if(Date.parse(args.startsAt)<Date.now())
  issues.push(issue("HISTORICAL_LESSON_NO_REACTIVATION",
   "A past lesson must be handled as a historical correction, not by reactivating a student"));
 const [{data:workplace,error:workplaceError},
  {data:students,error:studentsError},
  {data:settings,error:settingsError}]=await Promise.all([
  db.from("workplaces").select("id,name").eq("teacher_id",teacherId)
   .eq("id",args.workplaceId).maybeSingle(),
  db.from("students").select("id,name,archived_at,updated_at")
   .eq("teacher_id",teacherId).in("id",args.studentIds),
  db.from("teacher_settings").select("timezone").eq("teacher_id",teacherId).maybeSingle(),
 ]);
 if(workplaceError||studentsError||settingsError)
  throw new CoachError("DATABASE_ERROR",500,"Lesson recovery preview unavailable");
 if(!workplace)issues.push(issue("WORKPLACE_NOT_FOUND","Select an owned workplace"));
 const byId=new Map((students??[]).map(s=>[s.id,s]));
 for(const id of args.studentIds)
  if(!byId.has(id))issues.push(issue("STUDENT_NOT_FOUND","Student ID is not available to this teacher",id));
 const timezone=settings?.timezone??"UTC";
 const day=lessonDay(args.startsAt,timezone);
 const {data:enrollments,error:enrollError}=await db.from("workplace_enrollments")
  .select("student_id,starts_on,ends_on,cancelled_at")
  .eq("teacher_id",teacherId).eq("workplace_id",args.workplaceId)
  .in("student_id",args.studentIds).is("cancelled_at",null).limit(5000);
 if(enrollError)throw new CoachError("DATABASE_ERROR",500,"Enrollment review unavailable");
 if((enrollments??[]).length===5000)
  throw new CoachError("DATABASE_ERROR",503,"Enrollment review is too large to verify");
 const activeEnrolled=new Set((enrollments??[])
  .filter(e=>(e.starts_on===null||e.starts_on<=day)&&
    (e.ends_on===null||e.ends_on>=day)).map(e=>e.student_id));
 const archived=(students??[]).filter(s=>s.archived_at!==null);
 const lifecycle=await Promise.all(archived.map(async s=>{
  const details=await studentLifecyclePreview(db,teacherId,{studentId:s.id});
  const valid=details.archived===true&&details.canReactivate===true&&
    Array.isArray(details.previousWorkplaceIds)&&
    details.previousWorkplaceIds.includes(args.workplaceId);
  if(!valid)issues.push(issue("WORKPLACE_NOT_PREVIOUSLY_VERIFIED",
   "Reactivation requires this student's previously verified workplace",s.id));
  return {studentId:s.id,name:s.name,expectedUpdatedAt:details.expectedUpdatedAt,
   previousWorkplaceIds:details.previousWorkplaceIds,
   creditPolicy:details.creditPolicy??"hold_without_refund_or_expiry_change"};
 }));
 if(archived.length===0)issues.push(issue("NO_ARCHIVED_STUDENT",
  "Use ordinary lesson creation when nobody needs reactivation"));
 for(const s of students??[]){
  if(s.archived_at===null&&!activeEnrolled.has(s.id))
   issues.push(issue("STUDENT_NOT_ENROLLED",
    "An active student is not enrolled in this workplace for the scheduled date",s.id));
 }
 if(issues.length===0){
  const collisions=await lessonIntervalConflicts(db,teacherId,{
   startsAt:args.startsAt,durationMinutes:args.durationMinutes,
   timeSource:"explicit",slotIds:[],
  });
  for(const conflict of collisions)issues.push(issue(conflict.code,conflict.message));
 }
 const canCommit=issues.length===0;
 return {
  canCommit,requiresTeacherConfirmation:true,issues,
  workplace:workplace??null,
  students:args.studentIds.map(id=>{
   const s=byId.get(id);
   return {studentId:id,name:s?.name??null,archived:s?.archived_at!==null,
    expectedUpdatedAt:s?.archived_at!==null?s?.updated_at:null};
  }),
  reactivations:lifecycle,
  proposedCommit:canCommit?{
   ...args,reactivations:lifecycle.map(s=>({
    studentId:s.studentId,expectedUpdatedAt:s.expectedUpdatedAt,
   })),
  }:null,
  review:{
   lessonStatus:"scheduled",attendance:"unmarked",
   reactivationCount:archived.length,
   workplaceId:args.workplaceId,lessonStartsAt:args.startsAt,
   lessonDurationMinutes:args.durationMinutes,
   historicalRecords:"preserved",groupMemberships:"unchanged",
   credits:"retained; no redemption, transfer, extension or refund",
   writesPerformed:false,
   nextStep:"Ask the teacher to explicitly approve each archived ID, workplace, lesson time and reason. Then call ccp_lessons_archived_recovery_commit with the exact reviewed revisions and a new request ID. Cancelling leaves everything unchanged.",
  },
 };
}

export async function teacherArchivedLessonRecoveryCommit(
 db:SupabaseClient,teacherId:string,input:ArchivedLessonRecoveryCommitInput
){
 void teacherId; // SQL uses auth.uid() and enforces tenant isolation.
 const args=archivedLessonRecoveryCommitSchema.parse(input);
 assertSessionSchedule(args.startsAt,args.durationMinutes);
 const {data,error}=await db.rpc("ccp_teacher_archived_lesson_recovery_commit",{
  p_workplace_id:args.workplaceId,p_student_ids:args.studentIds,
  p_reactivations:args.reactivations,p_title:args.title,
  p_starts_at:args.startsAt,p_duration_minutes:args.durationMinutes,
  p_lesson_note:args.lessonNote,p_request_id:args.requestId,
  p_reason:args.reason,p_confirmed:true,
 });
 if(error){
  const message=error.message??"";
  if(error.code==="42501"||/NOT_FOUND|NOT_PREVIOUSLY_VERIFIED/.test(message))
   throw new CoachError("NOT_FOUND",404,
    "A student or historically verified workplace is no longer available");
  if(error.code==="23505"||error.code==="23P01"||
    error.code==="23514"||error.code==="23503"||
    /CONFLICT|REVISION|CAPACITY|FUTURE_COMMITMENTS|ALREADY_ACTIVE/.test(message))
   throw new CoachError("CONFLICT",409,
    "Student state, capacity or lesson schedule changed; review the lesson again");
  if(error.code==="22023"||error.code==="22P02"||/INVALID|REQUIRES_REVIEW/.test(message))
   throw new CoachError("VALIDATION_ERROR",400,"Invalid reviewed archived lesson request");
  throw new CoachError("DATABASE_ERROR",500,"Combined lesson and reactivation failed atomically");
 }
 return data;
}
