import type {SupabaseClient} from "@supabase/supabase-js";
import {getPolicy} from "@/lib/server/scheduling";
import {recordedWorkplaceTimezones} from "@/lib/server/teacher-workplace-context";
import {creditIsValid,toLocalDateString} from "@/lib/schedule";

import type {CancellationPolicySnapshotOrigin} from "./workplace-cancellation-policy";

type Db=SupabaseClient;
type Mark={
 session_id:string;student_id:string;status:string;
 notice_at:string|null;marked_at:string|null;updated_at:string;
 cancellation_policy_snapshot_origin:CancellationPolicySnapshotOrigin|null;
 cancellation_was_timely_snapshot:boolean|null;
 cancellation_timely_earns_makeup_snapshot:boolean|null;
 cancellation_late_earns_makeup_snapshot:boolean|null;
};
type Session={
 id:string;starts_at:string;duration_minutes:number;status:string;
 workplace_id:string;local_timezone:string|null;
};
type Student={id:string;name:string};
export type CanonicalMakeupCredit={
 sourceSessionId:string;studentId:string;studentName:string;
 status:"absent"|"student_cancelled"|"teacher_cancelled";
 missedAt:string;durationMinutes:number;earnedAt:string;workplaceId:string;sourceTimezone:string;
};
const PAGE=500;
async function rows<T>(
 fn:(start:number,end:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>,
 name:string,max=20000
):Promise<T[]>{
 const all:T[]=[];
 for(let start=0;;start+=PAGE){
  const {data,error}=await fn(start,start+PAGE-1);
  if(error)throw new Error("Unable to load "+name+": "+error.message);
  all.push(...(data??[]));
  if(all.length>max)throw new RangeError(name+" exceeds the safe row limit");
  if((data?.length??0)<PAGE)break;
 }
 return all;
}
/** Frozen-participant make-up eligibility. The exact same policy and source
 * identifiers are revalidated inside ccp_canonical_private_session_create
 * under a row lock; this list is advisory, not an authorization token.
 */
export async function canonicalMakeupCreditsList(
 db:Db,teacherId:string
):Promise<CanonicalMakeupCredit[]>{
 const policy=await getPolicy(db,teacherId);
 const [attendance,replacements]=await Promise.all([
  rows<Mark>((start,end)=>db.from("session_attendance")
   .select("session_id,student_id,status,notice_at,marked_at,updated_at,cancellation_policy_snapshot_origin,cancellation_was_timely_snapshot,cancellation_timely_earns_makeup_snapshot,cancellation_late_earns_makeup_snapshot")
   .eq("teacher_id",teacherId)
   .in("status",["absent","student_cancelled","teacher_cancelled"])
   .order("session_id").order("student_id").range(start,end),
   "canonical cancellations"),
  rows<{makeup_for_session_id:string;makeup_for_student_id:string}>(
   (start,end)=>db.from("teaching_sessions")
    .select("makeup_for_session_id,makeup_for_student_id")
    .eq("teacher_id",teacherId).not("makeup_for_session_id","is",null)
    .order("makeup_for_session_id").order("makeup_for_student_id")
    .range(start,end),"used make-up credits"),
 ]);
 if(!attendance.length)return [];
 const consumed=new Set(replacements.map(x=>x.makeup_for_session_id+":"+x.makeup_for_student_id));
 const sessionIds=[...new Set(attendance.map(x=>x.session_id))];
 const studentIds=[...new Set(attendance.map(x=>x.student_id))];
 const sessions=new Map<string,Session>(),students=new Map<string,string>();
 for(let i=0;i<sessionIds.length;i+=100){
  const {data,error}=await db.from("teaching_sessions")
    .select("id,starts_at,duration_minutes,status,workplace_id,local_timezone")
    .eq("teacher_id",teacherId).in("id",sessionIds.slice(i,i+100));
  if(error)throw new Error("Unable to load missed canonical sessions");
  for(const row of (data??[]) as Session[])sessions.set(row.id,row);
 }
 for(let i=0;i<studentIds.length;i+=100){
  const {data,error}=await db.from("students").select("id,name")
   .eq("teacher_id",teacherId).in("id",studentIds.slice(i,i+100));
  if(error)throw new Error("Unable to load make-up student names");
  for(const row of (data??[]) as Student[])students.set(row.id,row.name);
 }
 const zones=await recordedWorkplaceTimezones(db,teacherId,[...sessions.values()].filter(s=>!s.local_timezone).map(s=>s.workplace_id));
 const out:CanonicalMakeupCredit[]=[];
 for(const a of attendance){
  const session=sessions.get(a.session_id);
  if(!session||consumed.has(a.session_id+":"+a.student_id))continue;
  const earnedAt=a.marked_at??a.updated_at;
  if(!creditIsValid(earnedAt,policy))continue;
  let qualifies=false;
  switch(a.status){
   case "teacher_cancelled":qualifies=policy.teacher_cancel_earns_makeup;break;
   case "absent":qualifies=policy.no_show_earns_makeup;break;
   case "student_cancelled":{
    if(a.cancellation_policy_snapshot_origin==="restored_unverified")break;
    if(a.cancellation_policy_snapshot_origin==="observed"){
     qualifies=(a.cancellation_was_timely_snapshot===true?
       a.cancellation_timely_earns_makeup_snapshot:a.cancellation_late_earns_makeup_snapshot)===true;
     break;
    }
    // No historical terms were captured. Preserve legacy global behavior;
    // a venue override introduced later must not manufacture old evidence.
    const notice=a.notice_at?Date.parse(a.notice_at):NaN;
    const advance=Date.parse(session.starts_at)-notice;
    const timely=Number.isFinite(advance)&&
      advance>=policy.cancellation_window_hours*3600000;
    qualifies=timely?policy.timely_cancel_earns_makeup:
      policy.late_cancel_earns_makeup;
    break;
   }
  }
  if(!qualifies)continue;
  out.push({
   sourceSessionId:a.session_id,studentId:a.student_id,
   studentName:students.get(a.student_id)??"Student",
   status:a.status as CanonicalMakeupCredit["status"],
   missedAt:session.starts_at,durationMinutes:session.duration_minutes,
   earnedAt,workplaceId:session.workplace_id,sourceTimezone:session.local_timezone??zones.get(session.workplace_id)??policy.timezone,
  });
 }
 out.sort((a,b)=>a.missedAt.localeCompare(b.missedAt)||a.sourceSessionId.localeCompare(b.sourceSessionId));
 return out;
}
