import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";

/**
 * Commit one canonical multi-student session AND one exact indexed chapter
 * assignment inside a single PostgreSQL transaction. The normal separate
 * attendance/completion and material correction paths remain available.
 */
export const atomicLessonChapterCommitSchema=z.object({
 workplaceId:z.uuid(),
 studentIds:z.array(z.uuid()).min(2).max(50),
 title:z.string().trim().min(1).max(160),
 startsAt:z.iso.datetime({offset:true}),
 durationMinutes:z.number().int().min(15).max(480),
 lessonNote:z.string().max(10000).default(""),
 studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 chapterId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 expectedVerifiedAt:z.iso.datetime({offset:true}),
 expectedRosterHash:z.string().regex(/^[a-f0-9]{32}$/),
 note:z.string().max(2000).default(""),
 requestId:z.uuid(),
 evidenceRequestId:z.uuid(),
 confirmed:z.literal(true),
}).strict().refine(x=>x.requestId!==x.evidenceRequestId,{
 message:"Session and evidence must use distinct idempotency keys",
});
export class AtomicLessonChapterError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new AtomicLessonChapterError(status,code,message);
export async function teacherAtomicLessonChapterCommit(
 db:SupabaseClient,_teacherId:string,input:z.infer<typeof atomicLessonChapterCommitSchema>,
){
 // auth.uid(), tenant membership and source revisions are all proven by
 // two existing, transaction-coordinated SEC DEFINER SQL child routines.
 void _teacherId;
 const a=atomicLessonChapterCommitSchema.parse(input);
 // Explicit recovery is a different confirmed transaction. Do not turn an
 // archived-ID chapter commit into implicit reactivation or a NOT_FOUND.
 const {data:owned,error:lookupError}=await db.from("students")
  .select("id,archived_at").eq("teacher_id",_teacherId).in("id",a.studentIds);
 if(lookupError)throw fail(503,"DATABASE_ERROR","Learner status is unavailable");
 if(owned?.some(s=>s.archived_at!==null))
  throw fail(409,"ARCHIVED_STUDENT_CONFIRMATION_REQUIRED",
   "An archived learner was selected. Review reactivation and the lesson first; chapter assignment requires separate approval.");
 const {data,error}=await db.rpc("ccp_teacher_lesson_chapter_commit",{
  p_workplace_id:a.workplaceId,
  p_student_ids:a.studentIds,
  p_title:a.title,
  p_starts_at:a.startsAt,
  p_duration_minutes:a.durationMinutes,
  p_lesson_note:a.lessonNote,
  p_study_id:a.studyId,
  p_chapter_id:a.chapterId,
  p_expected_verified_at:a.expectedVerifiedAt,
  p_expected_roster_hash:a.expectedRosterHash,
  p_session_request_id:a.requestId,
  p_material_request_id:a.evidenceRequestId,
  p_note:a.note,
 });
 if(error){
  if(/CONFLICT|STALE|ROSTER_CHANGED|REPLAY|23505|23P01/.test(error.message)||["23505","23P01"].includes(error.code??""))
   throw fail(409,"CONFLICT","Session, roster, reviewed chapter or idempotency key changed; preview again");
  if(/NOT_FOUND|NOT_INDEXED|UNAUTHENTICATED/.test(error.message)||error.code==="42501")
   throw fail(404,"NOT_FOUND","Owned student, workplace, lesson or verified chapter not available");
  if(/INVALID|SESSION_STATUS/.test(error.message)||["22023","23514"].includes(error.code??""))
   throw fail(400,"VALIDATION_ERROR","Invalid or disallowed combined lesson/chapter approval");
  throw fail(503,"DATABASE_ERROR","Atomic lesson and material commit is unavailable");
 }
 if(!data||typeof data!=="object"||data.oneTransaction!==true)
  throw fail(503,"DATABASE_ERROR","Incomplete combined commit receipt");
 return data as {
  session:{id:string;duration_minutes:number;status:string;roster_mode:string};
  evidence:{participantCoverages:number;uniqueWorkplaceLessonCount:number;
   materialId:string;linkId:string;replayed:boolean;inferredMastery:boolean};
  oneTransaction:true;replayed:boolean;attendance:"unmarked";inferredMastery:false;
 };
}
