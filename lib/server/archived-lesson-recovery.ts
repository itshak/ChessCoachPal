import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {CoachError,assertSessionSchedule} from "@/lib/server/coach-service";
import {studentLifecyclePreview} from "@/lib/server/student-lifecycle-service";
import {loadAccountEntitlementSummary} from "@/lib/server/entitlements";
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

type CreditPackageSummary={
 workplaceId:string|null;purchasedCredits:number;redeemedCredits:number;
 adjustmentCredits:number;expiresOn:string|null;
};

function retainedCreditNotice(packages:unknown,workplaceId:string,lessonDate:string){
 if(!Array.isArray(packages))
  throw new CoachError("PREVIEW_UNAVAILABLE",503,"Cannot verify held credit evidence");
 const counts={packagesWithUnusedUnits:0,expiredBeforeLesson:0,scopedToAnotherWorkplace:0};
 for(const p of packages as CreditPackageSummary[]){
  if(!p||![p.purchasedCredits,p.redeemedCredits,p.adjustmentCredits].every(Number.isSafeInteger))
   throw new CoachError("PREVIEW_UNAVAILABLE",503,"Cannot verify held credit balances");
  if(p.purchasedCredits-p.redeemedCredits+p.adjustmentCredits<=0)continue;
  counts.packagesWithUnusedUnits++;
  if(p.expiresOn!==null&&p.expiresOn<lessonDate)counts.expiredBeforeLesson++;
  if(p.workplaceId!==null&&p.workplaceId!==workplaceId)counts.scopedToAnotherWorkplace++;
 }
 return counts;
}

async function recoveryCapacity(db:SupabaseClient,requestedReactivations:number){
 try{
  const {studentCapacity,activeStudentCount}=await loadAccountEntitlementSummary(db);
  const limit=studentCapacity.unlimited?null:studentCapacity.limit;
  if(!studentCapacity.unlimited&&limit===null)throw new Error("Missing student ceiling");
  const remaining=limit===null?null:Math.max(0,limit-activeStudentCount);
  const projectedActiveStudentCount=activeStudentCount+requestedReactivations;
  return {
   advisory:true,requestedReactivations,activeStudentCount,projectedActiveStudentCount,
   limit,remaining,blocked:limit!==null&&projectedActiveStudentCount>limit,
  };
 }catch{
  throw new CoachError("PREVIEW_UNAVAILABLE",503,"Cannot verify aggregate active-student capacity");
 }
}

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
 const isHistorical=Date.parse(args.startsAt)<Date.now();
 if(isHistorical)
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
 const archived=args.studentIds.flatMap(id=>{
  const student=byId.get(id);
  return student&&student.archived_at!==null?[student]:[];
 });
 const fullyOwned=Boolean(workplace)&&byId.size===args.studentIds.length;
 const capacity=fullyOwned&&!isHistorical&&archived.length>0?
  await recoveryCapacity(db,archived.length):null;
 if(capacity?.blocked)issues.push(issue("CAPACITY_EXCEEDED",
  "This exact roster would exceed active-student capacity. Review a smaller roster or the account limit; no one has been reactivated."));
 const checked=await Promise.all(archived.map(async s=>{
  const details=await studentLifecyclePreview(db,teacherId,{studentId:s.id});
  const valid=details.archived===true&&details.canReactivate===true&&
    Array.isArray(details.previousWorkplaceIds)&&
    details.previousWorkplaceIds.includes(args.workplaceId);
  return {valid,entry:{studentId:s.id,name:s.name,expectedUpdatedAt:details.expectedUpdatedAt,
   previousWorkplaceIds:details.previousWorkplaceIds,
   creditPolicy:details.creditPolicy??"hold_without_refund_or_expiry_change",
   creditNotice:fullyOwned&&!isHistorical&&valid?
    retainedCreditNotice(details.creditPackages,args.workplaceId,day):null}};
 }));
 for(const {valid,entry} of checked){
  if(!valid)issues.push(issue("WORKPLACE_NOT_PREVIOUSLY_VERIFIED",
   "Reactivation requires this student's previously verified workplace",entry.studentId));
 }
 const lifecycle=checked.map(({entry})=>entry);
 if(archived.length===0)issues.push(issue("NO_ARCHIVED_STUDENT",
  "Use ordinary lesson creation when nobody needs reactivation"));
 for(const id of args.studentIds){
  if(byId.get(id)?.archived_at===null&&!activeEnrolled.has(id))
   issues.push(issue("STUDENT_NOT_ENROLLED",
    "An active student is not enrolled in this workplace for the scheduled date",id));
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
   return {studentId:id,name:s?.name??null,archived:s ? s.archived_at!==null : null,
    expectedUpdatedAt:s?.archived_at!==null?s?.updated_at:null};
  }),
  reactivations:lifecycle,
  capacity,
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
   credits:"Retained only. Notice counts are independent of funding and do not authorize spending, redemption, transfer, extension or refund.",
   writesPerformed:false,
   nextStep:capacity?.blocked?"Review a smaller roster or account capacity before requesting approval. No changes were made.":isHistorical?"Review the existing session and use the canonical session notes workflow for a note correction without reactivation. Do not create a new lesson from this preview.":"Ask the teacher to explicitly approve each archived ID, workplace, lesson time and reason. Then call ccp_lessons_archived_recovery_commit with the exact reviewed revisions and a new request ID. Cancelling leaves everything unchanged.",
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
  if(error.code==="23514"&&message==="CAPACITY_EXCEEDED")
   throw new CoachError("CAPACITY_EXCEEDED",409,
    "Active-student capacity changed or cannot fit the approved roster; no changes were saved");
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
