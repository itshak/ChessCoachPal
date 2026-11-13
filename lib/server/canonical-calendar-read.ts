import type {SupabaseClient} from "@supabase/supabase-js";
import {toLocalDateString,addDays} from "@/lib/schedule";

type Db=SupabaseClient;
export type CanonicalCalendarRow={
 id:string;title:string;starts_at:string;duration_minutes:number;
 status:string;workplace_id:string;local_timezone:string|null;
 slot_id:string|null;slot_occurrence_date:string|null;
 is_home_visit:boolean;makeup_for_session_id:string|null;
 participants:{studentId:string;name:string;attendanceStatus:string|null;
  noticeAt:string|null;updatedAt:string|null;note:string;cancelReason:string}[];
};
type Session={
 id:string;title:string;starts_at:string;duration_minutes:number;status:string;
 workplace_id:string;local_timezone:string|null;slot_id:string|null;
 slot_occurrence_date:string|null;is_home_visit:boolean;
 makeup_for_session_id:string|null;
};
type Person={session_id:string;student_id:string};
type Mark={session_id:string;student_id:string;status:string;notice_at:string|null;updated_at:string;note:string;cancel_reason:string};
const PAGE=500;
async function pages<T>(
 fn:(offset:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,
 context:string,max=20000
){
 const out:T[]=[];
 for(let offset=0;;offset+=PAGE){
  const {data,error}=await fn(offset);
  if(error)throw new Error("Unable to read "+context+": "+error.message);
  out.push(...(data??[]));
  if(out.length>max)throw new RangeError(context+" exceeds safe pagination size");
  if((data?.length??0)<PAGE)break;
 }
 return out;
}
/** Load a bounded studio-local date window from only the canonical actual
 * session table. Roster is frozen; never derive historic group membership.
 * Both token-bound calendar feeds and teacher pages call this reader.
 */
export async function canonicalCalendarWindow(
 db:Db,teacherId:string,from:string,to:string,
 timezone:string,studentIds?:string[]
):Promise<CanonicalCalendarRow[]>{
 if(from>to||!Number.isFinite(Date.parse(from+"T00:00:00Z"))||
   !Number.isFinite(Date.parse(to+"T00:00:00Z")))
  throw new RangeError("Invalid calendar window");
 if((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000>366)
  throw new RangeError("Calendar window exceeds one year");
 if(studentIds?.length===0)return [];
 const earliest=addDays(from,-2)+"T00:00:00Z";
 const latest=addDays(to,3)+"T00:00:00Z";
 const sessions=await pages<Session>(offset=>db.from("teaching_sessions")
  .select("id,title,starts_at,duration_minutes,status,workplace_id,local_timezone,slot_id,slot_occurrence_date,is_home_visit,makeup_for_session_id")
  .eq("teacher_id",teacherId).gte("starts_at",earliest).lt("starts_at",latest)
  .order("starts_at").order("id").range(offset,offset+PAGE-1),
  "canonical calendar sessions");
 if(!sessions.length)return [];
 const ids=sessions.map(x=>x.id);
 const people:Person[]=[],marks:Mark[]=[];
 for(let i=0;i<ids.length;i+=60){
  const chunk=ids.slice(i,i+60);
  const [roster,decisions]=await Promise.all([
   pages<Person>(offset=>db.from("session_participants")
    .select("session_id,student_id").eq("teacher_id",teacherId)
    .in("session_id",chunk).order("session_id").order("student_id")
    .range(offset,offset+PAGE-1),"canonical calendar frozen roster"),
   pages<Mark>(offset=>db.from("session_attendance")
    .select("session_id,student_id,status,notice_at,updated_at,note,cancel_reason")
    .eq("teacher_id",teacherId).in("session_id",chunk)
    .order("session_id").order("student_id").range(offset,offset+PAGE-1),
    "canonical attendance calendar"),
  ]);
  people.push(...roster);marks.push(...decisions);
 }
 const wanted=studentIds?new Set(studentIds):null;
 const visible=people.filter(x=>!wanted||wanted.has(x.student_id));
 const idSet=[...new Set(visible.map(x=>x.student_id))];
 const names=new Map<string,string>();
 for(let i=0;i<idSet.length;i+=100){
  const {data,error}=await db.from("students")
   .select("id,name").eq("teacher_id",teacherId)
   .in("id",idSet.slice(i,i+100));
  if(error)throw new Error("Unable to read calendar student names");
  for(const r of data??[])names.set(r.id,r.name);
 }
 const marksByKey=new Map(marks.map(x=>[
  x.session_id+":"+x.student_id,x,
 ]));
 const peopleBySession=new Map<string,CanonicalCalendarRow["participants"]>();
 for(const p of visible){
  const x=marksByKey.get(p.session_id+":"+p.student_id);
  const group=peopleBySession.get(p.session_id)??[];
  group.push({studentId:p.student_id,name:names.get(p.student_id)??"Student",
   attendanceStatus:x?.status??null,noticeAt:x?.notice_at??null,
   updatedAt:x?.updated_at??null,note:x?.note??"",cancelReason:x?.cancel_reason??""});
  peopleBySession.set(p.session_id,group);
 }
 return sessions.filter(s=>{
  const localDate=toLocalDateString(new Date(s.starts_at),s.local_timezone||timezone);
  return from<=localDate&&localDate<=to&&peopleBySession.has(s.id);
 }).map(s=>({...s,participants:peopleBySession.get(s.id)!}));
}
