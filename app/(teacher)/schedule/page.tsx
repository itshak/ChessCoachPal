import {createClient} from "@/lib/supabase/server";
import {getPolicy} from "@/lib/server/scheduling";
import {addDays,startOfWeek,toLocalDateString} from "@/lib/schedule";
import {formatEventDateKey} from "@/lib/events";
import {materializeCanonicalSessions} from "@/lib/server/canonical-calendar-service";
import {canonicalCalendarWindow} from "@/lib/server/canonical-calendar-read";
import {canonicalSlotsList} from "@/lib/server/canonical-slot-service";
import {canonicalMakeupCreditsList} from "@/lib/server/canonical-makeup-service";
import {CanonicalScheduleBoard} from "@/components/teacher/schedule/CanonicalScheduleBoard";
import {CanonicalSlotManager,type Slot} from "@/components/teacher/schedule/CanonicalSlotManager";
import {CanonicalMakeupPanel} from "@/components/teacher/schedule/CanonicalMakeupPanel";
import Link from "next/link";

export const metadata={title:"Schedule"};

export default async function SchedulePage({
 searchParams,
}:{searchParams:Promise<{week?:string}>}){
 const db=await createClient(),{data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const {week}=await searchParams;
 const policy=await getPolicy(db,user.id);
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
   db.from("events").select("id,title,starts_at")
    .eq("teacher_id",user.id)
    .gte("starts_at",addDays(weekStart,-2)+"T00:00:00Z")
    .lt("starts_at",addDays(weekEnd,3)+"T00:00:00Z")
    .order("starts_at"),
  ]);
 if(studentsRes.error||workplacesRes.error||eventsRes.error)
  throw new Error("Unable to load the canonical teaching schedule");

 const students=studentsRes.data??[],workplaces=workplacesRes.data??[];
 const events=(eventsRes.data??[]).map(event=>({
  id:event.id,title:event.title,startsAt:event.starts_at,
  localDate:formatEventDateKey(event.starts_at,policy.timezone),
 })).filter(event=>event.localDate>=weekStart&&event.localDate<=weekEnd);

 return <main className="space-y-6">
  <header>
   <h1 className="font-bold text-2xl">Teaching schedule</h1>
   <p className="text-muted text-sm mt-1">
    Every class is one canonical teaching session. Group attendance, make-up
    decisions and notes belong to its frozen student roster.
   </p>
  </header>
  <CanonicalScheduleBoard
   weekStart={weekStart} today={today} timezone={policy.timezone}
   sessions={calendar} events={events} students={students}
   workplaces={workplaces} durationOptions={policy.lesson_duration_options}/>
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
   <CanonicalSlotManager slots={slots as Slot[]}
    students={students} workplaces={workplaces}
    today={today} durationOptions={policy.lesson_duration_options}/>
   <div className="space-y-4">
    <CanonicalMakeupPanel credits={makeup} timezone={policy.timezone}
     today={today} workplaces={workplaces}/>
    <p className="text-muted text-sm">
     Cancellation windows, make-up eligibility and teaching rates are configured in{" "}
     <Link className="text-primary hover:underline" href="/studio">Studio settings</Link>.
    </p>
   </div>
  </div>
 </main>;
}
