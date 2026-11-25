import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {teacherHistoricalAttendanceReport,teacherHistoricalAttendanceSummary} from "@/lib/server/teacher-historical-attendance";
import {workplaceDay} from "@/lib/coaching-report";

export const learnerEvidenceSchema=z.object({studentId:z.string().uuid()}).strict();
export class LearnerEvidenceError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const unavailable=()=>new LearnerEvidenceError(503,"DATABASE_ERROR","Learner evidence unavailable");
const limit=10;
function attestedLocalDate(instant:string,timezone:string|null){
 if(!timezone)return null;
 try{return workplaceDay(instant,timezone);}
 catch{return null;}
}
const canonicalStatus=z.enum(["present","late","absent","excused","student_cancelled","teacher_cancelled"]);
const historicalStatus=z.enum(["present","late","absent","excused"]);
const historicalTotals=z.object({
 datedObservations:z.number().int().nonnegative(),
 aggregateSourceRows:z.number().int().nonnegative(),
 aggregateDeclaredLessons:z.number().int().nonnegative(),
});
type Input=z.infer<typeof learnerEvidenceSchema>;

export async function teacherLearnerEvidence(db:SupabaseClient,teacherId:string,{studentId}:Input){
 const owner=await db.from("students").select("id,archived_at")
  .eq("teacher_id",teacherId).eq("id",studentId).maybeSingle();
 if(owner.error)throw unavailable();
 if(!owner.data)throw new LearnerEvidenceError(404,"NOT_FOUND","Student not found");
 const [sessions,imported,summary]=await Promise.all([
  db.from("teaching_sessions").select(
   "id, starts_at, local_timezone, workplace_id, roster:session_participants!session_participants_session_id_teacher_id_fkey!inner(student_id)",
   {count:"exact"},
  ).eq("teacher_id",teacherId).eq("status","completed").eq("roster.student_id",studentId)
   .order("starts_at",{ascending:false}).order("id",{ascending:false}).limit(limit),
  teacherHistoricalAttendanceReport(db,teacherId,{studentId,limit,offset:0}),
  teacherHistoricalAttendanceSummary(db,teacherId,{studentId}),
 ]).catch(()=>{throw unavailable();});
 const totals=historicalTotals.safeParse(summary);
 if(sessions.error||sessions.count===null||!totals.success)throw unavailable();
 const canonical=sessions.data??[];
 const source=imported.records;
 const workplaces=[...new Set([...canonical,...source].map(r=>r.workplace_id))];
 const [decisions,labels]=await Promise.all([
  canonical.length?db.from("session_attendance").select("session_id,status")
   .eq("teacher_id",teacherId).eq("student_id",studentId).in("session_id",canonical.map(s=>s.id)):
   Promise.resolve({data:[],error:null}),
  workplaces.length?db.from("workplaces").select("id,name")
   .eq("teacher_id",teacherId).in("id",workplaces):Promise.resolve({data:[],error:null}),
 ]);
 if(decisions.error||labels.error)throw unavailable();
 const bySession=new Map((decisions.data??[]).map(d=>[d.session_id,d.status]));
 const byWorkplace=new Map((labels.data??[]).map(w=>[w.id,w.name]));
 const workplace=(id:string)=>({id,name:byWorkplace.get(id)??null});
 return {
  studentId,archived:owner.data.archived_at!==null,limit,
  completed:{total:sessions.count,records:canonical.map(s=>({
   sessionId:s.id,startsAt:s.starts_at,workplace:workplace(s.workplace_id),
   // Do not attribute an old session to today's teacher or enrollment timezone.
   localDate:attestedLocalDate(s.starts_at,s.local_timezone),
   attendance:canonicalStatus.safeParse(bySession.get(s.id)).data??"unknown" as const,
  }))},
  imported:{totalRows:imported.totalRows,...totals.data,records:source.map(r=>{
   const attribution={evidenceId:r.id,workplace:workplace(r.workplace_id),sourceRow:r.source_row,
    sourceTimezone:r.source_timezone};
   return r.mode==="dated"?{...attribution,kind:"dated" as const,
    date:r.attended_on,attendance:historicalStatus.safeParse(r.attendance_status).data??"unknown" as const}:
    {...attribution,kind:"aggregate" as const,periodStart:r.period_start,
     periodEnd:r.period_end,declaredLessons:r.lesson_count};
  })},
 };
}
