"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useToast} from "@/components/ui/toast";
import type {CanonicalMakeupCredit} from "@/lib/server/canonical-makeup-service";
import {formatLessonDate} from "@/lib/schedule";

type Workplace={id:string;name:string};
const field="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm";
export function CanonicalMakeupPanel({
 credits,workplaces,timezone,today,
}:{credits:CanonicalMakeupCredit[];workplaces:Workplace[];timezone:string;today:string}){
 const router=useRouter(),{showToast}=useToast();
 const [selected,setSelected]=useState<CanonicalMakeupCredit|null>(null);
 const [date,setDate]=useState(today);
 const [time,setTime]=useState("16:00");
 const [workplaceId,setWorkplaceId]=useState("");
 const [homeVisit,setHomeVisit]=useState(false);
 const [requestId,setRequestId]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 function choose(credit:CanonicalMakeupCredit){
  setSelected(credit);setDate(today);setTime("16:00");
  setWorkplaceId(credit.workplaceId);setHomeVisit(false);setRequestId(null);
 }
 async function save(){
  if(!selected)return;
  if(!date||!time){showToast("Choose a date and time","error");return;}
  setBusy(true);
  const idempotencyKey=requestId??crypto.randomUUID();
  setRequestId(idempotencyKey);
  try{
   const res=await fetch("/api/coaching/calendar/private-sessions",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     studentId:selected.studentId,workplaceId:workplaceId||null,
     makeupForSessionId:selected.sourceSessionId,
     date,time,durationMinutes:selected.durationMinutes,
     isHomeVisit:homeVisit,idempotencyKey,
    }),
   });
   const result=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(result.error??"Unable to schedule make-up");
   setSelected(null);setRequestId(null);
   showToast(result.replayed?"Make-up booking confirmed":"Make-up lesson booked");
   router.refresh();
  }catch(error){
   showToast(error instanceof Error?error.message:"Cannot schedule make-up","error");
  }finally{setBusy(false)}
 }
 return <section className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="font-semibold">Make-up credits</h2>
  <p className="text-xs text-muted">
   Only eligible, unredeemed cancellations appear here. Booking a make-up consumes the
   exact original student/session credit in one transaction.
  </p>
  {credits.length===0?<p className="text-sm text-muted">No available make-up credits.</p>:
   <div className="space-y-2">{credits.map(c=><div
     className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
     key={c.sourceSessionId+":"+c.studentId}>
     <div>
      <strong>{c.studentName}</strong>
      <div className="text-xs text-muted">
       {formatLessonDate(c.missedAt,timezone,"short")} · {c.durationMinutes} minutes · {
        c.status==="teacher_cancelled"?"Teacher cancelled":
        c.status==="student_cancelled"?"Student cancelled":"Absence"}
      </div>
     </div>
     <button className="text-primary hover:underline" onClick={()=>choose(c)}>Book make-up</button>
    </div>)}</div>}
  {selected&&<div className="space-y-3 border-t border-border pt-3">
   <h3 className="font-medium text-sm">Make-up lesson for {selected.studentName}</h3>
   <div className="grid sm:grid-cols-2 gap-3">
    <label className="text-sm">Date
     <input type="date" className={field} value={date}
      onChange={e=>{setDate(e.target.value);setRequestId(null)}}/>
    </label>
    <label className="text-sm">Local time
     <input type="time" className={field} value={time}
      onChange={e=>{setTime(e.target.value);setRequestId(null)}}/>
    </label>
    <label className="text-sm">Teaching workplace
     <select className={field} value={workplaceId}
      onChange={e=>{setWorkplaceId(e.target.value);setRequestId(null)}}>
      <option value="">Personal coaching</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
    <label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={homeVisit}
      onChange={e=>{setHomeVisit(e.target.checked);setRequestId(null)}}/>
     Home visit
    </label>
   </div>
   <div className="flex gap-3">
    <button disabled={busy} onClick={save}
     className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
     {busy?"Booking…":"Confirm make-up"}
    </button>
    <button className="rounded-lg border border-border px-4 py-2 text-sm"
     onClick={()=>setSelected(null)}>Cancel</button>
   </div>
  </div>}
 </section>;
}
