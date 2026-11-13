import type {SupabaseClient} from "@supabase/supabase-js";
import {earnsMakeupCredit,creditIsValid,type StudioPolicy} from "@/lib/schedule";

type Db=SupabaseClient;
type Mark={session_id:string;student_id:string;status:string;
 notice_at:string|null;marked_at:string|null};
type Session={id:string;starts_at:string;duration_minutes:number;status:string};
export type CanonicalMakeupCredit={
 sourceSessionId:string;studentId:string;studentName:string;
 status:"student_cancelled"|"teacher_cancelled"|"absent";
 missedAt:string;durationMinutes:number;noticeAt:string|null;
};

/** Read only the canonical participant cancellation register. The frozen
 * original participant, not current group membership, owns each make-up.
 */
export async function listCanonicalMakeupCredits(
 db:Db,teacherId:string,policy:StudioPolicy,
):Promise<CanonicalMakeupCredit[]>{
 const marks:Mark[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await db.from("session_attendance")
   .select("session_id,student_id,status,notice_at,marked_at")
   .eq("teacher_id",teacherId)
   .in("status",["teacher_cancelled","student_cancelled","absent"])
   .order("session_id").order("student_id").range(offset,offset+499);
  if(error)throw new Error("Unable to read canonical make-up candidates");
  marks.push(...(data??[]));
  if(marks.length>20000)throw new RangeError("Make-up register is too large");
  if((data?.length??0)<500)break;
 }
 if(!marks.length)return [];
 const ids=[...new Set(marks.map(r=>r.session_id))];
 const studentIds=[...new Set(marks.map(r=>r.student_id))];
 const sessions=new Map<string,Session>();
 const alreadyUsed=new Set<string>();
 for(let i=0;i<ids.length;i+=75){
  const chunk=ids.slice(i,i+75);
  const [source,used]=await Promise.all([
   db.from("teaching_sessions").select("id,starts_at,duration_minutes,status")
    .eq("teacher_id",teacherId).in("id",chunk),
   db.from("teaching_sessions")
    .select("makeup_for_session_id,makeup_for_student_id")
    .eq("teacher_id",teacherId).in("makeup_for_session_id",chunk),
  ]);
  if(source.error||used.error)throw new Error("Unable to verify canonical make-up history");
  for(const row of source.data??[])sessions.set(row.id,row);
  for(const row of used.data??[])if(row.makeup_for_session_id&&row.makeup_for_student_id)
   alreadyUsed.add(row.makeup_for_session_id+":"+row.makeup_for_student_id);
 }
 const names=new Map<string,string>();
 for(let i=0;i<studentIds.length;i+=100){
  const {data,error}=await db.from("students").select("id,name")
    .eq("teacher_id",teacherId).in("id",studentIds.slice(i,i+100));
  if(error)throw new Error("Unable to read make-up student names");
  for(const row of data??[])names.set(row.id,row.name);
 }
 const statusMap:{[key:string]:"teacher_cancel"|"student_cancel"|"no_show"}={
  teacher_cancelled:"teacher_cancel",
  student_cancelled:"student_cancel",absent:"no_show",
 };
 return marks.flatMap(m=>{
  const source=sessions.get(m.session_id);
  if(!source||!m.marked_at||!names.has(m.student_id)||
     alreadyUsed.has(m.session_id+":"+m.student_id))return [];
  const legacyStatus=statusMap[m.status];
  if(!legacyStatus||!earnsMakeupCredit(legacyStatus,m.notice_at,source.starts_at,policy)||
      !creditIsValid(m.marked_at,policy))return [];
  return [{sourceSessionId:m.session_id,studentId:m.student_id,
   studentName:names.get(m.student_id)!,status:m.status as CanonicalMakeupCredit["status"],
   missedAt:source.starts_at,durationMinutes:source.duration_minutes,
   noticeAt:m.notice_at}];
 });
}
