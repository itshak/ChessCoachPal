"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
type Workplace={id:string;name:string};
type Row={id:string;kind:"coaching";startsAt:string;durationMinutes:number;
 status:string;studentIds:string[];workplaceId:string|null;
 booked:boolean;delivered:boolean};
type Response={entries:Row[];total:number;nextOffset:number|null;summary:{
 bookedInstructorMinutes:number;evidencedInstructorMinutes:number;
 canonicalSessionCount:number;participantAttendanceDecisions:number};
 warnings:string[];filter:{timezone:string}};
const classes="min-w-0 w-full max-w-full rounded-lg border border-border bg-surface px-3 py-2 min-h-11 text-base text-foreground";
function dateLocal(daysAgo:number){
 const d=new Date();d.setDate(d.getDate()-daysAgo);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
  String(d.getDate()).padStart(2,"0")].join("-");
}
export function UnifiedLessonHistoryPanel({fixedStudentId,initialWorkplaceId}:{fixedStudentId?:string;initialWorkplaceId?:string|null}){
 const t=useTranslations("lessonHistory"),locale=useLocale();
 const common=useTranslations("common");
  const toUserError=useLocalizedApiError();
 const statusText=(status:string)=>status==="scheduled"?t("scheduled"):status==="completed"?t("completed"):status==="cancelled"?t("cancelled"):status;
 const [from,setFrom]=useState(()=>dateLocal(30));
 const [to,setTo]=useState(()=>dateLocal(0));
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [workplaceId,setWorkplaceId]=useState(initialWorkplaceId??"");
 const [rows,setRows]=useState<Row[]>([]);
 const [result,setResult]=useState<Response|null>(null);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [statusFilter,setStatusFilter]=useState("");
 const visibleRows=statusFilter?rows.filter(row=>row.status===statusFilter):rows;
 const [error,setError]=useState("");
 useEffect(()=>{setWorkplaceId(initialWorkplaceId??"");setResult(null);setRows([]);setNextOffset(null);},[initialWorkplaceId]);
 useEffect(()=>{
  let active=true;
  void fetch("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:"workplaces.list"}),cache:"no-store",
  }).then(r=>r.json()).then(data=>{if(active)setWorkplaces(data.data??[]);})
  .catch(e=>{if(active)setError(toUserError(e, t("workplacesUnavailable")));});
  return ()=>{active=false;};
 },[t,toUserError]);
 const fetchHistory=useCallback(async(offset=0)=>{
  if(from>to)throw new Error(t("invalidRange"));
  const q=new URLSearchParams({from,to,offset:String(offset),limit:"50"});
  if(fixedStudentId)q.set("studentId",fixedStudentId);
  q.set("workplaceId",workplaceId||"all");
  const response=await fetch("/api/coaching/unified-lessons?"+q,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(toUserError(data, t("loadError")));
  const history=data as Response;
  setRows(old=>offset===0?history.entries:[...old,...history.entries]);
  setResult(history);setNextOffset(history.nextOffset);
 },[fixedStudentId,from,to,workplaceId,t,toUserError]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{await fetchHistory();}catch(e){setError(toUserError(e, t("unavailable")));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="text-lg font-semibold">{t("title")}</h2>
  <p className="text-sm text-muted">{t("description")}</p>
  <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
   <label className="block min-w-0 w-full text-sm sm:w-auto">{t("from")} <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={"block "+classes} required/></label>
   <label className="block min-w-0 w-full text-sm sm:w-auto">{t("to")} <input type="date" value={to} onChange={e=>setTo(e.target.value)} className={"block "+classes} required/></label>
   <label className="block min-w-0 w-full text-sm sm:w-auto">{t("workplace")}
    <select data-testid="history-workplace-select" value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)} className={"block "+classes}>
     <option value="">{t("allWorkplaces")}</option>
     {workplaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
    </select>
   </label>
   <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"> {t("showHistory")}</button>
  </form>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {result&&<div aria-live="polite" className="space-y-3">
   <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">{t("bookedMinutes")}</div><div className="text-2xl font-semibold tabular-nums">{result.summary.bookedInstructorMinutes}</div></div>
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">{t("teachingMinutes")}</div><div className="font-bold">{result.summary.evidencedInstructorMinutes}</div></div>
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">{t("attendanceDecisions")}</div><div className="font-bold">{result.summary.participantAttendanceDecisions}</div></div>
   </div>
   {result.warnings.map((warning,i)=><p className="text-xs text-muted" key={i}>{warning}</p>)}
   <p className="text-xs text-muted">{t("records",{count:result.total,timezone:result.filter.timezone})}</p>
   <label className="block text-sm">{common("status")}
    <select className={"block "+classes} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
     <option value="">—</option>
     {["scheduled","completed","cancelled"].map(status=><option key={status} value={status}>{statusText(status)}</option>)}
    </select>
   </label>
   <ol className="space-y-3 border-s border-border ps-4">
    {visibleRows.map(row=><li className="relative rounded-lg border border-border bg-background p-4 text-[15px] leading-relaxed" key={row.id}>
     <span aria-hidden="true" className="absolute -start-[21px] top-5 h-2.5 w-2.5 rounded-full bg-primary"/>
     <time dateTime={row.startsAt} className="block text-sm text-muted">{new Date(row.startsAt).toLocaleString(locale,{timeZone:result.filter.timezone})}</time>
     <div className="mt-1 flex flex-wrap justify-between items-baseline gap-2">
      <span className="font-semibold">{row.studentIds.length>1?t("groupLesson"):t("privateLesson")}</span>
      <span className="rounded-md border border-border px-2 py-0.5 text-sm">{statusText(row.status)}</span>
     </div>
     <p className="text-sm text-muted">{t("minutes",{count:row.durationMinutes})} · {t("students",{count:row.studentIds.length})}</p>
     <p>{row.delivered?t("teachingEvidenced"):row.booked?t("bookedNotTaught"):t("cancelled")}</p>
    </li>)}
   </ol>
   {!visibleRows.length&&<p className="text-muted text-sm">{common("noResults")}</p>}
   {nextOffset!==null&&<button disabled={busy} className="text-primary underline text-sm" onClick={()=>{setBusy(true);void fetchHistory(nextOffset).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}> {t("loadMore")}</button>}
  </div>}
 </section>;
}
