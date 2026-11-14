import type {SupabaseClient} from "@supabase/supabase-js";

type Db=SupabaseClient;

export class SessionRosterCorrectionError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(status:number,code:string,message:string)=>
 new SessionRosterCorrectionError(status,code,message);

export async function teacherSessionRosterPreview(db:Db,teacherId:string,sessionId:string){
 const {data:session,error}=await db.from("teaching_sessions")
   .select("id,teacher_id,title,status,group_id,student_id,workplace_id,updated_at")
   .eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to load the session");
 if(!session)throw failure(404,"NOT_FOUND","Session not found");
 const {data:participants,error:membersError}=await db.from("session_participants")
   .select("student_id,students(name)")
   .eq("teacher_id",teacherId).eq("session_id",sessionId).order("student_id");
 if(membersError)throw failure(500,"DATABASE_ERROR","Unable to read session participants");
 const ids=(participants??[]).map(row=>row.student_id);
 return {
   sessionId:session.id,
   title:session.title,
   status:session.status,
   groupId:session.group_id,
   studentId:session.student_id,
   workplaceId:session.workplace_id,
   updatedAt:session.updated_at,
   studentIds:ids,
   participants:(participants??[]).map(row=>{
     const joined=row.students as {name:string}|{name:string}[]|null;
     return {studentId:row.student_id,
       name:(Array.isArray(joined)?joined[0]:joined)?.name??"Student"};
   }),
   requiresConfirmation:true,
   correctionScope:"session_snapshot_only",
 };
}

export async function teacherSessionRosterCorrect(db:Db,teacherId:string,sessionId:string,input:{
 studentIds:string[];expectedUpdatedAt:string;reason:string;idempotencyKey:string;
}){
 // Authenticated SQL uses auth.uid() for tenant scope and executes all roster,
 // attendance, revision and receipt changes in one transaction. teacherId
 // is retained for consistent domain-service signatures, not trusted by SQL.
 void teacherId;
 const {data,error}=await db.rpc("ccp_session_roster_correct",{
   p_session_id:sessionId,p_student_ids:input.studentIds,
   p_expected_updated_at:input.expectedUpdatedAt,
   p_request_id:input.idempotencyKey,p_reason:input.reason,
 });
 if(error){
   const message=error.message??"";
   if(/ROSTER_REPLAY_CONFLICT|ROSTER_REVISION_CONFLICT/.test(message))
     throw failure(409,"CONFLICT","Roster changed or this request ID was already used for different terms; re-read the session");
   if(/ROSTER_HAS_LINKED_CHESS_EVIDENCE/.test(message))
     throw failure(409,"CONFLICT","Cannot remove a student with linked material or chess observations; correct the linked evidence first");
   if(/ROSTER_STUDENT_NOT_FOUND|NOT_FOUND/.test(message))
     throw failure(404,"NOT_FOUND","Session or student not found");
   if(/INVALID_ROSTER_CORRECTION|DUPLICATE_ROSTER_STUDENT|PRIVATE_LESSON_STUDENT_REQUIRED|ROSTER_UNCHANGED/.test(message))
     throw failure(400,"VALIDATION_ERROR","Roster correction was rejected: check the unique student IDs, reason and lesson type");
   throw failure(500,"DATABASE_ERROR","Session roster correction could not be committed");
 }
 return data as {ok:true;sessionId:string;updatedAt:string;auditId:string;
   addedStudentIds:string[];removedStudentIds:string[]};
}

/** Model-visible corrections omit removed private attendance notes by default;
 * authenticated teachers may explicitly request the retained evidence. */
export async function teacherSessionRosterAudit(db:Db,teacherId:string,sessionId:string,
 includePrivate=false){
 const {data:session,error:sessionError}=await db.from("teaching_sessions")
   .select("id").eq("teacher_id",teacherId).eq("id",sessionId).maybeSingle();
 if(sessionError)throw failure(500,"DATABASE_ERROR","Unable to load session");
 if(!session)throw failure(404,"NOT_FOUND","Session not found");
 const {data,error}=await db.from("session_roster_corrections")
   .select("id,session_id,previous_students,corrected_students,removed_attendance,reason,created_at")
   .eq("teacher_id",teacherId).eq("session_id",sessionId)
   .order("created_at",{ascending:false}).limit(100);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to load roster correction history");
 return {sessionId,corrections:(data??[]).map(row=>{
   const removed=(Array.isArray(row.removed_attendance)?
     row.removed_attendance:[]) as Record<string,unknown>[];
   return {
     id:row.id,createdAt:row.created_at,reason:row.reason,
     previousStudentIds:row.previous_students,
     correctedStudentIds:row.corrected_students,
     removedAttendanceCount:removed.length,
     ...(includePrivate?{removedAttendance:removed}:{}),
   };
 })};
}
