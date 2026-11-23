import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {workplaceLocalToUtc,utcToWorkplaceLocal} from "@/lib/coaching-time";
import {toLocalDateString} from "@/lib/schedule";
import {loadAccountEntitlementSummary} from "@/lib/server/entitlements";
import {lessonEnrollmentPeriods,effectiveLessonWorkplaces} from "@/lib/server/lesson-enrollment-periods";
import {lessonIntervalConflicts} from "@/lib/server/lesson-schedule-inference";

const uuid=z.uuid();
const attendance=z.object({studentId:uuid,status:z.enum(["present","late","excused"])}).strict();
const wall=z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const fields=z.object({
 workplaceId:uuid,
 studentIds:z.array(uuid).min(1).max(50),
 title:z.string().trim().min(1).max(160),
 startsAt:z.iso.datetime({offset:true}),
 localStart:wall,
 durationMinutes:z.number().int().min(15).max(480),
 attendance:z.array(attendance).min(1).max(50),
}).strict().superRefine((row,ctx)=>{
 const ids=new Set(row.studentIds),attested=new Set(row.attendance.map(x=>x.studentId));
 if(ids.size!==row.studentIds.length||attested.size!==row.attendance.length||
  ids.size!==attested.size||[...ids].some(id=>!attested.has(id))||
  !row.attendance.some(x=>x.status==="present"||x.status==="late"))
  ctx.addIssue({code:"custom",message:"Choose each learner and their explicit outcome exactly once, including at least one present or late learner"});
});
const calendarPin=z.object({
 teacherDay:z.iso.date(),teacherTimezone:z.string().min(1).max(80),
 venueDay:z.iso.date(),venueTimezone:z.string().min(1).max(80),
}).strict();
const calendar=calendarPin.extend({evaluatedAt:z.iso.datetime({offset:true})});
export const completedArchivedRecoveryPreviewSchema=fields;
export const completedArchivedRecoveryCommitSchema=fields.safeExtend({
 calendar:calendarPin,
 offsetMinutes:z.number().int().min(-840).max(840),
 reactivations:z.array(z.object({studentId:uuid,expectedUpdatedAt:z.iso.datetime({offset:true})}).strict()).min(1).max(50),
 reason:z.string().trim().min(8).max(1000),
 requestId:uuid,confirmed:z.literal(true),
});
export class CompletedArchivedRecoveryError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const error=(status:number,code:string,message:string)=>new CompletedArchivedRecoveryError(status,code,message);

export async function teacherCompletedArchivedRecoveryPreview(
 db:SupabaseClient,teacherId:string,input:z.infer<typeof fields>,
){
 const args=fields.parse(input);
 const clock=await db.rpc("ccp_completed_archived_recovery_calendar",{p_workplace_id:args.workplaceId});
 if(clock.error?.code==="42501")throw error(404,"NOT_FOUND","Workplace or its reviewed calendar is unavailable");
 const parsed=calendar.safeParse(clock.data);
 if(clock.error||!parsed.success)throw error(503,"PREVIEW_UNAVAILABLE","Cannot read the database recovery calendar");
 const {evaluatedAt,...pin}=parsed.data;
 const start=Date.parse(args.startsAt),end=start+args.durationMinutes*60000;
 const offsetMinutes=(Date.parse(args.localStart+"Z")-start)/60000;
 const issues:{code:string;studentId?:string}[]=[];
 if(end>Date.parse(evaluatedAt)||
  ![start,end].every(instant=>toLocalDateString(new Date(instant),pin.teacherTimezone)===pin.teacherDay&&
   toLocalDateString(new Date(instant),pin.venueTimezone)===pin.venueDay))
  issues.push({code:"COMPLETED_RECOVERY_SAME_DAY_ONLY"});
 try{
  const endWall=utcToWorkplaceLocal(new Date(end).toISOString(),pin.venueTimezone);
  if(!Number.isInteger(offsetMinutes)||Math.abs(offsetMinutes)>840||
   Date.parse(workplaceLocalToUtc(args.localStart,pin.venueTimezone))!==start||
   Date.parse(workplaceLocalToUtc(endWall,pin.venueTimezone))!==end||
   Date.parse(endWall+"Z")-Date.parse(args.localStart+"Z")!==args.durationMinutes*60000)
   throw new Error("Calendar binding differs");
 }catch{issues.push({code:"COMPLETED_RECOVERY_UNREVIEWED_LOCAL_TIME"});}
 const {data:students,error:readError}=await db.from("students").select("id,name,archived_at,updated_at")
  .eq("teacher_id",teacherId).in("id",args.studentIds);
 if(readError||!students)throw error(503,"PREVIEW_UNAVAILABLE","Cannot verify owned learner identities");
 if(students.length!==args.studentIds.length)throw error(404,"NOT_FOUND","One or more learners are unavailable");
 const roster=args.studentIds.map(id=>students.find(s=>s.id===id)!);
 const archived=roster.filter(s=>s.archived_at!==null);
 if(!archived.length||roster.length>1&&archived.length===roster.length)
  issues.push({code:"COMPLETED_RECOVERY_REQUIRES_ONE_OR_MIXED_ROSTER"});
 const periods=await lessonEnrollmentPeriods(db,teacherId,args.studentIds,args.workplaceId);
 for(const s of roster){
  if(s.archived_at===null){
   if(!effectiveLessonWorkplaces(periods,s.id,pin.teacherDay).has(args.workplaceId))
    issues.push({code:"STUDENT_NOT_ENROLLED",studentId:s.id});
  }else{
   if(start<Date.parse(s.archived_at))issues.push({code:"COMPLETED_RECOVERY_PRE_ARCHIVE_HISTORY",studentId:s.id});
   const archivedDay=toLocalDateString(new Date(s.archived_at),pin.teacherTimezone);
   if(!periods.some(p=>p.student_id===s.id&&p.starts_on!==null&&p.starts_on<=archivedDay&&
    p.ends_on!==null&&p.ends_on<=pin.teacherDay))
    issues.push({code:"WORKPLACE_NOT_PREVIOUSLY_VERIFIED",studentId:s.id});
  }
 }
 const summary=await loadAccountEntitlementSummary(db);
 const cap=summary.studentCapacity;
 if(!cap.unlimited&&cap.limit===null)throw error(503,"PREVIEW_UNAVAILABLE","Active-student capacity is unavailable");
 const available=cap.unlimited?null:Math.max(0,cap.limit!-summary.activeStudentCount);
 if(available!==null&&available<archived.length)issues.push({code:"CAPACITY_EXCEEDED"});
 if(!issues.length){
  for(const overlap of await lessonIntervalConflicts(db,teacherId,{
   startsAt:args.startsAt,durationMinutes:args.durationMinutes,timeSource:"explicit",slotIds:[],
  }))issues.push({code:overlap.code});
 }
 const canCommit=!issues.length;
 return {canCommit,issues,calendar:pin,writesPerformed:false,
  students:roster.map(s=>({studentId:s.id,name:s.name,archived:s.archived_at!==null})),
  activeCapacityRemaining:available,
  proposedCommit:canCommit?{...args,calendar:pin,offsetMinutes,reactivations:archived.map(s=>({
   studentId:s.id,expectedUpdatedAt:s.updated_at,
  }))}:null};
}

export async function teacherCompletedArchivedRecoveryCommit(
 db:SupabaseClient,input:z.infer<typeof completedArchivedRecoveryCommitSchema>,
){
 const a=completedArchivedRecoveryCommitSchema.parse(input);
 const {data,error:dbError}=await db.rpc("ccp_teacher_completed_archived_recovery_commit",{
  p_workplace_id:a.workplaceId,p_student_ids:a.studentIds,p_reactivations:a.reactivations,
  p_title:a.title,p_starts_at:a.startsAt,p_duration_minutes:a.durationMinutes,
  p_reviewed_teacher_day:a.calendar.teacherDay,p_reviewed_teacher_timezone:a.calendar.teacherTimezone,
  p_reviewed_venue_day:a.calendar.venueDay,p_reviewed_venue_timezone:a.calendar.venueTimezone,
  p_reviewed_local_start:a.localStart,p_reviewed_offset_minutes:a.offsetMinutes,
  p_attendance:a.attendance,p_request_id:a.requestId,p_reason:a.reason,p_confirmed:true,
 });
 if(dbError){
  if(dbError.message==="COMPLETED_RECOVERY_PREVIEW_CHANGED")
   throw error(409,"PREVIEW_CHANGED","Recovery calendar, roster or learner revision changed. Review again.");
  if(dbError.message==="CAPACITY_EXCEEDED")throw error(409,"CAPACITY_EXCEEDED","The roster cannot fit available capacity.");
  if(dbError.code==="42501")throw error(404,"NOT_FOUND","An owned learner or verified workplace is unavailable.");
  if(dbError.code==="23P01"||dbError.code==="23505")
   throw error(409,"CONFLICT","The lesson or confirmation conflicts with current records.");
  if(dbError.code==="22023"||dbError.code==="22P02"||dbError.code==="22007")
   throw error(400,"VALIDATION_ERROR","Invalid completed lesson review. Nothing was saved.");
  throw error(503,"DATABASE_ERROR","Completed recovery confirmation is unavailable.");
 }
 return data;
}
