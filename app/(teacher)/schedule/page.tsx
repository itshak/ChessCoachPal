import {getTranslations} from "next-intl/server";
import {createClient} from "@/lib/supabase/server";
import {getPolicy} from "@/lib/server/scheduling";
import {addDays,startOfWeek,toLocalDateString} from "@/lib/schedule";
import {formatEventDateKey} from "@/lib/events";
import {materializeCanonicalSessions} from "@/lib/server/canonical-calendar-service";
import {canonicalCalendarWindow} from "@/lib/server/canonical-calendar-read";
import {canonicalSlotsList} from "@/lib/server/canonical-slot-service";
import {canonicalMakeupCreditsList} from "@/lib/server/canonical-makeup-service";
import {teacherWorkplaceContextGet} from "@/lib/server/teacher-workplace-context";
import {workplaceCurrentStudentIds} from "@/lib/server/workplace-student-scope";
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
}:{searchParams:Promise<{week?:string}>}){
 const t=await getTranslations("calendar");
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const {week}=await searchParams;
 const policy=await getPolicy(db,user.id);
 const context=await teacherWorkplaceContextGet(db,user.id);
 const selection=context.selectedWorkplaceId;
 const currentStudentIds=selection?await workplaceCurrentStudentIds(db,user.id,selection):null;
 const today=toLocalDateString(new Date(),policy.timezone);
 const weekStart=startOfWeek(week&&/^\d{4}-\d{2}-\d{2}$/.test(week)?week:today);
 const weekEnd=addDays(weekStart,6);

 // Materialize the normal near-term horizon and separately the requested
 // week. This avoids one unbounded window when a teacher looks far back or
 // forward in history. Existing marked, noted, moved or paid occurrence IDs
 // are never overwritten by recurrence materialization.
 const normalEnd=addDays(today,56);
 await materializeCanonicalSessions(db,user.id,today,normalEnd);
 if(weekStart<today||weekEnd>normalEnd)
  await materializeCanonicalSessions(db,user.id,weekStart,weekEnd);

 const [calendar,slots,makeup,studentsRes,workplacesRes,eventsRes]=
  await Promise.all([
   canonicalCalendarWindow(db,user.id,weekStart,weekEnd,policy.timezone),
   canonicalSlotsList(db,user.id),
   canonicalMakeupCreditsList(db,user.id),
   db.from("students").select("id,name")
    .eq("teacher_id",user.id).order("name"),
   db.from("workplaces").select("id,name")
    .eq("teacher_id",user.id).order("created_at").order("id"),
   db.from("events").select("id,title,starts_at,workplace_id")
    .eq("teacher_id",user.id)
    .gte("starts_at",addDays(weekStart,-2)+"T00:00:00Z")
    .lt("starts_at",addDays(weekEnd,3)+"T00:00:00Z")
    .order("starts_at"),
  ]);
 if(studentsRes.error||workplacesRes.error||eventsRes.error)
  throw new Error("Unable to load the canonical teaching schedule");

 const students=(studentsRes.data??[]).filter(s=>!currentStudentIds||currentStudentIds.has(s.id));
 const workplaces=selection?(workplacesRes.data??[]).filter(w=>w.id===selection):workplacesRes.data??[];
 // Global context affects presentation only: recurrence generation and frozen
 // historical lesson attribution are never mutated by changing a filter.
 const scopedCalendar=selection?calendar.filter(session=>session.workplace_id===selection):calendar;
 const scopedSlots=selection?slots.filter(slot=>slot.workplace_id===selection):slots;
 const scopedMakeup=selection?makeup.filter(credit=>credit.workplaceId===selection):makeup;
 const events=(eventsRes.data??[]).filter(event=>!selection||event.workplace_id===selection).map(event=>({
  id:event.id,title:event.title,startsAt:event.starts_at,
  localDate:formatEventDateKey(event.starts_at,policy.timezone),
 })).filter(event=>event.localDate>=weekStart&&event.localDate<=weekEnd);

 return <main className="space-y-6">
  <header>
   <h1 className="font-bold text-2xl">{t("heading")}</h1>
   <p className="text-muted text-sm mt-1">
    {t("intro")}
   </p>
  </header>
  <CanonicalScheduleBoard
   weekStart={weekStart} today={today} timezone={policy.timezone}
   sessions={scopedCalendar} events={events} students={students}
   workplaces={workplaces} durationOptions={policy.lesson_duration_options}/>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
   <CanonicalSlotManager slots={scopedSlots as Slot[]}
    students={students} workplaces={workplaces}
    today={today} durationOptions={policy.lesson_duration_options}/>
   <div className="space-y-4">
    <CanonicalMakeupPanel credits={scopedMakeup} timezone={policy.timezone}
     today={today} workplaces={workplaces}/>
    <p className="text-muted text-sm">
     {t("policy")}{" "}
     <Link className="text-primary hover:underline" href="/settings">{t("studioSettingsLink")}</Link>.
    </p>
   </div>
  </div>
 </main>;
}
