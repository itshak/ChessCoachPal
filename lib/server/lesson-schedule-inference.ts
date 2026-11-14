import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {dayOfWeek,isDateString} from "@/lib/schedule";
import {workplaceLocalToUtc} from "@/lib/coaching-time";

type Db=SupabaseClient;
type Slot={id:string;student_id:string;start_time:string;duration_minutes:number};
export type LessonTimingIssue={
  code:"MISSING_SCHEDULE"|"TIME_AMBIGUOUS"|"DST_UNRESOLVED"|
    "SCHEDULE_CONFLICT";
  message:string;
  input?:string;
  candidates?:Array<{id:string;name:string}>;
};
export type LessonTiming={
  startsAt:string;
  durationMinutes:number;
  timeSource:"explicit"|"weekly_slot";
  slotIds:string[];
};
export class LessonTimingError extends Error {
  constructor(public code:string,message:string){super(message);}
}

/**
 * Day-scoped recurrence evidence, never a guess at an omitted date.
 *
 * Only explicitly workplace-scoped canonical recurring slots are eligible.
 * A personal/unassigned slot is NOT proof of membership in a named workplace.
 * We require one matching occurrence per learner, at one identical local
 * start and duration. Two distinct common intervals are ambiguous.
 */
export async function inferOwnedWeeklyLessonTime(db:Db,teacherId:string,
 workplace:{id:string;timezone:string},date:string,studentIds:string[],
):Promise<{timing:LessonTiming|null;issues:LessonTimingIssue[]}>{
 if(!isDateString(date))throw new LessonTimingError("INVALID_DATE","Invalid local lesson date");
 const batch=250,rows:Slot[]=[];
 let complete=false;
 for(let offset=0;offset<20000;offset+=batch){
  const {data,error}=await db.from("lesson_slots")
   .select("id,student_id,start_time,duration_minutes")
   .eq("teacher_id",teacherId).eq("workplace_id",workplace.id)
   .eq("active",true).eq("day_of_week",dayOfWeek(date))
   .lte("start_date",date).or("end_date.is.null,end_date.gte."+date)
   .in("student_id",studentIds).order("id").range(offset,offset+batch-1);
  if(error||!data)throw new LessonTimingError("SLOTS_UNAVAILABLE",
   "Cannot verify the teacher-owned recurring schedule");
  rows.push(...data as Slot[]);
  if(data.length<batch){complete=true;break;}
 }
 if(!complete)throw new LessonTimingError("SLOTS_LIMIT",
   "Too many schedule candidates to resolve a lesson safely");
 const byStudent=new Map<string,Slot[]>();
 for(const id of studentIds)byStudent.set(id,[]);
 for(const slot of rows)byStudent.get(slot.student_id)?.push(slot);
 const missing=studentIds.filter(id=>!byStudent.get(id)?.length);
 if(missing.length)return {timing:null,issues:[{
  code:"MISSING_SCHEDULE",
  message:"Not every learner has an active matching weekday slot at this workplace; supply an explicit lesson time",
 }]};
 const compatible=new Map<string,Slot[]>();
 for(const slot of rows){
  const time=slot.start_time;
  // PostgreSQL time values normally have :00 seconds. Never silently
  // truncate real seconds when the UI only supports minute precision.
  if(!/^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(time))continue;
  const key=time.slice(0,5)+"|"+slot.duration_minutes;
  const list=compatible.get(key)??[];
  list.push(slot);
  compatible.set(key,list);
 }
 const common=[...compatible].filter(([,slots])=>
  studentIds.every(id=>slots.filter(slot=>slot.student_id===id).length===1));
 if(common.length!==1)return {timing:null,issues:[{
  code:"TIME_AMBIGUOUS",
  message:common.length?"Several common weekday slots match; supply an explicit lesson time":
   "No single unambiguous start and duration is shared by all learners; supply an explicit lesson time",
 }]};
 const [key,matching]=common[0];
 const [time,minutes]=key.split("|");
 let startsAt:string;
 try{
  startsAt=workplaceLocalToUtc(date+"T"+time,workplace.timezone);
 }catch{
  return {timing:null,issues:[{code:"DST_UNRESOLVED",
   message:"This slot is ambiguous or nonexistent under the workplace timezone on the chosen date; enter a reviewed explicit time"}]};
 }
 return {timing:{
  startsAt,durationMinutes:Number(minutes),
  timeSource:"weekly_slot",
  slotIds:matching.map(slot=>slot.id).sort(),
 },issues:[]};
}

/** Reject optimistic preview when an actual canonical lesson already occupies
 * the instructor interval, including generated recurring occurrences.
 * The confirmed SQL writer remains the final atomic conflict authority.
 */
export async function lessonIntervalConflicts(db:Db,teacherId:string,
 timing:LessonTiming):Promise<LessonTimingIssue[]>{
 const starts=Date.parse(timing.startsAt);
 const ends=starts+timing.durationMinutes*60_000;
 const {data,error}=await db.from("teaching_sessions")
  .select("id,title,starts_at,duration_minutes")
  .eq("teacher_id",teacherId).neq("status","cancelled")
  .gte("starts_at",new Date(starts-480*60_000).toISOString())
  .lt("starts_at",new Date(ends).toISOString())
  .order("starts_at").order("id").range(0,249);
 if(error||!data||data.length===250)
  throw new LessonTimingError("SESSION_CHECK_UNAVAILABLE",
   "Cannot safely verify occupied teaching intervals");
 const conflicts=data.filter(row=>
  Date.parse(row.starts_at)+row.duration_minutes*60_000>starts);
 if(!conflicts.length)return [];
 return [{code:"SCHEDULE_CONFLICT",
  message:"A canonical teaching session already occupies this interval; review that existing lesson instead of creating a duplicate",
  candidates:conflicts.map(x=>({id:x.id,name:x.title})),
 }];
}
