import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {getPolicy} from "@/lib/server/scheduling";
import {validateReportRange,workplaceDay} from "@/lib/coaching-report";
import {unionMinutes,type LessonTimelineItem} from "@/lib/unified-lesson-history";

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
type Session={
 id:string;starts_at:string;duration_minutes:number;status:string;
 student_id:string|null;workplace_id:string;group_id:string|null;
 title:string;local_timezone:string|null;
};
type Participant={session_id:string;student_id:string};
type Decision={session_id:string;student_id:string;status:string};
const PAGE=500;
async function collectPages<T>(
 fetchPage:(offset:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,
 max=10000
):Promise<T[]>{
 const rows:T[]=[];
 for(let offset=0;;offset+=PAGE){
  const {data,error}=await fetchPage(offset);
  if(error)throw fail(500,"DATABASE_ERROR","Unable to read canonical lesson history");
  rows.push(...(data??[]));
  if(rows.length>max)throw fail(413,"RANGE_TOO_LARGE",
    "Choose a shorter lesson-history date range");
  if((data?.length??0)<PAGE)break;
 }
 return rows;
}
export async function teacherUnifiedLessonHistory(db:Db,teacherId:string,filter:Filter){
 try{validateReportRange(filter.from,filter.to);}
 catch{throw fail(400,"VALIDATION_ERROR","Date range must be valid and at most 367 days");}
 const [{data:student,error:studentError},{data:workplace,error:workplaceError},policy]=await Promise.all([
  filter.studentId?db.from("students").select("id").eq("teacher_id",teacherId)
   .eq("id",filter.studentId).maybeSingle():Promise.resolve({data:null,error:null}),
  filter.workplaceId?db.from("workplaces").select("id,timezone")
   .eq("teacher_id",teacherId).eq("id",filter.workplaceId).maybeSingle():
   Promise.resolve({data:null,error:null}),
  getPolicy(db,teacherId),
 ]);
 if(studentError||workplaceError)throw fail(500,"DATABASE_ERROR",
   "History authorization unavailable");
 if(filter.studentId&&!student)throw fail(404,"NOT_FOUND","Student not found");
 if(filter.workplaceId&&!workplace)throw fail(404,"NOT_FOUND","Workplace not found");
 const zone=workplace?.timezone??policy.timezone;
 const start=new Date(Date.parse(filter.from+"T00:00:00Z")-2*86400000).toISOString();
 const end=new Date(Date.parse(filter.to+"T00:00:00Z")+3*86400000).toISOString();
 const sessions=await collectPages<Session>(offset=>{
  let q=db.from("teaching_sessions").select(
   "id,starts_at,duration_minutes,status,student_id,workplace_id,group_id,title,local_timezone"
  ).eq("teacher_id",teacherId).gte("starts_at",start).lt("starts_at",end)
   .order("starts_at").order("id").range(offset,offset+PAGE-1);
  if(filter.workplaceId)q=q.eq("workplace_id",filter.workplaceId);
  return q;
 });
 const rosters:Participant[]=[],register:Decision[]=[];
 for(let index=0;index<sessions.length;index+=50){
  const ids=sessions.slice(index,index+50).map(x=>x.id);
  const [people,attendance]=await Promise.all([
   collectPages<Participant>(offset=>db.from("session_participants")
    .select("session_id,student_id").eq("teacher_id",teacherId)
    .in("session_id",ids).order("session_id").order("student_id")
    .range(offset,offset+PAGE-1),5000),
   collectPages<Decision>(offset=>db.from("session_attendance")
    .select("session_id,student_id,status").eq("teacher_id",teacherId)
    .in("session_id",ids).order("session_id").order("student_id")
    .range(offset,offset+PAGE-1),5000),
  ]);
  rosters.push(...people);register.push(...attendance);
 }
 const rosterBySession=new Map<string,string[]>();
 for(const row of rosters){
  const ids=rosterBySession.get(row.session_id)??[];
  ids.push(row.student_id);rosterBySession.set(row.session_id,ids);
 }
 const evidenceBySession=new Set(register.filter(r=>
  r.status==="present"||r.status==="late").map(r=>r.session_id));
 const records:LessonTimelineItem[]=[];
 for(const session of sessions){
  const effectiveZone=session.local_timezone??zone;
  const date=workplaceDay(session.starts_at,effectiveZone);
  if(date<filter.from||date>filter.to)continue;
  const students=rosterBySession.get(session.id)??(
   session.student_id?[session.student_id]:[]);
  if(filter.studentId&&!students.includes(filter.studentId))continue;
  records.push({
   id:session.id,kind:"coaching",startsAt:session.starts_at,
   durationMinutes:session.duration_minutes,studentIds:students,
   status:session.status,workplaceId:session.workplace_id,
   booked:session.status!=="cancelled",
   delivered:session.status==="completed"||evidenceBySession.has(session.id),
  });
 }
 const ordered=records.sort((a,b)=>b.startsAt.localeCompare(a.startsAt)||
  a.id.localeCompare(b.id));
 const limit=filter.limit??50,offset=filter.offset??0;
 return {entries:ordered.slice(offset,offset+limit),total:ordered.length,
  nextOffset:offset+limit<ordered.length?offset+limit:null,
  summary:{
   bookedInstructorMinutes:unionMinutes(records,"booked"),
   evidencedInstructorMinutes:unionMinutes(records,"delivered"),
   canonicalSessionCount:records.length,
   participantAttendanceDecisions:register.length,
  },
  filter:{...filter,timezone:zone},
  warnings:["Booked minutes do not prove material was taught. Evidenced minutes require completed sessions or recorded attendance."],
  summaryScope:"complete_bounded_date_range"};
}
