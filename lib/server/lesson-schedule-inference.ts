import "server-only";
import {z} from "zod";
import type {SupabaseClient} from "@supabase/supabase-js";
import {dayOfWeek,isDateString} from "@/lib/schedule";
import {workplaceLocalToUtc} from "@/lib/coaching-time";
import {effectiveLessonWorkplaces,lessonEnrollmentCalendar,lessonEnrollmentPeriods,
 LessonTimingError} from "@/lib/server/lesson-enrollment-periods";
export {LessonTimingError} from "@/lib/server/lesson-enrollment-periods";

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

/**
 * Standalone day/timetable preflight for agents and website.
 * Explicit student UUIDs avoid fuzzy roster guessing. The teacher must have
 * all three domains: students, chosen workplace, and current enrollment.
 */
export const scheduleDayPreviewSchema=z.object({
 workplaceId:z.uuid(),localDate:z.string().refine(isDateString),
 studentIds:z.array(z.uuid()).min(1).max(50),
}).strict();

export async function teacherScheduleDayPreview(db:Db,teacherId:string,
 input:z.infer<typeof scheduleDayPreviewSchema>){
 const args=scheduleDayPreviewSchema.parse(input);
 if(new Set(args.studentIds).size!==args.studentIds.length)
  throw new LessonTimingError("DUPLICATE_STUDENT",
   "A requested student must appear only once");
 const {data:workplace,error:we}=await db.from("workplaces")
  .select("id,timezone,name").eq("id",args.workplaceId)
  .eq("teacher_id",teacherId).maybeSingle();
 if(we)throw new LessonTimingError("WORKPLACE_UNAVAILABLE",
  "Cannot verify requested workplace");
 if(!workplace)throw new LessonTimingError("NOT_FOUND",
  "Requested workplace not found");
 const [{data:students,error:se},periods,calendarDate]=await Promise.all([
  db.from("students").select("id").eq("teacher_id",teacherId)
   .is("archived_at",null).in("id",args.studentIds).limit(51),
  lessonEnrollmentPeriods(db,teacherId,args.studentIds,args.workplaceId),
  lessonEnrollmentCalendar(db,teacherId),
 ]);
 if(se||!students)throw new LessonTimingError("ENROLLMENT_UNAVAILABLE",
   "Cannot verify all selected students and enrollments");
 const inWorkplace=(date?:string)=>args.studentIds.every(id=>
   effectiveLessonWorkplaces(periods,id,date).has(workplace.id));
 const blocked=()=>({canUse:false,workplace:{id:workplace.id,name:workplace.name,
    timezone:workplace.timezone},localDate:args.localDate,
    studentIds:args.studentIds,timing:null,issues:[{
      code:"STUDENT_NOT_ENROLLED",message:"One or more learners have no effective enrollment for this lesson",
    }],writesPerformed:false});
 if(students.length!==args.studentIds.length||!inWorkplace())return blocked();
 const result=await inferOwnedWeeklyLessonTime(db,teacherId,workplace,
   args.localDate,args.studentIds);
 if(result.timing&&!inWorkplace(calendarDate(result.timing.startsAt)))return blocked();
 const issues:LessonTimingIssue[]=[...result.issues];
 if(result.timing)issues.push(...await lessonIntervalConflicts(
   db,teacherId,result.timing));
 return {canUse:result.timing!==null&&issues.length===0,
  workplace:{id:workplace.id,name:workplace.name,timezone:workplace.timezone},
  localDate:args.localDate,studentIds:args.studentIds,timing:result.timing,
  issues,writesPerformed:false};
}
