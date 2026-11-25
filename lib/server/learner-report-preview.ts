import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {validateReportRange,workplaceDay} from "@/lib/coaching-report";
import {locales} from "@/i18n/locales";

export const learnerReportPreviewInput=z.object({
  studentId:z.string().uuid(),
  workplaceId:z.string().uuid(),
  from:z.string(),
  to:z.string(),
  outputLocale:z.enum(locales),
}).strict();

type Input=z.infer<typeof learnerReportPreviewInput>;
const outcomes=z.enum(["present","late","absent","excused","student_cancelled","teacher_cancelled"]);
type Outcome=z.infer<typeof outcomes>|"unknown";
const limit=500;

export class LearnerReportPreviewError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const unavailable=()=>new LearnerReportPreviewError(503,"DATABASE_ERROR","Learner report preview unavailable");

/** A live, teacher-only candidate, not an approved or durable publication. */
export async function teacherLearnerReportPreview(db:SupabaseClient,teacherId:string,
    {studentId,workplaceId,from,to,outputLocale}:Input){
  try{validateReportRange(from,to);}
  catch{throw new LearnerReportPreviewError(400,"VALIDATION_ERROR","Invalid report range");}
  const [student,workplace]=await Promise.all([
    db.from("students").select("id").eq("teacher_id",teacherId).eq("id",studentId).maybeSingle(),
    db.from("workplaces").select("id").eq("teacher_id",teacherId).eq("id",workplaceId).maybeSingle(),
  ]);
  if(student.error||workplace.error)throw unavailable();
  if(!student.data||!workplace.data)throw new LearnerReportPreviewError(404,"NOT_FOUND","Learner or workplace not found");

  const day=86400000;
  const start=new Date(Date.parse(from+"T00:00:00Z")-day).toISOString();
  const end=new Date(Date.parse(to+"T00:00:00Z")+2*day).toISOString();
  // Read only the selected child's membership, never the group's other learners.
  const selected=await db.from("teaching_sessions").select(
    "id,starts_at,local_timezone,roster:session_participants!session_participants_session_id_teacher_id_fkey!inner(student_id)",
    {count:"exact"},
  ).eq("teacher_id",teacherId).eq("workplace_id",workplaceId).eq("status","completed")
    .eq("roster.student_id",studentId).gte("starts_at",start).lt("starts_at",end)
    .order("starts_at").order("id").limit(limit);
  if(selected.error||selected.count===null||!selected.data)throw unavailable();
  if(selected.count>limit)throw new LearnerReportPreviewError(413,"RANGE_TOO_LARGE","Use a shorter report range");
  if(selected.count!==selected.data.length)throw unavailable();

  const recorded=selected.data.flatMap(session=>{
    if(!session.local_timezone)return [];
    try{
      const localDate=workplaceDay(session.starts_at,session.local_timezone);
      return localDate>=from&&localDate<=to?[{id:session.id,localDate}]:[];
    }catch{return [];}
  });
  const statusBySession=new Map<string,Outcome>();
  for(let i=0;i<recorded.length;i+=30){
    const ids=recorded.slice(i,i+30).map(s=>s.id);
    const result=await db.from("session_attendance").select("session_id,status",{count:"exact"})
      .eq("teacher_id",teacherId).eq("student_id",studentId).in("session_id",ids);
    if(result.error||!result.data||result.count!==result.data.length||result.data.length>ids.length)
      throw unavailable();
    for(const row of result.data){
      if(statusBySession.has(row.session_id))throw unavailable();
      statusBySession.set(row.session_id,outcomes.safeParse(row.status).data??"unknown");
    }
  }
  // No person, session, or workspace identifiers in the report candidate itself.
  const records=recorded.map(r=>({localDate:r.localDate,attendance:statusBySession.get(r.id)??"unknown" as const}))
    .sort((a,b)=>a.localDate.localeCompare(b.localDate)||a.attendance.localeCompare(b.attendance));
  return {
    status:"teacher_preview_only" as const,
    writesPerformed:false as const,
    candidate:{from,to,outputLocale,dateBasis:"recorded_session_local_date" as const,records},
  };
}
export type LearnerReportPreview=Awaited<ReturnType<typeof teacherLearnerReportPreview>>;
