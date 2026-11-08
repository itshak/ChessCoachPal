"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
type Workplace={id:string;name:string};
type Row={id:string;kind:"legacy"|"coaching";startsAt:string;durationMinutes:number;
 status:string;studentIds:string[];workplaceId:string|null;
 possibleDuplicateOf?:string;booked:boolean;delivered:boolean};
type Response={entries:Row[];total:number;nextOffset:number|null;summary:{
 bookedInstructorMinutes:number;evidencedInstructorMinutes:number;
 possibleCrossModelDuplicates:number;coachingSessionCount:number;
 unattributedLegacyLessonCount:number};
 warnings:string[];filter:{timezone:string}};
const classes="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";
function dateLocal(daysAgo:number){
 const d=new Date();d.setDate(d.getDate()-daysAgo);
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
  String(d.getDate()).padStart(2,"0")].join("-");
}
export function UnifiedLessonHistoryPanel({fixedStudentId}:{fixedStudentId?:string}){
 const [from,setFrom]=useState(()=>dateLocal(30));
 const [to,setTo]=useState(()=>dateLocal(0));
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [workplaceId,setWorkplaceId]=useState("");
 const [rows,setRows]=useState<Row[]>([]);
 const [result,setResult]=useState<Response|null>(null);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  void fetch("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:"workplaces.list"}),cache:"no-store",
  }).then(r=>r.json()).then(data=>{if(active)setWorkplaces(data.data??[]);})
  .catch(e=>{if(active)setError(e instanceof Error?e.message:"Workplaces unavailable");});
  return ()=>{active=false;};
 },[]);
 const fetchHistory=useCallback(async(offset=0)=>{
  if(from>to)throw new Error("End date precedes start date");
  const q=new URLSearchParams({from,to,offset:String(offset),limit:"50"});
  if(fixedStudentId)q.set("studentId",fixedStudentId);
  if(workplaceId)q.set("workplaceId",workplaceId);
  const response=await fetch("/api/coaching/unified-lessons?"+q,{cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Unable to load teaching history");
  const history=data as Response;
  setRows(old=>offset===0?history.entries:[...old,...history.entries]);
  setResult(history);setNextOffset(history.nextOffset);
 },[fixedStudentId,from,to,workplaceId]);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError("");
  try{await fetchHistory();}catch(e){setError(e instanceof Error?e.message:"History unavailable");}
  finally{setBusy(false);}
 }
 return <section aria-label="Unified private and coaching lesson history" className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="text-lg font-semibold">Complete teaching history</h2>
  <p className="text-sm text-muted">Shows private legacy lessons alongside group/coaching sessions. Exact duplicates are flagged, not deleted. Booked and evidenced teaching minutes are separately calculated without double counting overlapping time.</p>
  <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
   <label className="text-sm">From <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className={"block "+classes} required/></label>
   <label className="text-sm">To <input type="date" value={to} onChange={e=>setTo(e.target.value)} className={"block "+classes} required/></label>
   <label className="text-sm">Workplace
    <select value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)} className={"block "+classes}>
     <option value="">All, including private</option>
     {workplaces.map(w=><option value={w.id} key={w.id}>{w.name}</option>)}
    </select>
   </label>
   <button type="submit" disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Show history</button>
  </form>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {result&&<div aria-live="polite" className="space-y-3">
   <div className="grid gap-2 sm:grid-cols-3">
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">Booked instructor minutes</div><div className="font-bold">{result.summary.bookedInstructorMinutes}</div></div>
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">Evidenced teaching minutes</div><div className="font-bold">{result.summary.evidencedInstructorMinutes}</div></div>
    <div className="border border-border rounded-lg p-3"><div className="text-xs text-muted">Possible duplicate records</div><div className="font-bold">{result.summary.possibleCrossModelDuplicates}</div></div>
   </div>
   {result.warnings.map((warning,i)=><p className="text-xs text-muted" key={i}>{warning}</p>)}
   <p className="text-xs text-muted">{result.total} history records. Timezone: {result.filter.timezone}</p>
   <ul className="space-y-2">
    {rows.map(row=><li className="border border-border rounded-lg p-3 text-sm" key={row.id}>
     <span className="font-medium">{row.kind==="coaching"?"Coaching/group":"Private legacy"}</span>
     <span className="text-muted"> · {new Date(row.startsAt).toLocaleString()} · {row.durationMinutes} min · {row.status}</span>
     {row.possibleDuplicateOf&&<p className="text-error">Possible duplicate of {row.possibleDuplicateOf} — review before changing records</p>}
     <p className="text-xs text-muted">{row.studentIds.length} learner(s) · {row.delivered?"Teaching evidenced":row.booked?"Booked; not confirmed taught":"Cancelled"}</p>
    </li>)}
   </ul>
   {nextOffset!==null&&<button disabled={busy} className="text-primary underline text-sm" onClick={()=>{setBusy(true);void fetchHistory(nextOffset).catch(e=>setError(String(e))).finally(()=>setBusy(false));}}>Load more</button>}
  </div>}
 </section>;
}
