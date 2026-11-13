import {createClient} from "@/lib/supabase/server";
import {getPolicy} from "@/lib/server/scheduling";
import {materializeCanonicalSessions} from "@/lib/server/canonical-calendar-service";
import {canonicalCalendarWindow} from "@/lib/server/canonical-calendar-read";
import {canonicalSlotsList} from "@/lib/server/canonical-slot-service";
import {listCanonicalMakeupCredits} from "@/lib/server/canonical-makeup-credit-service";
import {CanonicalSchedule} from "@/components/teacher/schedule/CanonicalSchedule";
import {addDays,startOfWeek,toLocalDateString} from "@/lib/schedule";

export const metadata={title:"Schedule"};

export default async function SchedulePage({
 searchParams,
}:{searchParams:Promise<{week?:string}>}){
 const {week}=await searchParams;
 const db=await createClient();
 const {data:{user}}=await db.auth.getUser();
 if(!user)return null;
 const policy=await getPolicy(db,user.id);
 const today=toLocalDateString(new Date(),policy.timezone);
 const start=startOfWeek(week&&/^\d{4}-\d{2}-\d{2}$/.test(week)?week:today);
 const end=addDays(start,6);
 const from=start<today?start:today;
 const to=end>addDays(today,56)?end:addDays(today,56);
 let materializationWarning:string|null=null;
 try{
  // Materialization is idempotent on the immutable (slot, occurrence date).
  // Neither current group membership nor lesson_notes can be a second writer.
  await materializeCanonicalSessions(db,user.id,from,to);
 }catch(error){
  // A failed materialization must not conceal existing attended or invoiced
  // sessions. Existing canonical history remains available for review.
  console.error("Canonical recurrence materialization unavailable",
   error instanceof Error?error.name:"Error");
  materializationWarning="Some recurring sessions could not be prepared; existing teaching history is intact. Check your slots before editing.";
 }
 const [sessions,slotsRes,studentsRes,workplacesRes,eventsRes,makeups]=
  await Promise.all([
   canonicalCalendarWindow(db,user.id,start,end,policy.timezone),
   canonicalSlotsList(db,user.id),
   db.from("students").select("id,name").eq("teacher_id",user.id)
    .is("archived_at",null).order("name").limit(1000),
   db.from("workplaces").select("id,name,timezone").eq("teacher_id",user.id)
    .order("created_at").order("id").limit(1000),
   db.from("events").select("id,title,location,starts_at,ends_at")
    .eq("teacher_id",user.id)
    .gte("starts_at",addDays(start,-2)+"T00:00:00Z")
    .lt("starts_at",addDays(end,3)+"T00:00:00Z")
    .order("starts_at").limit(1000),
   listCanonicalMakeupCredits(db,user.id,policy),
  ]);
 if(studentsRes.error||workplacesRes.error||eventsRes.error)
  throw new Error("Unable to read teacher calendar inventory");
 const events=(eventsRes.data??[]).map(e=>({
  id:e.id,title:e.title,location:e.location??"",
  starts_at:e.starts_at,ends_at:e.ends_at,
 }));
 return <CanonicalSchedule
  weekStart={start} today={today} timezone={policy.timezone}
  sessions={sessions}
  slots={slotsRes as unknown as import("@/components/teacher/schedule/CanonicalSchedule").CanonicalSlotView[]}
  students={studentsRes.data??[]}
  workplaces={workplacesRes.data??[]}
  events={events} makeups={makeups}
  durationOptions={policy.lesson_duration_options}
  materializationWarning={materializationWarning}
 />;
}
