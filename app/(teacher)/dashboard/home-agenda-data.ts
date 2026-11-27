import type {SupabaseClient} from "@supabase/supabase-js";
import {sessionsList} from "@/lib/server/coach-service";
import {teacherDashboardPageModel,teacherDashboardSummary} from "@/lib/server/teacher-overview-service";
import {addDays,isDateString} from "@/lib/schedule";
import {agendaDates,discoverHome,nextWithinVerifiedDays,type AgendaDay} from "./home-agenda";

type Daily=NonNullable<Awaited<ReturnType<typeof teacherDashboardPageModel>>["daily"]>;

export async function loadHomeAgenda(db:SupabaseClient,teacherId:string,workplaceId:string|null,daily:Daily,rawStart:unknown,now:Date){
 const today=daily.date;
 const start=typeof rawStart==="string"&&isDateString(rawStart)&&rawStart>=today&&rawStart<="9998-12-24"?rawStart:today;
 const discovery=await sessionsList(db,teacherId,workplaceId).catch(()=>null);
 const projection=discoverHome(discovery,now,daily.timeZone,start);
 if(!projection.futureComplete){
  // A full descending discovery page may omit earlier future sessions.
  // Reuse the existing MCP-backed daily read instead of guessing its boundary.
  projection.days=await Promise.all(agendaDates(start).map(async(date):Promise<AgendaDay>=>{
   try{
    if(date===daily.date)return {date,status:"ready",rows:daily.sessions,nextAfter:daily.nextUpcomingAfter};
    const result=await teacherDashboardSummary(db,teacherId,workplaceId,date);
    if("daily" in result&&result.daily)return {date,status:"ready",rows:result.daily.sessions,nextAfter:result.daily.nextUpcomingAfter};
   }catch{/* The date remains explicitly unavailable. */}
   return {date,status:"unavailable",rows:[]};
  }));
  projection.next=start===today?nextWithinVerifiedDays(projection.days):daily.sessions[0]??null;
 }
 return {...projection,start,today,end:addDays(start,6),timeZone:daily.timeZone};
}
export type HomeAgendaModel=Awaited<ReturnType<typeof loadHomeAgenda>>;
