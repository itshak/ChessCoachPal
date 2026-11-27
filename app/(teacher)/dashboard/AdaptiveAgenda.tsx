import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {addDays} from "@/lib/schedule";
import {homeCopy,type AgendaRow} from "./home-agenda";
import type {HomeAgendaModel} from "./home-agenda-data";

const agendaHref=(start:string,session?:string)=>"/dashboard?"+new URLSearchParams({
 agendaStart:start,...(session?{prepareSession:session}:{})
})+(session?"#lesson-preparation":"#daily-coaching");

export async function AdaptiveAgenda({model,locale,selectedId}:{model:HomeAgendaModel;locale:string;selectedId?:string}){
 const t=await getTranslations("dashboard"),w=homeCopy(locale);
 const dayFormat=new Intl.DateTimeFormat(locale,{weekday:"long",month:"short",day:"numeric",timeZone:"UTC"});
 const instantFormat=new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:model.timeZone});
 const timeFormat=new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:model.timeZone});
 const dateLabel=(date:string)=>dayFormat.format(new Date(date+"T12:00:00Z"));
 const rows=model.days.flatMap(day=>day.rows);
 const visibleNext=model.next&&rows.some(row=>row.id===model.next?.id);
 const incomplete=model.days.some(day=>day.status!=="ready"||day.nextAfter);
 const row=(session:AgendaRow,withDate=false)=><li key={session.id} data-session-id={session.id} data-next-lesson={session.id===model.next?.id}
  className={"flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-border py-3 min-w-0 "+(session.id===model.next?.id?"border-s-2 border-s-primary ps-3":"")}>
  <time dateTime={session.starts_at} className="font-medium tabular-nums shrink-0">
   <bdi>{(withDate?instantFormat:timeFormat).format(new Date(session.starts_at))}</bdi>
  </time>
  <div className="flex-1 min-w-0">
   {session.id===model.next?.id&&<p className="text-primary font-medium">{w.next}</p>}
   <p className="font-semibold [overflow-wrap:anywhere]"><bdi dir="auto">{session.title}</bdi></p>
   <p className="text-muted">{t("minutes",{count:session.duration_minutes})}</p>
   {session.sessionTimeZone&&session.sessionTimeZone!==model.timeZone&&<p className="text-muted">
    {w.workplaceZone}{": "}<bdi>{session.sessionTimeZone}</bdi>
   </p>}
  </div>
  <Link href={agendaHref(model.start,session.id)} aria-current={selectedId===session.id?"true":undefined}
   className="text-primary underline underline-offset-2 py-1" prefetch={false}>{t("dailyPrepareOpen",{title:session.title})}</Link>
 </li>;
 return <div className="space-y-4 min-w-0" data-home-agenda>
  <div className="flex flex-wrap gap-3 items-center justify-between">
   <h2 className="text-xl font-semibold">{w.agenda}</h2>
   <Link className="text-primary underline" href="/schedule">{w.calendar}</Link>
  </div>
  <p className="text-muted">{t("dailyZone",{zone:model.timeZone})}</p>
  {!visibleNext&&model.next&&<ul aria-label={w.next}>{row(model.next,true)}</ul>}
  {!model.next&&<p role="status">{model.futureComplete?w.noUpcoming:w.nextUnknown}</p>}
  <div className="flex flex-wrap gap-2 items-center">
   <span className="font-medium">{dateLabel(model.start)}{" – "}{dateLabel(model.end)}</span>
   {model.start>model.today&&<Link href={agendaHref(addDays(model.start,-7)<model.today?model.today:addDays(model.start,-7))} className="text-primary underline">{w.previousWeek}</Link>}
   {model.start>model.today&&<Link href="/dashboard" className="text-primary underline">{w.currentWeek}</Link>}
   {model.end<"9998-12-24"&&<Link href={agendaHref(addDays(model.start,7))} className="text-primary underline">{w.nextWeek}</Link>}
  </div>
  {incomplete&&<p role="status">{w.partial}</p>}
  {!rows.length&&!incomplete&&(!model.futureComplete||model.next)&&<p>{w.later}</p>}
  {model.days.filter(day=>day.rows.length||day.status!=="ready"||day.nextAfter).map(day=><section key={day.date} data-agenda-date={day.date}>
   <h3 className="font-semibold">
    {day.date===model.today?w.today:day.date===addDays(model.today,1)?w.tomorrow:dateLabel(day.date)}
    {(day.date===model.today||day.date===addDays(model.today,1))&&<span className="text-muted font-normal">{" · "}{dateLabel(day.date)}</span>}
   </h3>
   {day.status==="unavailable"?<p role="alert">{w.unavailable}</p>:<ul>{day.rows.map(session=>row(session))}</ul>}
   {day.nextAfter&&<Link className="text-primary underline" href={"/dashboard?"+new URLSearchParams({date:day.date,upcomingAfter:day.nextAfter})+"#daily-coaching"}>{w.moreDay}</Link>}
  </section>)}
 </div>;
}

export function RecentTeaching({model,locale}:{model:HomeAgendaModel;locale:string}){
 const w=homeCopy(locale);
 const pastRow=(session:AgendaRow)=><li key={session.id} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-border py-3 min-w-0">
  <time dateTime={session.starts_at} className="text-muted"><bdi>{new Intl.DateTimeFormat(locale,{
   timeZone:session.sessionTimeZone??model.timeZone,dateStyle:"medium",timeStyle:"short"
  }).format(new Date(session.starts_at))}</bdi></time>
  <Link className="font-medium text-primary underline min-w-0 [overflow-wrap:anywhere]" href={"/schedule?session="+session.id}>
   <bdi dir="auto">{session.title}</bdi>
  </Link>
  {session.status!=="completed"&&<span className="text-muted">{session.status==="scheduled"?w.scheduled:session.status==="cancelled"?w.cancelled:w.other}</span>}
 </li>;
 return <section className="space-y-4" aria-label={w.completed}>
  {!model.historyAvailable?<p role="alert">{w.historyUnavailable}</p>:<>
   {model.historyPartial&&<p role="status">{w.historyPartial}</p>}
   <div><h2 className="text-lg font-semibold">{w.completed}</h2>
    {!!model.completed.length&&<ul>{model.completed.map(pastRow)}</ul>}
    {!model.completed.length&&!model.otherPast.length&&!model.historyPartial&&<p>{w.noHistory}</p>}
   </div>
   {!!model.otherPast.length&&<div><h2 className="text-lg font-semibold">{w.past}</h2><ul>{model.otherPast.map(pastRow)}</ul></div>}
  </>}
 </section>;
}
