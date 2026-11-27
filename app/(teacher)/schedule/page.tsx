import {getTranslations} from "next-intl/server";
import {createClient} from "@/lib/supabase/server";
import {getPolicy} from "@/lib/server/scheduling";
import {addDays,isDateString,toLocalDateString} from "@/lib/schedule";
import {formatEventDateKey} from "@/lib/events";
import {materializeCanonicalSessions} from "@/lib/server/canonical-calendar-service";
import {canonicalCalendarWindow} from "@/lib/server/canonical-calendar-read";
import {canonicalSlotsList} from "@/lib/server/canonical-slot-service";
import {canonicalMakeupCreditsList} from "@/lib/server/canonical-makeup-service";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import {workplaceCurrentStudentIds} from "@/lib/server/workplace-student-scope";
import {calendarRange,calendarView} from "@/components/teacher/schedule/calendar-view";
import {CanonicalScheduleBoard} from "@/components/teacher/schedule/CanonicalScheduleBoard";
import {CanonicalSlotManager,type Slot} from "@/components/teacher/schedule/CanonicalSlotManager";
import {CanonicalMakeupPanel} from "@/components/teacher/schedule/CanonicalMakeupPanel";
import Link from "next/link";

export async function generateMetadata(){
  const t=await getTranslations("calendar");
  return {title:t("heading")};
}

export default async function SchedulePage({
 searchParams,
}:{searchParams:Promise<{week?:string;session?:string;view?:string}>}){
 const t=await getTranslations("calendar");
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const {week,session:requestedSession,view:rawView}=await searchParams;
 const view=calendarView(rawView);
 const policy=await getPolicy(db,user.id);
 const context=await teacherWorkplaceContextGet(db,user.id);
 const selection=context.selectedWorkplaceId;
 const currentStudentIds=selection?await workplaceCurrentStudentIds(db,user.id,selection):null;
 const now=new Date();
 const timezone=context.selectedWorkplace?.timezone??policy.timezone;
 const today=toLocalDateString(now,timezone);
 const teacherToday=toLocalDateString(now,policy.timezone);
 const workplacesRes=await db.from("workplaces").select("id,name,timezone,archived_at")
   .eq("teacher_id",user.id).order("created_at").order("id");
 if(workplacesRes.error)throw new Error("Unable to load calendar workplaces");
 const workplaceTimezones=Object.fromEntries((workplacesRes.data??[]).map(w=>[w.id,w.timezone]));
 const workplaceNames=Object.fromEntries((workplacesRes.data??[]).map(w=>[w.id,w.name]));
 const workplaces=(workplacesRes.data??[]).filter(w=>!w.archived_at&&(!selection||w.id===selection))
   .map(w=>({id:w.id,name:w.name,localToday:toLocalDateString(now,w.timezone)}));
 // Navigation only: recognize an exact owned session in the visible
 // workplace context. Invalid, missing and excluded IDs stay indistinguishable.
 let noteTarget:null|{id:string;date:string}=null;
 if(typeof requestedSession==="string"&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestedSession)){
  let lookup=db.from("teaching_sessions").select("id,starts_at,local_timezone,workplace_id")
    .eq("teacher_id",user.id).eq("id",requestedSession);
  if(selection)lookup=lookup.eq("workplace_id",selection);
  const {data,error}=await lookup.maybeSingle();
  if(error)throw new Error("Unable to resolve the schedule link");
  if(data)noteTarget={id:data.id,date:toLocalDateString(new Date(data.starts_at),
    data.local_timezone||workplaceTimezones[data.workplace_id]||timezone)};
 }
 const anchorDate=noteTarget?.date??(typeof week==="string"&&isDateString(week)&&week>="1900-01-01"&&week<="9998-12-31"?week:today);
 const range=calendarRange(anchorDate,view);
 const weekStart=range.start,weekEnd=range.end;

 // Materialize the normal near-term horizon and separately the requested
 // week. This avoids one unbounded window when a teacher looks far back or
 // forward in history. Existing marked, noted, moved or paid occurrence IDs
 // are never overwritten by recurrence materialization.
 const normalEnd=addDays(teacherToday,56);
 let materializationIncomplete=false;
 if(requestedSession===undefined){
  try{
   await materializeCanonicalSessions(db,user.id,teacherToday,normalEnd);
   if(weekStart<teacherToday||weekEnd>normalEnd)
    await materializeCanonicalSessions(db,user.id,weekStart,weekEnd);
  }catch{materializationIncomplete=true;}
 }

 const [calendar,slots,makeup,studentsRes,eventsRes]=
  await Promise.all([
   canonicalCalendarWindow(db,user.id,weekStart,weekEnd,timezone,undefined,workplaceTimezones)
    .then(rows=>({ok:true as const,rows})).catch(()=>({ok:false as const,rows:[]})),
   canonicalSlotsList(db,user.id),
   canonicalMakeupCreditsList(db,user.id),
   db.from("students").select("id,name")
    .eq("teacher_id",user.id).is("archived_at",null).order("name"),
   db.from("events").select("id,title,starts_at,workplace_id")
    .eq("teacher_id",user.id)
    .gte("starts_at",addDays(weekStart,-2)+"T00:00:00Z")
    .lt("starts_at",addDays(weekEnd,3)+"T00:00:00Z")
    .order("starts_at"),
  ]);
 if(studentsRes.error||eventsRes.error)
  throw new Error("Unable to load the canonical teaching schedule");

 const students=(studentsRes.data??[]).filter(s=>!currentStudentIds||currentStudentIds.has(s.id));
 // Global context affects presentation only: recurrence generation and frozen
 // historical lesson attribution are never mutated by changing a filter.
 const scopedCalendar=selection?calendar.rows.filter(session=>session.workplace_id===selection):calendar.rows;
 const calendarStatus=!calendar.ok?"unavailable":materializationIncomplete?"partial":"ready";
 const scopedSlots=selection?slots.filter(slot=>slot.workplace_id===selection):slots;
 const scopedMakeup=selection?makeup.filter(credit=>credit.workplaceId===selection):makeup;
 const events=(eventsRes.data??[]).filter(event=>!selection||event.workplace_id===selection).map(event=>({
  id:event.id,title:event.title,startsAt:event.starts_at,
  localDate:formatEventDateKey(event.starts_at,(event.workplace_id&&workplaceTimezones[event.workplace_id])||policy.timezone),
 })).filter(event=>event.localDate>=weekStart&&event.localDate<=weekEnd);

 return <div className="space-y-6 ccp-calendar-page">
  <header>
   <h1 className="font-bold text-2xl ccp-mobile-sr-only">{t("heading")}</h1>
  </header>
  {requestedSession!==undefined&&!noteTarget&&<p role="status">{t("lessonLinkUnavailable")}</p>}
  <CanonicalScheduleBoard
   key={[anchorDate,view,selection??"all"].join(":")} calendarStatus={calendarStatus}
   weekStart={weekStart} rangeEnd={weekEnd} anchorDate={anchorDate} view={view} nowIso={now.toISOString()} today={today} timezone={timezone} personalToday={teacherToday}
   selectedWorkplaceId={selection} workplaceTimezones={workplaceTimezones} workplaceNames={workplaceNames}
   sessions={scopedCalendar} events={events} students={students}
   workplaces={workplaces} durationOptions={policy.lesson_duration_options}/>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 ccp-calendar-management">
   <CanonicalSlotManager slots={scopedSlots as Slot[]}
    students={students} workplaces={workplaces}
    today={today} personalToday={teacherToday} selectedWorkplaceId={selection} durationOptions={policy.lesson_duration_options}/>
   <div className="space-y-4">
    <CanonicalMakeupPanel credits={scopedMakeup} timezone={policy.timezone}
     personalToday={teacherToday} selectedWorkplaceId={selection} workplaces={workplaces}/>
    <p className="text-muted text-sm">
     {t("policy")}{" "}
     <Link className="text-primary hover:underline" href="/settings">{t("teacherSettingsLink")}</Link>.
    </p>
   </div>
  </div>
 </div>;
}
