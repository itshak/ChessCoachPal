import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {assertSessionSchedule} from "@/lib/server/coach-service";

/**
 * Complete a single ad-hoc multi-student lesson, including a distinct
 * teacher-attested attendance decision/note for every frozen participant.
 * The SQL function owns creation+completion as ONE transaction. It does not
 * infer that a material was taught or that a pupil mastered a skill.
 */
const uuid=z.string().uuid();
const attendanceRow=z.object({
 studentId:uuid,
 status:z.enum(["present","absent","late","excused","student_cancelled","teacher_cancelled"]),
 note:z.string().max(5000).default(""),
 noticeAt:z.iso.datetime({offset:true}).optional(),
 cancelReason:z.string().max(1000).optional(),
}).strict().superRefine((row,ctx)=>{
 const cancelled=row.status==="student_cancelled"||row.status==="teacher_cancelled";
 if(row.status==="student_cancelled"&&!row.noticeAt)
  ctx.addIssue({code:"custom",message:"Student cancellation requires actual notice time"});
 if(!cancelled&&(row.noticeAt!==undefined||row.cancelReason!==undefined))
  ctx.addIssue({code:"custom",message:"Only cancellation attendance can have notice metadata"});
});

export const completedGroupCaptureSchema=z.object({
 workplaceId:uuid,
 studentIds:z.array(uuid).min(2).max(50),
 title:z.string().trim().min(1).max(160),
 startsAt:z.iso.datetime({offset:true}),
 durationMinutes:z.number().int().min(15).max(480),
 lessonNote:z.string().max(10000).default(""),
 attendance:z.array(attendanceRow).min(2).max(50),
 requestId:uuid,
 confirmed:z.literal(true),
}).strict().superRefine((v,ctx)=>{
 const ids=new Set(v.studentIds);
 if(ids.size!==v.studentIds.length)
  ctx.addIssue({code:"custom",path:["studentIds"],message:"Duplicate learner IDs are not allowed"});
 const attendanceIds=new Set(v.attendance.map(row=>row.studentId));
 if(attendanceIds.size!==v.attendance.length||attendanceIds.size!==ids.size||
    [...ids].some(id=>!attendanceIds.has(id)))
  ctx.addIssue({code:"custom",path:["attendance"],
    message:"Every frozen learner needs exactly one explicitly attested attendance decision"});
});
export type CompletedGroupCapture=z.infer<typeof completedGroupCaptureSchema>;
export class CompletedGroupCaptureError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>
 new CompletedGroupCaptureError(status,code,message);

export async function teacherCompletedGroupCapture(
 db:SupabaseClient,_teacherId:string,input:CompletedGroupCapture,
) {
 void _teacherId; // auth.uid() owns every row inside the SQL transaction.
 const p=completedGroupCaptureSchema.parse(input);
 try{assertSessionSchedule(p.startsAt,p.durationMinutes);}
 catch{throw fail(400,"VALIDATION_ERROR","Invalid lesson start/duration; use a real ISO time with offset");}
 const {data,error}=await db.rpc("ccp_teacher_completed_group_lesson_create",{
  p_workplace_id:p.workplaceId,
  p_student_ids:p.studentIds,
  p_title:p.title,
  p_starts_at:p.startsAt,
  p_duration_minutes:p.durationMinutes,
  p_lesson_note:p.lessonNote,
  p_attendance:p.attendance,
  p_request_id:p.requestId,
 });
 if(error){
  if(error.code==="23505"||/REPLAY|CONFLICT|OVERLAP|ROSTER/.test(error.message))
   throw fail(409,"CONFLICT","Lesson or approval changed; review roster, schedule and retry key");
  if(error.code==="42501"||/NOT_FOUND|UNAUTHENTICATED/.test(error.message))
   throw fail(404,"NOT_FOUND","Workplace or enrolled students are unavailable");
  if(error.code==="22023"||/INVALID|DUPLICATE|INCOMPLETE/.test(error.message))
   throw fail(400,"VALIDATION_ERROR","Invalid frozen roster, notes or attendance; review every learner");
  throw fail(503,"DATABASE_ERROR","Completed lesson transaction is unavailable");
 }
 if(!data||typeof data!=="object"||data.status!=="completed"||
    data.oneTransaction!==true||typeof data.sessionId!=="string")
  throw fail(503,"DATABASE_ERROR","Incomplete completed lesson receipt");
 return data as {
  sessionId:string;workplaceId:string;status:"completed";
  rosterMode:"ad_hoc";participantCount:number;instructorMinutes:number;
  attendance:Array<{studentId:string;status:string;hasNote:boolean}>;
  oneTransaction:true;inferredMastery:false;replayed:boolean;
 };
}
