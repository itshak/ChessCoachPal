import type {SupabaseClient} from "@supabase/supabase-js";
import {addDays,toLocalDateString} from "@/lib/schedule";

type Db=SupabaseClient;
type Session={
 id:string;teacher_id:string;workplace_id:string;student_id:string|null;
 group_id:string|null;slot_id:string|null;slot_rate_cents:number|null;
 starts_at:string;duration_minutes:number;status:string;
 local_timezone:string|null;is_home_visit:boolean;
 makeup_for_session_id:string|null;makeup_for_student_id:string|null;
};
type Student={
 id:string;name:string;guardian_id:string|null;
 default_rate_cents:number|null;travel_fee_cents:number|null;
};
export type CanonicalBillingParticipant={
 sessionId:string;studentId:string;studentName:string;
 guardianId:string|null;lessonDate:string;startsAt:string;
 durationMinutes:number;status:string;makeupForSessionId:string|null;
 isHomeVisit:boolean;slotRateCents:number|null;
 studentDefaultRateCents:number|null;studentTravelFeeCents:number|null;
 attendanceStatus:string|null;noticeAt:string|null;
};
/** A group session is one teaching event with up to 50 separate student
 * charging decisions. Never return duplicate (sessionId,studentId) pairs.
 */
export function participantBillingKey(sessionId:string,studentId:string){
 return sessionId+":"+studentId;
}
const PAGE=500,MAX_SESSIONS=20000,MAX_PARTICIPANTS=100000;
async function pages<T>(
 get:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,
 max:number,label:string
):Promise<T[]>{
 const all:T[]=[];
 for(let offset=0;;offset+=PAGE){
  const {data,error}=await get(offset,offset+PAGE-1);
  if(error)throw new Error("Unable to read "+label+": "+error.message);
  const chunk=data??[];
  if(all.length+chunk.length>max)throw new RangeError(label+" exceeds safe inventory size");
  all.push(...chunk);
  if(chunk.length<PAGE)break;
 }
 return all;
}
const chunks=<T>(values:T[],size:number):T[][]=>{
 const out:T[][]=[];for(let i=0;i<values.length;i+=size)out.push(values.slice(i,i+size));
 return out;
};
/** Source of truth shared by finance, credit balances and reports. */
export async function loadCanonicalBillingParticipants(
 db:Db,teacherId:string,periodStart:string,periodEnd:string,
 policyTimezone:string,opts:{studentIds?:string[]}={}
):Promise<CanonicalBillingParticipant[]>{
 const first=addDays(periodStart,-2),last=addDays(periodEnd,2);
 if(periodStart>periodEnd)throw new RangeError("Invalid finance period");
 const sessions=await pages<Session>(
  (lo,hi)=>db.from("teaching_sessions").select(
   "id,teacher_id,workplace_id,student_id,group_id,slot_id,slot_rate_cents,starts_at,duration_minutes,status,local_timezone,is_home_visit,makeup_for_session_id,makeup_for_student_id"
  ).eq("teacher_id",teacherId).gte("starts_at",first+"T00:00:00Z")
   .lt("starts_at",last+"T23:59:59.999Z")
   .order("starts_at").order("id").range(lo,hi),
  MAX_SESSIONS,"sessions");
 if(!sessions.length)return [];
 const ids=sessions.map(s=>s.id);
 const roster:{session_id:string;student_id:string}[]=[];
 const attendance:{session_id:string;student_id:string;status:string;notice_at:string|null}[]=[];
 for(const part of chunks(ids,75)){
  roster.push(...await pages(
   (lo,hi)=>db.from("session_participants").select("session_id,student_id")
    .eq("teacher_id",teacherId).in("session_id",part)
    .order("session_id").order("student_id").range(lo,hi),
   MAX_PARTICIPANTS,"frozen participants"));
  attendance.push(...await pages(
   (lo,hi)=>db.from("session_attendance").select("session_id,student_id,status,notice_at")
    .eq("teacher_id",teacherId).in("session_id",part)
    .order("session_id").order("student_id").range(lo,hi),
   MAX_PARTICIPANTS,"marked attendance"));
 }
 const studentIds=[...new Set(roster.map(r=>r.student_id))];
 const students:Student[]=[];
 for(const group of chunks(studentIds,100)){
  const {data,error}=await db.from("students")
   .select("id,name,guardian_id,default_rate_cents,travel_fee_cents")
   .eq("teacher_id",teacherId).in("id",group);
  if(error)throw new Error("Unable to load students for billing");
  students.push(...(data??[]));
 }
 const workplaceIds=[...new Set(sessions.map(s=>s.workplace_id))],workplaces:{
  id:string;timezone:string}[]=[];
 for(const group of chunks(workplaceIds,100)){
  const {data,error}=await db.from("workplaces").select("id,timezone")
   .eq("teacher_id",teacherId).in("id",group);
  if(error)throw new Error("Unable to load workplace timezones");
  workplaces.push(...(data??[]));
 }
 const studentById=new Map(students.map(x=>[x.id,x])),
  sessionById=new Map(sessions.map(x=>[x.id,x])),
  workplaceById=new Map(workplaces.map(x=>[x.id,x])),
  attByKey=new Map(attendance.map(x=>[participantBillingKey(x.session_id,x.student_id),x]));
 const filter=opts.studentIds?new Set(opts.studentIds):null;
 const seen=new Set<string>(),result:CanonicalBillingParticipant[]=[];
 for(const entry of roster){
  if(filter&&!filter.has(entry.student_id))continue;
  const key=participantBillingKey(entry.session_id,entry.student_id);
  if(seen.has(key))throw new Error("Duplicate canonical roster participant");
  seen.add(key);
  const session=sessionById.get(entry.session_id),student=studentById.get(entry.student_id);
  if(!session||!student)throw new Error("Unresolvable canonical billing participant");
  const zone=session.local_timezone||workplaceById.get(session.workplace_id)?.timezone||policyTimezone;
  const localDate=toLocalDateString(new Date(session.starts_at),zone);
  if(localDate<periodStart||localDate>periodEnd)continue;
  const att=attByKey.get(key);
  result.push({
   sessionId:session.id,studentId:student.id,studentName:student.name,
   guardianId:student.guardian_id,lessonDate:localDate,
   startsAt:session.starts_at,durationMinutes:session.duration_minutes,
   status:session.status,makeupForSessionId:session.makeup_for_session_id,
   isHomeVisit:Boolean(session.is_home_visit),
   // The actual occurrence owns its own rate snapshot. Changing a weekly
   // template later must never alter a prior invoice preview or credit.
   slotRateCents:session.slot_rate_cents,
   studentDefaultRateCents:student.default_rate_cents,
   studentTravelFeeCents:student.travel_fee_cents,
   attendanceStatus:att?.status??null,noticeAt:att?.notice_at??null,
  });
 }
 return result;
}
