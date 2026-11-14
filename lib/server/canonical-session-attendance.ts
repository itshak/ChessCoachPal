import type {SupabaseClient} from "@supabase/supabase-js";

type Db=SupabaseClient;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses=["present","late","absent","excused","student_cancelled","teacher_cancelled"] as const;
export type CanonicalAttendanceStatus=(typeof statuses)[number];
export type CanonicalAttendanceSetInput={
 studentId:string;
 status:CanonicalAttendanceStatus|null;
 note:string;
 noticeAt:string|null;
 cancelReason:string;
 expectedUpdatedAt:string|null;
 idempotencyKey:string;
 notifyFamily:boolean;
 confirmed?:boolean;
 confirmedEmail?:boolean;
};
export class CanonicalAttendanceError extends Error{
 constructor(public code:string,public status:number,message:string){super(message);}
}
function fail(code:string,status:number,message:string):never{
 throw new CanonicalAttendanceError(code,status,message);
}
export function validateCanonicalAttendance(input:CanonicalAttendanceSetInput){
 if(!input||!uuid.test(input.studentId)||!uuid.test(input.idempotencyKey)||
  (input.status!==null&&!statuses.includes(input.status as CanonicalAttendanceStatus))||
  typeof input.note!=="string"||input.note.length>5000||
  typeof input.cancelReason!=="string"||input.cancelReason.length>1000||
  typeof input.notifyFamily!=="boolean"||
  (input.noticeAt!==null&&(typeof input.noticeAt!=="string"||
     !Number.isFinite(Date.parse(input.noticeAt))))||
  (input.expectedUpdatedAt!==null&&(typeof input.expectedUpdatedAt!=="string"||
     !Number.isFinite(Date.parse(input.expectedUpdatedAt)))))
  fail("VALIDATION_ERROR",400,"Invalid participant attendance update");
 if(input.status==="student_cancelled"&&input.noticeAt===null)
  fail("VALIDATION_ERROR",400,"Student cancellation needs notice time");
 if(input.status!=="student_cancelled"&&input.status!=="teacher_cancelled"&&
   (input.noticeAt!==null||input.cancelReason!==""))
  fail("VALIDATION_ERROR",400,"Cancellation metadata is only allowed for cancellation");
 if(input.notifyFamily&&(input.status!=="teacher_cancelled"||
   input.confirmed!==true||input.confirmedEmail!==true))
  fail("CONFIRMATION_REQUIRED",400,"Explicit teacher and email confirmation is required");
 return input;
}
export async function canonicalAttendanceList(db:Db,teacherId:string,sessionId:string){
 if(!uuid.test(sessionId))fail("VALIDATION_ERROR",400,"Invalid session ID");
 const own=await db.from("teaching_sessions").select("id")
   .eq("id",sessionId).eq("teacher_id",teacherId).maybeSingle();
 if(own.error)fail("DATABASE_ERROR",500,"Unable to verify session ownership");
 if(!own.data)fail("NOT_FOUND",404,"Session not found");
 const [roster,marked]=await Promise.all([
  db.from("session_participants").select("student_id")
   .eq("teacher_id",teacherId).eq("session_id",sessionId),
  db.from("session_attendance")
   .select("student_id,status,note,notice_at,cancelled_by,cancel_reason,marked_at,marked_by,updated_at")
   .eq("teacher_id",teacherId).eq("session_id",sessionId),
 ]);
 if(roster.error||marked.error)fail("DATABASE_ERROR",500,"Attendance register unavailable");
 const byId=new Map((marked.data??[]).map(x=>[x.student_id,x]));
 return (roster.data??[]).map(x=>({
  studentId:x.student_id,status:byId.get(x.student_id)?.status??"unmarked",
  note:byId.get(x.student_id)?.note??"",
  noticeAt:byId.get(x.student_id)?.notice_at??null,
  cancelledBy:byId.get(x.student_id)?.cancelled_by??null,
  cancelReason:byId.get(x.student_id)?.cancel_reason??"",
  markedAt:byId.get(x.student_id)?.marked_at??null,
  markedBy:byId.get(x.student_id)?.marked_by??null,
  updatedAt:byId.get(x.student_id)?.updated_at??null,
 }));
}
export async function canonicalAttendanceSet(
 db:Db,teacherId:string,sessionId:string,input:CanonicalAttendanceSetInput
){
 void teacherId; // SQL auth.uid and frozen-roster FKs are authoritative.
 if(!uuid.test(sessionId))fail("VALIDATION_ERROR",400,"Invalid session ID");
 validateCanonicalAttendance(input);
 const {data,error}=await db.rpc("ccp_canonical_attendance_mutate",{
  p_session_id:sessionId,p_student_id:input.studentId,
  p_status:input.status,p_note:input.note,
  p_notice_at:input.noticeAt,p_cancel_reason:input.cancelReason,
  p_expected_updated_at:input.expectedUpdatedAt,
  p_idempotency_key:input.idempotencyKey,
  p_notify_family:input.notifyFamily,
 });
 if(error){
  if(error.message.includes("CANONICAL_ATTENDANCE_NOT_FOUND")||
     error.code==="42501")fail("NOT_FOUND",404,"Session or frozen participant not found");
  if(error.message.includes("CANONICAL_ATTENDANCE_REVISION_CONFLICT")||
     error.message.includes("CANONICAL_ATTENDANCE_REPLAY_CONFLICT")||
     error.message.includes("CANONICAL_ATTENDANCE_HAS_MAKEUP")||
     error.code==="23505"||error.code==="23514")
    fail("CONFLICT",409,"Attendance has changed or is linked to protected teaching history");
  if(error.message.includes("CANONICAL_ATTENDANCE_INVALID_REQUEST")||
     error.code==="22023")fail("VALIDATION_ERROR",400,"Invalid attendance decision");
  fail("DATABASE_ERROR",500,"Unable to update attendance");
 }
 return data;
}


export type CanonicalAttendanceBulkInput={
 idempotencyKey:string;
 attendance:Omit<CanonicalAttendanceSetInput,"idempotencyKey">[];
};
export async function canonicalAttendanceBulkSet(
 db:Db,teacherId:string,sessionId:string,input:CanonicalAttendanceBulkInput
){
 void teacherId;
 if(!uuid.test(sessionId)||!input||!uuid.test(input.idempotencyKey)||
   !Array.isArray(input.attendance)||input.attendance.length<1||
   input.attendance.length>50)
  fail("VALIDATION_ERROR",400,"Invalid canonical attendance batch");
 const seen=new Set<string>();
 const attendance=input.attendance.map(row=>{
  validateCanonicalAttendance({...row,idempotencyKey:input.idempotencyKey});
  if(seen.has(row.studentId))fail("VALIDATION_ERROR",400,"Duplicate frozen participant");
  seen.add(row.studentId);
  return {
   studentId:row.studentId,status:row.status,note:row.note,
   noticeAt:row.noticeAt,cancelReason:row.cancelReason,
   expectedUpdatedAt:row.expectedUpdatedAt,notifyFamily:row.notifyFamily,
  };
 });
 const {data,error}=await db.rpc("ccp_canonical_attendance_bulk_mutate",{
  p_session_id:sessionId,p_rows:attendance,p_idempotency_key:input.idempotencyKey,
 });
 if(error){
  if(error.message.includes("CANONICAL_ATTENDANCE_BULK_REPLAY_CONFLICT")||
     error.message.includes("CANONICAL_ATTENDANCE_REVISION_CONFLICT")||
     error.code==="23505"||error.code==="23514")
    fail("CONFLICT",409,"One or more participant decisions are stale or protected");
  if(error.message.includes("CANONICAL_ATTENDANCE_NOT_FOUND")||
     error.code==="42501")
    fail("NOT_FOUND",404,"Session or participant not found");
  if(error.code==="22023"||error.message.includes("CANONICAL_ATTENDANCE_BULK_INVALID"))
    fail("VALIDATION_ERROR",400,"Invalid attendance batch");
  fail("DATABASE_ERROR",500,"Unable to record attendance batch");
 }
 return data;
}
