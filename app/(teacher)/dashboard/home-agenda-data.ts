import type {SupabaseClient} from "@supabase/supabase-js";
import {sessionsList,workplacesList} from "@/lib/server/coach-service";
import {teacherDashboardPageModel,teacherDashboardSummary} from "@/lib/server/teacher-overview-service";
import {addDays,isDateString} from "@/lib/schedule";
import {agendaDates,discoverHome,type AgendaDay} from "./home-agenda";

type Daily=NonNullable<Awaited<ReturnType<typeof teacherDashboardPageModel>>["daily"]>;

export async function loadHomeAgenda(db:SupabaseClient,teacherId:string,workplaceId:string|null,daily:Daily,rawStart:unknown,now:Date,nextScheduled:Awaited<ReturnType<typeof teacherDashboardPageModel>>["nextScheduled"]){
 const today=daily.date;
 const start=typeof rawStart==="string"&&isDateString(rawStart)&&rawStart>=today&&rawStart<="9998-12-24"?rawStart:today;
 const [discovery,venues]=await Promise.all([
  sessionsList(db,teacherId,workplaceId).catch(()=>null),
  workplacesList(db,teacherId).catch(()=>null),
 ]);
 const workplaceNames=Object.fromEntries((venues??[]).map(venue=>[venue.id,venue.name]));
 const projection=discoverHome(discovery,now,daily.timeZone,start);
 if(!projection.futureComplete){
  // A full descending discovery page may omit earlier future sessions.
  // Reuse the existing MCP-backed daily read instead of guessing its boundary.
  const readDay=async(date:string):Promise<AgendaDay>=>{
   try{
    if(date===daily.date)return {date,status:"ready",rows:daily.sessions,nextAfter:daily.nextUpcomingAfter};
    const result=await teacherDashboardSummary(db,teacherId,workplaceId,date);
    if("daily" in result&&result.daily)return {date,status:"ready",rows:result.daily.sessions,nextAfter:result.daily.nextUpcomingAfter};
   }catch{/* The date remains explicitly unavailable. */}
   return {date,status:"unavailable",rows:[]};
  };
  projection.days=await Promise.all(agendaDates(start).map(readDay));

 }
 return {...projection,next:nextScheduled.status==="ready"?nextScheduled.lesson:projection.next,nextVerified:nextScheduled.status==="ready"||projection.futureComplete,start,today,end:addDays(start,6),timeZone:daily.timeZone,workplaceNames};
}
export type HomeAgendaModel=Awaited<ReturnType<typeof loadHomeAgenda>>;
