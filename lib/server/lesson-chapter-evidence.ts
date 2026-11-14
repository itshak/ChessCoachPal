import "server-only";
import {createHash} from "node:crypto";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {teacherStudyIndexGet} from "@/lib/server/teacher-study-index";

const uuid=z.uuid();
const core=z.object({
 sessionId:uuid,studyId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 chapterId:z.string().regex(/^[A-Za-z0-9]{8}$/),
 stage:z.enum(["assigned","taught"]),
 note:z.string().max(2000).default(""),
}).strict();
export const lessonChapterPreviewSchema=core;
export const lessonChapterCommitSchema=core.extend({
 expectedVerifiedAt:z.iso.datetime({offset:true}),
 expectedRosterHash:z.string().regex(/^[a-f0-9]{32}$/),
 requestId:uuid,confirmed:z.literal(true),
}).strict();
export class ChapterEvidenceError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new ChapterEvidenceError(status,code,message);
type Db=SupabaseClient;
const hash=(ids:string[])=>createHash("md5").update(ids.sort().join(",")).digest("hex");
export async function teacherLessonChapterPreview(db:Db,teacherId:string,
 input:z.infer<typeof lessonChapterPreviewSchema>){
 const a=lessonChapterPreviewSchema.parse(input);
 const [{data:session,error:se},chapter,{data:participants,error:pe}]=await Promise.all([
  db.from("teaching_sessions").select("id,title,workplace_id,starts_at,local_timezone,status,duration_minutes")
   .eq("teacher_id",teacherId).eq("id",a.sessionId).maybeSingle(),
  teacherStudyIndexGet(db,teacherId,{studyId:a.studyId,chapterId:a.chapterId}),
  db.from("session_participants").select("student_id")
   .eq("teacher_id",teacherId).eq("session_id",a.sessionId).order("student_id").limit(101),
 ]);
 if(se||pe)throw fail(503,"PREVIEW_UNAVAILABLE","Cannot verify canonical lesson roster");
 if(!session||!participants)throw fail(404,"NOT_FOUND","Lesson not available");
 if(participants.length===101)throw fail(413,"ROSTER_LIMIT","Too many participants for a single chapter operation");
 const ids=participants.map(r=>r.student_id).sort();
 const issues:string[]=[];
 if(!ids.length)issues.push("EMPTY_ROSTER");
 if(chapter.stale)issues.push("SOURCE_STALE");
 if(session.status==="cancelled")issues.push("CANCELLED_SESSION");
 if(a.stage==="taught"&&session.status!=="completed")issues.push("LESSON_NOT_COMPLETED");
 const canCommit=issues.length===0;
 return {
  canCommit,issues,session,chapter,
  selectedStudentIds:ids,
  studentCoverageCount:ids.length,uniqueWorkplaceLessonCount:1,
  inferredMastery:false,
  proposedCommit:canCommit?{
   ...a,expectedVerifiedAt:chapter.verified_at,
   expectedRosterHash:hash(ids),
  }:null,
  warning:"A link alone never proves teaching or comprehension. 'taught' is an explicit teacher attestation for a completed lesson. Every frozen student receives one separate evidence row.",
 };
}
export async function teacherLessonChapterCommit(db:Db,teacherId:string,
 input:z.infer<typeof lessonChapterCommitSchema>){
 void teacherId; // auth.uid() inside one authoritative SQL transaction.
 const a=lessonChapterCommitSchema.parse(input);
 const {data,error}=await db.rpc("ccp_session_chapter_evidence_commit",{
  p_session_id:a.sessionId,p_study_id:a.studyId,p_chapter_id:a.chapterId,
  p_stage:a.stage,p_note:a.note,p_expected_verified_at:a.expectedVerifiedAt,
  p_expected_roster_hash:a.expectedRosterHash,p_request_id:a.requestId,
 });
 if(error){
  if(/REPLAY|STALE|ROSTER_CHANGED/.test(error.message)||error.code==="23505")
   throw fail(409,"CONFLICT","Reviewed chapter or roster changed; preview before retry");
  if(/SESSION_STATUS/.test(error.message)||error.code==="23514")
   throw fail(409,"SESSION_STATUS","Complete the lesson before marking a chapter taught");
  if(/NOT_FOUND|NOT_INDEXED/.test(error.message)||error.code==="42501")
   throw fail(404,"NOT_FOUND","Lesson or verified chapter not available");
  if(/INVALID/.test(error.message)||error.code==="22023")
   throw fail(400,"VALIDATION_ERROR","Invalid chapter evidence request");
  throw fail(503,"DATABASE_ERROR","Cannot atomically record session chapter evidence");
 }
 return data as {sessionId:string;materialId:string;linkId:string;stage:string;
   participantCoverages:number;uniqueWorkplaceLessonCount:number;
   inferredMastery:boolean;replayed:boolean};
}
