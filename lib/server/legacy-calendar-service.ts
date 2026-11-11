import type { SupabaseClient } from "@supabase/supabase-js";
import { getPolicy, materializeLessons } from "@/lib/server/scheduling";
import {
 addDays, computeOccurrences, isDateString, oneToOne, toLocalDateString,
 zonedTimeToUtc, type SlotRow,
} from "@/lib/schedule";
import { findMoveConflicts, planLessonMove } from "@/lib/reschedule";

type Db=SupabaseClient;
export class CalendarError extends Error {
 constructor(public status:number,public code:string,message:string){super(message);}
}
const failure=(s:number,c:string,m:string)=>new CalendarError(s,c,m);
const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const slotTimePattern=/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const validRate=(value:unknown)=>value===null||(typeof value==="number"&&Number.isSafeInteger(value)&&value>=0);
const dateOrNull=(d:string|null|undefined)=>!d||isDateString(d);
export type SlotCreate={
 studentId:string;dayOfWeek:number;startTime:string;durationMinutes?:number;
 startDate?:string;endDate?:string|null;rateCents?:number|null;isHomeVisit?:boolean;
};
export type SlotPatch={
 dayOfWeek?:number;startTime?:string;durationMinutes?:number;startDate?:string;
 endDate?:string|null;rateCents?:number|null;isHomeVisit?:boolean;active?:boolean;
};
export type LessonCreate={
 studentId:string;date:string;time:string;durationMinutes?:number;
 makeupFor?:string|null;isHomeVisit?:boolean;
};
export type LessonPatch={
 date?:string;time?:string;durationMinutes?:number;isHomeVisit?:boolean;
};
async function ownedStudent(db:Db,teacherId:string,studentId:string) {
 const {data,error}=await db.from("students").select("id,archived_at")
 .eq("id",studentId).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Student lookup failed");
 if(!data)throw failure(404,"NOT_FOUND","Student not found");
 if(data.archived_at)throw failure(409,"ARCHIVED","Reactivate this student before scheduling future lessons");
}
async function ownedSlot(db:Db,teacherId:string,slotId:string){
 const {data,error}=await db.from("lesson_slots").select("*")
 .eq("id",slotId).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Slot lookup failed");
 if(!data)throw failure(404,"NOT_FOUND","Recurring slot not found");
 return data;
}
async function ownedLesson(db:Db,teacherId:string,lessonId:string){
 const {data,error}=await db.from("lessons")
 .select("id,student_id,slot_id,lesson_date,starts_at,duration_minutes,rescheduled_from_date,is_home_visit,attendance!lesson_id ( id )")
 .eq("id",lessonId).eq("teacher_id",teacherId).maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Lesson lookup failed");
 if(!data)throw failure(404,"NOT_FOUND","Lesson not found");
 return data;
}
export async function calendarSlotsList(db:Db,teacherId:string,opts:{studentId?:string;activeOnly?:boolean}={}){
 // PostgREST imposes a 1000-row response cap. The old single-query list
 // silently hid additional slots from both the website and delegated MCP.
 // Scan all pages in stable order, or fail explicitly at a safe upper bound.
 const rows:Record<string,unknown>[]=[];
 const pageSize=500,maxRows=20_000;
 for(let offset=0;;offset+=pageSize){
   let query=db.from("lesson_slots").select("*").eq("teacher_id",teacherId)
     .order("day_of_week").order("start_time").order("id");
   if(opts.studentId)query=query.eq("student_id",opts.studentId);
   if(opts.activeOnly)query=query.eq("active",true);
   const {data,error}=await query.range(offset,offset+pageSize-1);
   if(error)throw failure(500,"DATABASE_ERROR","Unable to list recurring slots");
   const page=data??[];
   if(rows.length+page.length>maxRows)
     throw failure(413,"ROSTER_TOO_LARGE","Recurring slot inventory exceeds safe listing size");
   rows.push(...page);
   if(page.length<pageSize)break;
 }
 return rows;
}
export async function calendarSlotCreate(db:Db,teacherId:string,input:SlotCreate){
 if(!Number.isInteger(input.dayOfWeek)||input.dayOfWeek<0||input.dayOfWeek>6||
    !timePattern.test(input.startTime)||!dateOrNull(input.startDate)||!dateOrNull(input.endDate))
   throw failure(400,"VALIDATION_ERROR","Valid weekday (0–6), time HH:mm and dates are required");
 if(input.rateCents!==undefined&&!validRate(input.rateCents))
  throw failure(400,"VALIDATION_ERROR","Rate must be a nonnegative integer number of cents or null");
 if(input.isHomeVisit!==undefined&&typeof input.isHomeVisit!=="boolean")
  throw failure(400,"VALIDATION_ERROR","Home visit must be a boolean");
 await ownedStudent(db,teacherId,input.studentId);
 const policy=await getPolicy(db,teacherId);
 const today=toLocalDateString(new Date(),policy.timezone);
 const startDate=input.startDate||today;
 if(input.endDate&&input.endDate<startDate)
  throw failure(400,"VALIDATION_ERROR","End date cannot precede start date");
 const duration=input.durationMinutes??30;
 if(!Number.isInteger(duration)||duration<1||duration>480)
  throw failure(400,"VALIDATION_ERROR","Invalid duration");
 const {data,error}=await db.from("lesson_slots").insert({
  teacher_id:teacherId,student_id:input.studentId,day_of_week:input.dayOfWeek,
  start_time:input.startTime,duration_minutes:duration,start_date:startDate,
  end_date:input.endDate||null,rate_cents:input.rateCents??null,
  is_home_visit:input.isHomeVisit??false,
 }).select("*").single();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to create recurring slot");
 await materializeLessons(db,teacherId,today,addDays(today,56));
 return data;
}
type Upcoming={id:string;lesson_date:string;starts_at:string;duration_minutes:number;
 is_home_visit:boolean;rescheduled_from_date:string|null;
 attendance:{id:string}|{id:string}[]|null;
 lesson_notes:{id:string}|{id:string}[]|null};
async function upcomingSlotLessons(db:Db,slotId:string):Promise<Upcoming[]>{
 // Inspect every ordered page before mutation: a truncated list can erase
 // or leave unexpected future lessons when a recurring slot is corrected.
 const rows:Upcoming[]=[];
 const cutoff=new Date().toISOString();
 const pageSize=500,maxRows=20_000;
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await db.from("lessons").select(
   "id,lesson_date,starts_at,duration_minutes,is_home_visit,rescheduled_from_date,attendance!lesson_id (id),lesson_notes (id)"
  ).eq("slot_id",slotId).gte("starts_at",cutoff)
   .order("starts_at").order("id").range(offset,offset+pageSize-1);
  if(error)throw failure(500,"DATABASE_ERROR","Unable to inspect upcoming lessons");
  const page=(data??[]) as Upcoming[];
  if(rows.length+page.length>maxRows)
   throw failure(413,"ROSTER_TOO_LARGE","Upcoming recurring lesson inventory exceeds safe mutation size");
  rows.push(...page);
  if(page.length<pageSize)break;
 }
 return rows;
}
async function syncUpcoming(db:Db,slot:SlotRow,timezone:string,today:string,homeVisitChanged:boolean,
 upcoming:Upcoming[]){
 const unmarked=upcoming.filter(l=>!oneToOne(l.attendance)&&!l.rescheduled_from_date);
 const until=unmarked.reduce((max,l)=>l.lesson_date>max?l.lesson_date:max,addDays(today,56));
 const byDate=new Map(computeOccurrences(slot,today,until,timezone).map(x=>[x.lesson_date,x]));
 for(const lesson of unmarked){
  const next=byDate.get(lesson.lesson_date);
  if(!next) {
   if(oneToOne(lesson.lesson_notes)){
    const {error}=await db.from("lessons").update({slot_id:null}).eq("id",lesson.id);
    if(error)throw failure(500,"DATABASE_ERROR","Unable to preserve a detached lesson note");
   }else{
    const {error}=await db.from("lessons").delete().eq("id",lesson.id);
    if(error)throw failure(500,"DATABASE_ERROR","Unable to remove a superseded lesson");
   }
   continue;
  }
  const patch:Record<string,unknown>={};
  if(new Date(lesson.starts_at).getTime()!==new Date(next.starts_at).getTime())patch.starts_at=next.starts_at;
  if(lesson.duration_minutes!==next.duration_minutes)patch.duration_minutes=next.duration_minutes;
  if(homeVisitChanged&&lesson.is_home_visit!==next.is_home_visit)patch.is_home_visit=next.is_home_visit;
  if(Object.keys(patch).length){
   const {error}=await db.from("lessons").update(patch).eq("id",lesson.id);
   if(error)throw failure(500,"DATABASE_ERROR","Unable to adjust upcoming lesson");
  }
 }
}
export async function calendarSlotUpdate(db:Db,teacherId:string,id:string,input:SlotPatch){
 const before=await ownedSlot(db,teacherId,id);
 const update:Record<string,unknown>={};
 if(input.dayOfWeek!==undefined){
  if(!Number.isInteger(input.dayOfWeek)||input.dayOfWeek<0||input.dayOfWeek>6)throw failure(400,"VALIDATION_ERROR","Invalid weekday");
  update.day_of_week=input.dayOfWeek;
 }
 if(input.startTime!==undefined){
  if(!slotTimePattern.test(input.startTime))throw failure(400,"VALIDATION_ERROR","Invalid start time");
  update.start_time=input.startTime;
 }
 if(input.durationMinutes!==undefined){
  if(!Number.isInteger(input.durationMinutes)||input.durationMinutes<1||input.durationMinutes>480)
   throw failure(400,"VALIDATION_ERROR","Invalid duration");
  update.duration_minutes=input.durationMinutes;
 }
 if(input.startDate!==undefined){
  if(!isDateString(input.startDate))throw failure(400,"VALIDATION_ERROR","Invalid start date");
  update.start_date=input.startDate;
 }
 if(input.endDate!==undefined){
  if(!dateOrNull(input.endDate))throw failure(400,"VALIDATION_ERROR","Invalid end date");
  update.end_date=input.endDate||null;
 }
 if(input.active!==undefined){
  if(typeof input.active!=="boolean")throw failure(400,"VALIDATION_ERROR","Active must be a boolean");
  update.active=input.active;
 }
 if(input.rateCents!==undefined){
  if(!validRate(input.rateCents))throw failure(400,"VALIDATION_ERROR","Rate must be a nonnegative integer number of cents or null");
  update.rate_cents=input.rateCents;
 }
 if(input.isHomeVisit!==undefined){
  if(typeof input.isHomeVisit!=="boolean")throw failure(400,"VALIDATION_ERROR","Home visit must be a boolean");
  update.is_home_visit=input.isHomeVisit;
 }
 if(!Object.keys(update).length)throw failure(400,"VALIDATION_ERROR","Nothing to update");
 const start=(update.start_date??before.start_date) as string;
 const end=(update.end_date!==undefined?update.end_date:before.end_date) as string|null;
 if(end&&end<start)throw failure(400,"VALIDATION_ERROR","End date precedes start date");
 const timeOld=String(before.start_time).replace(/:00$/,"");
 const timeNew=String(update.start_time??before.start_time).replace(/:00$/,"");
 const affects=["day_of_week","duration_minutes","start_date","end_date","active","is_home_visit"]
  .some(k=>k in update&&update[k]!==before[k])||timeOld!==timeNew;
 // Perform the bounded complete future-lesson preflight BEFORE saving the slot.
 // A too-large or unavailable inventory must not leave a changed slot behind.
 // Full concurrent, atomic reconciliation still requires a database transaction.
 const upcoming=affects?await upcomingSlotLessons(db,id):[];
 const {data,error}=await db.from("lesson_slots").update(update)
  .eq("teacher_id",teacherId).eq("id",id).select("*").maybeSingle();
 if(error)throw failure(500,"DATABASE_ERROR","Unable to update recurring slot");
 if(!data)throw failure(404,"NOT_FOUND","Recurring slot not found");
 if(affects){
  const policy=await getPolicy(db,teacherId);
  const today=toLocalDateString(new Date(),policy.timezone);
  await syncUpcoming(db,data as SlotRow,policy.timezone,today,
   "is_home_visit" in update&&update.is_home_visit!==before.is_home_visit,upcoming);
  await materializeLessons(db,teacherId,today,addDays(today,56));
 }
 return data;
}
export async function calendarSlotDelete(db:Db,teacherId:string,id:string){
 await ownedSlot(db,teacherId,id);
 const upcoming=await upcomingSlotLessons(db,id);
 const deletable=upcoming.filter(l=>!oneToOne(l.attendance)&&!l.rescheduled_from_date);
 for(const lesson of deletable){
  if(oneToOne(lesson.lesson_notes)){
   const {error}=await db.from("lessons").update({slot_id:null}).eq("id",lesson.id);
   if(error)throw failure(500,"DATABASE_ERROR","Unable to preserve lesson note");
  }else{
   const {error}=await db.from("lessons").delete().eq("id",lesson.id);
   if(error)throw failure(500,"DATABASE_ERROR","Unable to delete upcoming unmarked lesson");
  }
 }
 const {error}=await db.from("lesson_slots").delete().eq("id",id).eq("teacher_id",teacherId);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to remove slot");
 return {ok:true};
}
export async function calendarLessonsList(db:Db,teacherId:string,
 opts:{studentId?:string;from?:string;to?:string;offset?:number;limit?:number}={}){
 const limit=Math.min(100,Math.max(1,opts.limit??50));
 const offset=Math.max(0,opts.offset??0);
 let query=db.from("lessons").select("*").eq("teacher_id",teacherId)
 .order("starts_at",{ascending:false}).range(offset,offset+limit);
 if(opts.studentId)query=query.eq("student_id",opts.studentId);
 if(opts.from)query=query.gte("lesson_date",opts.from);
 if(opts.to)query=query.lte("lesson_date",opts.to);
 const {data,error}=await query;
 if(error)throw failure(500,"DATABASE_ERROR","Unable to list calendar lessons");
 return {lessons:(data??[]).slice(0,limit),nextOffset:(data?.length??0)>limit?offset+limit:null};
}
export async function calendarLessonDetail(db:Db,teacherId:string,id:string){
 return ownedLesson(db,teacherId,id);
}
export async function calendarLessonCreate(db:Db,teacherId:string,input:LessonCreate){
 if(!isDateString(input.date)||!timePattern.test(input.time))
  throw failure(400,"VALIDATION_ERROR","Date YYYY-MM-DD and time HH:mm required");
 if(input.isHomeVisit!==undefined&&typeof input.isHomeVisit!=="boolean")
  throw failure(400,"VALIDATION_ERROR","Home visit must be a boolean");
 await ownedStudent(db,teacherId,input.studentId);
 let duration=input.durationMinutes??30;
 if(!Number.isInteger(duration)||duration<1||duration>480)
  throw failure(400,"VALIDATION_ERROR","Invalid duration");
 if(input.makeupFor){
  const {data:credit}=await db.from("attendance")
   .select("id,status,lessons!lesson_id (student_id,duration_minutes,teacher_id)")
   .eq("id",input.makeupFor).maybeSingle();
  const lesson=oneToOne(credit?.lessons as {student_id:string;duration_minutes:number;teacher_id:string}[]|null);
  if(!credit||lesson?.teacher_id!==teacherId)throw failure(404,"NOT_FOUND","Make-up credit not found");
  if(credit.status==="attended"||lesson.student_id!==input.studentId)
   throw failure(400,"VALIDATION_ERROR","Make-up credit is invalid for this student");
  if(input.durationMinutes===undefined)duration=lesson.duration_minutes;
 }
 const policy=await getPolicy(db,teacherId);
 let startsAt:Date;
 try {
  startsAt=zonedTimeToUtc(input.date,input.time,policy.timezone,"reject");
 } catch {
  throw failure(400,"VALIDATION_ERROR","Local lesson time does not exist in the studio timezone (DST gap)");
 }
 const {data,error}=await db.from("lessons").insert({
  teacher_id:teacherId,student_id:input.studentId,slot_id:null,
  lesson_date:input.date,starts_at:startsAt.toISOString(),
  duration_minutes:duration,makeup_for:input.makeupFor||null,is_home_visit:input.isHomeVisit??false,
 }).select("*").single();
 if(error?.code==="23505")throw failure(409,"CONFLICT","Make-up credit already used");
 if(error)throw failure(500,"DATABASE_ERROR","Unable to create lesson");
 return data;
}
export async function calendarLessonUpdate(db:Db,teacherId:string,id:string,input:LessonPatch){
 if(input.isHomeVisit!==undefined&&typeof input.isHomeVisit!=="boolean")
  throw failure(400,"VALIDATION_ERROR","Home visit must be a boolean");
 const lesson=await ownedLesson(db,teacherId,id);
 const update:Record<string,unknown>={};
 const warnings:string[]=[];
 if(input.isHomeVisit!==undefined)update.is_home_visit=input.isHomeVisit;
 if(input.date!==undefined||input.time!==undefined||input.durationMinutes!==undefined){
  if(oneToOne(lesson.attendance as {id:string}[]|null))
   throw failure(409,"CONFLICT","Marked lessons cannot be moved without clearing attendance");
  const policy=await getPolicy(db,teacherId);
  const plan=planLessonMove(input,lesson,policy.timezone);
  if(!plan.ok)throw failure(400,"VALIDATION_ERROR",plan.error);
  Object.assign(update,plan.patch);
  if(plan.patch.starts_at||plan.patch.duration_minutes){
   const startsAt=(plan.patch.starts_at as string)??lesson.starts_at;
   const duration=(plan.patch.duration_minutes as number)??lesson.duration_minutes;
   const localDate=toLocalDateString(new Date(startsAt),policy.timezone);
   const {data:others}=await db.from("lessons")
    .select("id,student_id,starts_at,duration_minutes").eq("teacher_id",teacherId)
    .eq("lesson_date",localDate).neq("id",id);
   const overlaps=findMoveConflicts({studentId:lesson.student_id,startsAt,durationMinutes:duration},
    (others??[]).map(x=>({studentId:x.student_id,startsAt:x.starts_at,durationMinutes:x.duration_minutes})));
   if(overlaps.studentOverlap)warnings.push("This student already has a lesson at that time");
   else if(overlaps.teacherOverlap)warnings.push("Another lesson already occupies part of that time");
  }
 }
 if(!Object.keys(update).length)throw failure(400,"VALIDATION_ERROR","Nothing to update");
 const {data,error}=await db.from("lessons").update(update)
  .eq("id",id).eq("teacher_id",teacherId)
  .select("id,is_home_visit,lesson_date,starts_at,duration_minutes,rescheduled_from_date").maybeSingle();
 if(error?.code==="23505")throw failure(409,"CONFLICT","Slot already has a lesson that day");
 if(error)throw failure(500,"DATABASE_ERROR","Unable to update lesson");
 if(!data)throw failure(404,"NOT_FOUND","Lesson not found");
 return warnings.length?{...data,warnings}:data;
}
export async function calendarLessonDelete(db:Db,teacherId:string,id:string){
 const lesson=await ownedLesson(db,teacherId,id);
 if(lesson.slot_id)throw failure(409,"CONFLICT","Cancel recurring lessons with attendance instead of deletion");
 const {error}=await db.from("lessons").delete().eq("id",id).eq("teacher_id",teacherId);
 if(error)throw failure(500,"DATABASE_ERROR","Unable to remove lesson");
 return {ok:true};
}
