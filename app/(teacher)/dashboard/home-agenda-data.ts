import type {SupabaseClient} from "@supabase/supabase-js";
import {sessionsList} from "@/lib/server/coach-service";
import {teacherDashboardPageModel,teacherDashboardSummary} from "@/lib/server/teacher-overview-service";
import {addDays,isDateString} from "@/lib/schedule";
import {agendaDates,discoverHome,nextWithinVerifiedDays,verifiedHintDates,type AgendaDay} from "./home-agenda";

type Daily=NonNullable<Awaited<ReturnType<typeof teacherDashboardPageModel>>["daily"]>;

export async function loadHomeAgenda(db:SupabaseClient,teacherId:string,workplaceId:string|null,daily:Daily,rawStart:unknown,now:Date,hints:readonly {starts_at:string}[]){
 const today=daily.date;
 const start=typeof rawStart==="string"&&isDateString(rawStart)&&rawStart>=today&&rawStart<="9998-12-24"?rawStart:today;
 const discovery=await sessionsList(db,teacherId,workplaceId).catch(()=>null);
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
  // Exact earliest dated candidate can be beyond the seven-day window.
  // Stop at the first unavailable date; never promote a later hint to "next".
  const known=new Map(projection.days.map(day=>[day.date,day]));
  const dates=verifiedHintDates(hints,daily.timeZone,today);
  const firstDays=await Promise.all(dates.map(date=>known.get(date)??readDay(date)));
  projection.next=nextWithinVerifiedDays(firstDays);
  if(!projection.next&&start===today)projection.next=nextWithinVerifiedDays(projection.days);
  if(!projection.next&&start!==today)projection.next=daily.sessions[0]??null;
 }
 return {...projection,start,today,end:addDays(start,6),timeZone:daily.timeZone};
}
export type HomeAgendaModel=Awaited<ReturnType<typeof loadHomeAgenda>>;
