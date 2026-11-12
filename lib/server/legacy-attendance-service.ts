import type { SupabaseClient } from "@supabase/supabase-js";
import {createHash} from "node:crypto";
import { getPolicy } from "@/lib/server/scheduling";
import {
 resolveStudentCancelNoticeAt, type StudentCancelNoticeChoice,
 BULK_ATTENDANCE_STATUSES, formatLessonTime, formatLessonDate,
 ATTENDANCE_LABELS, oneToOne,
} from "@/lib/schedule";
import { emailFamilyTeacherCancel, emailFamiliesTeacherCancelBulk } from "@/lib/server/lesson-cancel-email";
import { sendEmail as deliverEmail } from "@/lib/email";
import { familyEmailRecipients, familyGreetingNames, familyEmailBcc, type FamilyContact } from "@/lib/guardians";
import type { AttendanceStatus } from "@/lib/supabase/types";

type Db=SupabaseClient;
export class LegacyAttendanceError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(s:number,c:string,m:string)=>new LegacyAttendanceError(s,c,m);
type Context={origin:string;teacherEmail?:string|null;suppressIndividualEmail?:boolean};
export type AttendanceInput={
 status:"attended"|"teacher_cancel"|"student_cancel"|"no_show"|null;
 noticeChoice?:StudentCancelNoticeChoice;noticeAt?:string|null;cancelNote?:string;
 notifyFamily?:boolean;
 /** Explicit optimistic precondition; null means no attendance exists. */
 expectedMarkedAt?:string|null;
 /** Reuse on timeout; same UUID+payload returns the saved result. */
 idempotencyKey?:string;
};
export type NotesInput={body?:string;privateBody?:string;sendEmail?:boolean};
export type BulkAttendanceInput={
 ids:string[];status:"attended"|"no_show"|"teacher_cancel";notifyFamily?:boolean;
 /** For replay across website/MCP, pair this with a stable request UUID. */
 idempotencyKey?:string;
 /** The original marked_at of EACH lesson; null means no prior decision. */
 expectedMarkedAtByLesson?:Record<string,string|null>;
};
/** The root request is never used as a per-lesson receipt key because a bulk
 * command must be safely replayed after partial per-lesson completion. */
function bulkChildRequestId(root:string,lessonId:string):string{
 const h=createHash("sha256").update("ccp-calendar-attendance-bulk\0")
  .update(root).update("\0").update(lessonId).digest("hex").slice(0,32);
 return h.slice(0,8)+"-"+h.slice(8,12)+"-4"+h.slice(13,16)+
  "-8"+h.slice(17,20)+"-"+h.slice(20);
}
async function ownedLesson(db:Db,teacherId:string,id:string) {
 const {data,error}=await db.from("lessons").select("id,starts_at,student_id")
  .eq("id",id).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Lesson unavailable");
 if(!data)throw failure(404,"NOT_FOUND","Lesson not found");
 return data;
}
export async function calendarAttendanceRead(db:Db,teacherId:string,lessonId:string) {
 await ownedLesson(db,teacherId,lessonId);
 const {data,error}=await db.from("attendance")
  .select("id,lesson_id,status,notice_at,cancel_note,marked_at")
  .eq("lesson_id",lessonId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to read attendance");
 return data;
}
export async function calendarAttendanceWrite(db:Db,teacherId:string,lessonId:string,
 input:AttendanceInput,ctx:Context){
 const lesson=await ownedLesson(db,teacherId,lessonId);
 if(input.notifyFamily===true&&input.status!=="teacher_cancel")
  throw failure(400,"VALIDATION_ERROR","Only teacher cancellation sends cancellation messages");
 if(input.status==="teacher_cancel"&&input.notifyFamily===true&&!ctx.origin)
  throw failure(400,"VALIDATION_ERROR","Trusted origin is required to notify families");
 if(input.status!==null&&!["attended","teacher_cancel","student_cancel","no_show"].includes(input.status))
  throw failure(400,"VALIDATION_ERROR","Invalid attendance status");
 if(input.idempotencyKey&&input.status==="student_cancel"&&
    (!input.noticeAt&&(input.noticeChoice??"now")==="now"))
  throw failure(400,"VALIDATION_ERROR",
   "A replayable student cancellation requires an explicit noticeAt timestamp");
 const cancelNote=typeof input.cancelNote==="string"?input.cancelNote.trim().slice(0,1000):"";
 let noticeAt:string|null=null;
 if(input.status==="student_cancel"){
  const policy=await getPolicy(db,teacherId);
  const choice=input.noticeChoice??"now";
  if(!["now","timely","late","custom"].includes(choice))
   throw failure(400,"VALIDATION_ERROR","Invalid cancellation notice choice");
  noticeAt=resolveStudentCancelNoticeAt(choice,lesson.starts_at,
   policy.cancellation_window_hours,input.noticeAt??null);
 }
 // Both the website and the delegated MCP can supply the same signed
 // precondition+key. Older UI callers without either get a freshly observed
 // precondition and a new UUID; they STILL pass through the same SQL writer.
 const suppliedKey=input.idempotencyKey!==undefined;
 const suppliedRevision=input.expectedMarkedAt!==undefined;
 if(suppliedKey!==suppliedRevision)
  throw failure(400,"VALIDATION_ERROR",
   "Provide both an attendance revision and idempotency key");
 let expected=input.expectedMarkedAt??null;
 if(!suppliedRevision){
  const {data:current,error:readError}=await db.from("attendance")
   .select("marked_at").eq("lesson_id",lessonId).maybeSingle();
  if(readError)throw failure(500,"DATABASE_ERROR","Unable to read attendance revision");
  expected=current?.marked_at??null;
 }
 const requestId=input.idempotencyKey??crypto.randomUUID();
 const {data,error}=await db.rpc("ccp_calendar_attendance_commit",{
  p_lesson_id:lessonId,p_status:input.status,
  p_notice_at:noticeAt,p_cancel_note:cancelNote,
  p_expected_marked_at:expected,p_idempotency_key:requestId,
  p_notify_family:input.notifyFamily===true,
 });
 if(error){
  if(error.code==="23505"||/REVISION_CONFLICT|REPLAY_CONFLICT/.test(error.message))
   throw failure(409,"CONFLICT","Attendance changed; reload and retry with the current revision");
  if(error.code==="42501")
   throw failure(404,"NOT_FOUND","Lesson not found");
  if(error.code==="22023")
   throw failure(400,"VALIDATION_ERROR","Invalid attendance decision");
  throw failure(500,"DATABASE_ERROR","Unable to commit attendance atomically");
 }
 if(input.status===null)return {ok:true,cleared:true,
  idempotencyKey:requestId,replayed:data?.replayed===true};
 let emailed=false,emailError:string|undefined;
 // The replay is a database read, not a second permission to send email.
 // Email delivery still requires an outbox/receipt for crash-safe exactly-once.
 if(data?.replayed!==true&&input.status==="teacher_cancel"&&input.notifyFamily===true
    &&!ctx.suppressIndividualEmail){
  const policy=await getPolicy(db,teacherId);
  const result=await emailFamilyTeacherCancel({
   supabase:db,lessonId,teacherId,teacherEmail:ctx.teacherEmail,
   policy,cancelNote,origin:ctx.origin,
  });
  emailed=result.emailed;emailError=result.emailError;
 }
 return {...data,emailed,emailError};
}

export async function calendarAttendanceBulk(db:Db,teacherId:string,input:BulkAttendanceInput,ctx:Context) {
 if(!BULK_ATTENDANCE_STATUSES.includes(input.status as AttendanceStatus))
  throw failure(400,"VALIDATION_ERROR","Invalid bulk attendance status");
 if(!input.ids.length||input.ids.length>50||new Set(input.ids).size!==input.ids.length)
  throw failure(400,"VALIDATION_ERROR","Provide 1–50 distinct lesson IDs");
 if(input.status==="teacher_cancel"&&input.notifyFamily===true&&!ctx.origin)
  throw failure(400,"VALIDATION_ERROR","Trusted origin is required to notify families");
 const keyed=input.idempotencyKey!==undefined;
 const revisioned=input.expectedMarkedAtByLesson!==undefined;
 if(keyed!==revisioned)
  throw failure(400,"VALIDATION_ERROR",
   "Bulk replay requires both idempotencyKey and all original lesson revisions");
 if(keyed){
  const values=input.expectedMarkedAtByLesson!;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
   .test(input.idempotencyKey!)||
   Object.keys(values).length!==input.ids.length||
   input.ids.some(id=>!Object.prototype.hasOwnProperty.call(values,id)||
     values[id]!==null&&
      (typeof values[id]!=="string"||!Number.isFinite(Date.parse(values[id])))))
   throw failure(400,"VALIDATION_ERROR","Provide a valid request UUID and each original attendance revision");
 }
 const {data:owned,error:lookup}=await db.from("lessons")
  .select("id").eq("teacher_id",teacherId).in("id",input.ids);
 if(lookup)throw failure(500,"DATABASE_ERROR","Unable to validate lesson ownership");
 const available=new Set((owned??[]).map(x=>x.id));
 const failed:{id:string;error:string}[]=[];
 const newlyCancelled:string[]=[];
 let succeeded=0,emailed=0;
 for(const id of input.ids){
  if(!available.has(id)){failed.push({id,error:"Not found"});continue;}
  try{
   const result=await calendarAttendanceWrite(db,teacherId,id,{
    status:input.status,notifyFamily:input.notifyFamily===true,
    ...(keyed?{
      expectedMarkedAt:input.expectedMarkedAtByLesson![id],
      idempotencyKey:bulkChildRequestId(input.idempotencyKey!,id),
    }:{}),
   },{...ctx,suppressIndividualEmail:true});
   succeeded++;
   if(input.status==="teacher_cancel"&&result.replayed!==true)
    newlyCancelled.push(id);
  }catch(error){
   failed.push({id,error:error instanceof LegacyAttendanceError
    ?error.message:"Unable to record attendance"});
  }
 }
 if(input.status==="teacher_cancel"&&input.notifyFamily===true&&newlyCancelled.length){
  const policy=await getPolicy(db,teacherId);
  const result=await emailFamiliesTeacherCancelBulk({
   supabase:db,lessonIds:newlyCancelled,teacherId,teacherEmail:ctx.teacherEmail,
   policy,origin:ctx.origin,
  });
  emailed=result.emailed;
 }
 return {ok:failed.length===0,succeeded,emailed,failed};
}

export async function calendarLessonNoteRead(db:Db,teacherId:string,lessonId:string){
 await ownedLesson(db,teacherId,lessonId);
 const {data,error}=await db.from("lesson_notes")
 .select("id,lesson_id,body,private_body,shared_with_parent,emailed_at")
 .eq("lesson_id",lessonId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to read lesson notes");
 return data;
}
export async function calendarLessonNoteWrite(db:Db,teacherId:string,lessonId:string,
 input:NotesInput,ctx:Context){
 await ownedLesson(db,teacherId,lessonId);
 if(input.sendEmail===true&&!ctx.origin)
  throw failure(400,"VALIDATION_ERROR","Trusted origin is required to send lesson notes");
 const familyBody=typeof input.body==="string"?input.body.trim():"";
 const privateBody=typeof input.privateBody==="string"?input.privateBody.trim():"";
 const shared=familyBody.length>0;
 const {data:note,error}=await db.from("lesson_notes").upsert({
  lesson_id:lessonId,body:familyBody,private_body:privateBody,shared_with_parent:shared,
 },{onConflict:"lesson_id"}).select().single();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to save lesson notes");
 let emailed=false,emailError:string|undefined;
 if(input.sendEmail===true){
  if(!shared){emailError="Add notes for the student or parent before emailing";}
  else{
   const {data:lesson}=await db.from("lessons").select(
    "id,starts_at,students (name,guardians (name,email,secondary_name,secondary_email,email_recipients,portal_token)),attendance!lesson_id (status)"
   ).eq("id",lessonId).eq("teacher_id",teacherId).single();
   const student=oneToOne(lesson?.students as unknown as {
    name:string;guardians:(FamilyContact&{portal_token:string|null})|null;
   }[]|null);
   const family=student?.guardians;
   const recipients=family?familyEmailRecipients(family):[];
   if(!student||!family||!recipients.length)emailError="No family email on file";
   else {
    if(!ctx.origin)throw failure(400,"VALIDATION_ERROR","Trusted origin is required to send lesson notes");
    const policy=await getPolicy(db,teacherId);
    const when=`${formatLessonDate(lesson!.starts_at,policy.timezone,"long")} at ${formatLessonTime(lesson!.starts_at,policy.timezone)}`;
    const signature=policy.studio_name?`— ${policy.studio_name} (via ChessCoachPal)`:"— ChessCoachPal";
    const attendance=oneToOne(lesson?.attendance as unknown as {status:AttendanceStatus}[]|null);
    const statusLine=attendance?`Status: ${ATTENDANCE_LABELS[attendance.status]}\n\n`:"";
    const result=await deliverEmail({
      to:recipients,bcc:familyEmailBcc(policy),
      subject:`Lesson notes for ${student.name} — ${when}`,
      text:`Hi ${familyGreetingNames(family)},\n\nNotes from ${student.name}'s lesson on ${when}:\n\n${statusLine}${familyBody}\n\n${signature}`,
      fromName:policy.studio_name?`${policy.studio_name} (via ChessCoachPal)`:undefined,
      replyTo:ctx.teacherEmail??undefined,
      portalUrl:family.portal_token?`${ctx.origin}/portal/${family.portal_token}`:undefined,
    });
    emailed=result.sent;emailError=result.error;
    if(emailed)await db.from("lesson_notes").update({emailed_at:new Date().toISOString()}).eq("lesson_id",lessonId);
   }
  }
 }
 return {...note,emailed,emailError};
}
