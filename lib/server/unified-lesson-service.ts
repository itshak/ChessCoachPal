import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPolicy} from "@/lib/server/scheduling";
import {validateReportRange,workplaceDay} from "@/lib/coaching-report";
import {reconcileLessons,type LessonTimelineItem} from "@/lib/unified-lesson-history";
import {oneToOne} from "@/lib/schedule";

type Db=SupabaseClient;
const uuid=z.string().uuid();
export const unifiedLessonFilter=z.object({
 from:z.string().date(),to:z.string().date(),
 studentId:uuid.optional(),workplaceId:uuid.optional(),
 offset:z.number().int().min(0).max(100000).default(0),
 limit:z.number().int().min(1).max(100).default(50),
}).strict().refine(v=>v.from<=v.to,{message:"Invalid chronological range"});
export class UnifiedHistoryError extends Error{
 constructor(public status:number,public code:string,message:string){super(message);}
}
const fail=(status:number,code:string,message:string)=>new UnifiedHistoryError(status,code,message);
type Filter=z.infer<typeof unifiedLessonFilter>;
type Modern={
 id:string;starts_at:string;duration_minutes:number;status:string;student_id:string|null;
 workplace_id:string;group_id:string|null;title:string;
};
type Legacy={
 id:string;student_id:string;starts_at:string;duration_minutes:number;
 lesson_date:string;is_home_visit:boolean;attendance:{status:string}|{status:string}[]|null;
};
type Roster={session_id:string;student_id:string};
type Register={session_id:string;student_id:string;status:string};
async function collectPages<T>(
 fetchPage:(offset:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,
 max=5000
):Promise<T[]>{
 const all:T[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await fetchPage(offset);
  if(error)throw fail(500,"DATABASE_ERROR","Unable to read lesson history");
  all.push(...(data??[]));
  if(all.length>max)throw fail(413,"RANGE_TOO_LARGE","Choose a shorter lesson-history date range");
  if((data?.length??0)<500)break;
 }
 return all;
}
export async function teacherUnifiedLessonHistory(db:Db,teacherId:string,filter:Filter){
 try {validateReportRange(filter.from,filter.to);}
 catch{throw fail(400,"VALIDATION_ERROR","Date range must be valid and at most 367 days");}
 const [{data:student,error:studentError},{data:workplace,error:workplaceError},policy]=await Promise.all([
  filter.studentId?db.from("students").select("id").eq("teacher_id",teacherId)
   .eq("id",filter.studentId).maybeSingle():Promise.resolve({data:null,error:null}),
  filter.workplaceId?db.from("workplaces").select("id,timezone").eq("teacher_id",teacherId)
   .eq("id",filter.workplaceId).maybeSingle():Promise.resolve({data:null,error:null}),
  getPolicy(db,teacherId),
 ]);
 if(studentError||workplaceError)throw fail(500,"DATABASE_ERROR","History authorization unavailable");
 if(filter.studentId&&!student)throw fail(404,"NOT_FOUND","Student not found");
 if(filter.workplaceId&&!workplace)throw fail(404,"NOT_FOUND","Workplace not found");
 // Read a UTC superset, then filter by the specified teacher/workplace IANA timezone.
 const timezone=workplace?.timezone??policy.timezone;
 const start=new Date(Date.parse(filter.from+"T00:00:00Z")-86400000).toISOString();
 const end=new Date(Date.parse(filter.to+"T00:00:00Z")+2*86400000).toISOString();
 const sessions=await collectPages<Modern>(offset=>{
  let q=db.from("teaching_sessions").select(
   "id,starts_at,duration_minutes,status,student_id,workplace_id,group_id,title"
  ).eq("teacher_id",teacherId).gte("starts_at",start).lt("starts_at",end)
   .order("id").range(offset,offset+499);
  if(filter.workplaceId)q=q.eq("workplace_id",filter.workplaceId);
  return q;
 });
 const sessionIds=sessions.map(x=>x.id);
 const roster:Roster[]=[],register:Register[]=[];
 for(let index=0;index<sessionIds.length;index+=50){
  const ids=sessionIds.slice(index,index+50);
  const [people,attendance]=await Promise.all([
   db.from("session_participants").select("session_id,student_id").eq("teacher_id",teacherId)
    .in("session_id",ids).limit(5000),
   db.from("session_attendance").select("session_id,student_id,status")
    .eq("teacher_id",teacherId).in("session_id",ids).limit(5000),
  ]);
  if(people.error||attendance.error)throw fail(500,"DATABASE_ERROR","Unable to inspect lesson participants");
  roster.push(...(people.data??[]));register.push(...(attendance.data??[]));
 }
 const rosterBySession=new Map<string,string[]>();
 for(const row of roster){
  const ids=rosterBySession.get(row.session_id)??[];
  ids.push(row.student_id);rosterBySession.set(row.session_id,ids);
 }
 const evidenceBySession=new Set(register.filter(r=>r.status==="present"||r.status==="late")
  .map(x=>x.session_id));
 const records:LessonTimelineItem[]=[];
 for(const session of sessions){
  if(workplaceDay(session.starts_at,timezone)<filter.from||
     workplaceDay(session.starts_at,timezone)>filter.to)continue;
  const students=rosterBySession.get(session.id)??(
   session.student_id?[session.student_id]:[]);
  if(filter.studentId&&!students.includes(filter.studentId))continue;
  records.push({
   id:"coaching:"+session.id,kind:"coaching",startsAt:session.starts_at,
   durationMinutes:session.duration_minutes,studentIds:students,
   status:session.status,workplaceId:session.workplace_id,
   booked:session.status!=="cancelled",
   delivered:session.status==="completed"||evidenceBySession.has(session.id),
  });
 }
 // Legacy private lessons have no workplace FK. A current workplace enrollment
 // does NOT prove a historic lesson's workplace; never guess or duplicate it.
 if(!filter.workplaceId){
  const legacy=await collectPages<Legacy>(offset=>db.from("lessons")
   .select("id,student_id,starts_at,duration_minutes,lesson_date,is_home_visit,attendance!lesson_id(status)")
   .eq("teacher_id",teacherId).gte("starts_at",start).lt("starts_at",end)
   .order("id").range(offset,offset+499));
  for(const lesson of legacy){
   if(workplaceDay(lesson.starts_at,timezone)<filter.from||
      workplaceDay(lesson.starts_at,timezone)>filter.to)continue;
   if(filter.studentId&&lesson.student_id!==filter.studentId)continue;
   const status=oneToOne(lesson.attendance)?.status??"unmarked";
   records.push({
    id:"legacy:"+lesson.id,kind:"legacy",startsAt:lesson.starts_at,
    durationMinutes:lesson.duration_minutes,studentIds:[lesson.student_id],
    status,workplaceId:null,booked:!["teacher_cancel","student_cancel"].includes(status),
    delivered:status==="attended",
   });
  }
 }
 const result=reconcileLessons(records);
 const ordered=result.entries.sort((a,b)=>b.startsAt.localeCompare(a.startsAt)||
  a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
 const limit=Math.min(100,Math.max(1,filter.limit??50));
 const offset=Math.min(100000,Math.max(0,filter.offset??0));
 return {entries:ordered.slice(offset,offset+limit),total:ordered.length,
  nextOffset:offset+limit<ordered.length?offset+limit:null,
  summary:{bookedInstructorMinutes:result.bookedInstructorMinutes,
   evidencedInstructorMinutes:result.evidencedInstructorMinutes,
   possibleCrossModelDuplicates:result.possibleCrossModelDuplicates,
   coachingSessionCount:records.filter(x=>x.kind==="coaching").length,
   unattributedLegacyLessonCount:records.filter(x=>x.kind==="legacy").length,
  },filter:{...filter,timezone},warnings:[
   "Booked minutes do not prove material was taught. Evidenced minutes require completed coaching sessions or recorded attendance.",
   "Exact cross-model overlaps are flagged but not automatically erased. Both histories remain accessible.",
   ...(filter.workplaceId?["Legacy lessons lack a workplace ID and cannot be attributed to this workplace report."] : []),
  ],summaryScope:"complete_bounded_date_range"};
}
