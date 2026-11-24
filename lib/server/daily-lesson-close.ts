import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";

export const dailyCloseScope=z.string().uuid().nullable();
export const dailyCloseRosterInput=z.object({
  sessionId:z.string().uuid(),dailyWorkplaceId:dailyCloseScope.optional(),
}).strict();
export class DailyCloseError extends Error {
  constructor(public status:number,public code:string,message:string){super(message)}
}
type Mark={student_id:string;status:string;note:string;updated_at:string};
type Source={id:string;title:string;workplace_id:string;updated_at:string;status:string;starts_at:string;
  duration_minutes:number;roster:{student_id:string;student:{name:string}|null}[];decisions:Mark[]};

/** Read-only exact frozen review. The existing completion SQL still owns all writes. */
export async function teacherDailyClosePreview(db:SupabaseClient,teacherId:string,
  sessionId:string,expectedWorkplaceId:string|null,now=new Date(),
){
  const context=await teacherWorkplaceContextGet(db,teacherId);
  if(context.selectionWasStale||context.selectedWorkplaceId!==expectedWorkplaceId)
    throw new DailyCloseError(409,"STALE_WORKPLACE_CONTEXT","Workplace selection changed");
  let query=db.from("teaching_sessions").select(
    "id,title,workplace_id,updated_at,status,starts_at,duration_minutes,"+
    "roster:session_participants!session_participants_session_id_teacher_id_fkey(student_id,student:students!session_participants_student_id_teacher_id_fkey(name)),"+
    "decisions:session_attendance!session_attendance_session_id_teacher_id_fkey(student_id,status,note,updated_at)",
  ).eq("teacher_id",teacherId).eq("id",sessionId)
    .order("student_id",{referencedTable:"roster"})
    .limit(51,{referencedTable:"roster"}).limit(51,{referencedTable:"decisions"});
  if(expectedWorkplaceId)query=query.eq("workplace_id",expectedWorkplaceId);
  const {data,error}=await query.maybeSingle().overrideTypes<Source|null,{merge:false}>();
  if(error)throw new DailyCloseError(500,"DATABASE_ERROR","Unable to read exact lesson");
  if(!data)throw new DailyCloseError(404,"NOT_FOUND","Lesson not found");
  if(data.status!=="scheduled")
    throw new DailyCloseError(409,"LESSON_NOT_SCHEDULED","This lesson is not scheduled");
  if(Date.parse(data.starts_at)+data.duration_minutes*60_000>now.getTime())
    throw new DailyCloseError(409,"LESSON_NOT_ENDED","This lesson has not ended");
  if(!data.roster.length||data.roster.length>50||data.decisions.length>50)
    throw new DailyCloseError(409,"LESSON_ROSTER_UNAVAILABLE","This lesson has no supported frozen roster");
  if(data.decisions.some(row=>row.status==="student_cancelled"||row.status==="teacher_cancelled"))
    throw new DailyCloseError(409,"LESSON_CANCELLATION_REVIEW_REQUIRED","Review recorded cancellations in schedule attendance");
  const decisions=new Map(data.decisions.map(row=>[row.student_id,row]));
  return {
    sessionId:data.id,title:data.title,status:data.status,updatedAt:data.updated_at,
    workplaceId:data.workplace_id,dailyWorkplaceId:expectedWorkplaceId,
    participants:data.roster.map(row=>({studentId:row.student_id,name:row.student?.name??"Student"})),
    attendance:data.roster.map(row=>decisions.get(row.student_id)??{
      student_id:row.student_id,status:"unmarked",note:"",updated_at:null,
    }),
    requiresConfirmation:true,
  };
}
