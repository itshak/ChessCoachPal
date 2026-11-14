"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useToast} from "@/components/ui/toast";
import {useConfirm} from "@/components/ui/confirm-dialog";

export type Slot={
 id:string;student_id:string;workplace_id:string|null;
 day_of_week:number;start_time:string;duration_minutes:number;
 start_date:string;end_date:string|null;rate_cents:number|null;
 is_home_visit:boolean;active:boolean;updated_at:string;
};
type Student={id:string;name:string};
type Workplace={id:string;name:string};
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const inputClass="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm";
type Draft={
 studentId:string;workplaceId:string;dayOfWeek:number;startTime:string;
 durationMinutes:number;startDate:string;endDate:string;rateCents:string;
 isHomeVisit:boolean;active:boolean;
};
const empty=(today:string):Draft=>({
 studentId:"",workplaceId:"",dayOfWeek:new Date(today+"T12:00:00Z").getUTCDay(),
 startTime:"16:00",durationMinutes:60,startDate:today,endDate:"",
 rateCents:"",isHomeVisit:false,active:true,
});
function fromSlot(s:Slot):Draft{return{
 studentId:s.student_id,workplaceId:s.workplace_id??"",dayOfWeek:s.day_of_week,
 startTime:s.start_time.slice(0,5),durationMinutes:s.duration_minutes,
 startDate:s.start_date,endDate:s.end_date??"",
 rateCents:s.rate_cents===null?"":String(s.rate_cents),
 isHomeVisit:s.is_home_visit,active:s.active,
};}
async function expectJson(res:Response){
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(typeof body.error==="string"?body.error:
  "Unable to update recurring scheduling");
 return body;
}
export function CanonicalSlotManager({
 slots,students,workplaces,today,durationOptions,
}:{slots:Slot[];students:Student[];workplaces:Workplace[];today:string;durationOptions:number[]}){
 const router=useRouter(),{showToast}=useToast(),confirm=useConfirm();
 const [editing,setEditing]=useState<Slot|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [draft,setDraft]=useState<Draft>(()=>empty(today));
 const [busy,setBusy]=useState(false);
 const [pendingKey,setPendingKey]=useState<string|null>(null);
 function edit(value:Partial<Draft>){
  setDraft(p=>({...p,...value}));
  setPendingKey(null);
 }
 function openCreate(){setEditing(null);setDraft(empty(today));setPendingKey(null);setExpanded(true);}
 function openEdit(slot:Slot){
  setEditing(slot);setDraft(fromSlot(slot));setPendingKey(null);setExpanded(true);
 }
 async function save(){
  if(!draft.studentId||!draft.startDate||
    draft.endDate&&draft.endDate<draft.startDate){
   showToast("Choose a student and a valid start/end date","error");return;
  }
  const rate=draft.rateCents.trim();
  if(rate&&(!/^\d+$/.test(rate)||Number(rate)>999_999_999)){
   showToast("Rate must be a nonnegative whole number of cents","error");return;
  }
  setBusy(true);
  const idempotencyKey=pendingKey??crypto.randomUUID();
  setPendingKey(idempotencyKey);
  try{
   const common={
    workplaceId:draft.workplaceId||null,dayOfWeek:draft.dayOfWeek,
    startTime:draft.startTime,durationMinutes:draft.durationMinutes,
    startDate:draft.startDate,endDate:draft.endDate||null,
    rateCents:rate?Number(rate):null,isHomeVisit:draft.isHomeVisit,
   };
   const url=editing?"/api/coaching/calendar/slots/"+editing.id:
    "/api/coaching/calendar/slots";
   const input=editing?{
    changes:{...common,active:draft.active},
    expectedUpdatedAt:editing.updated_at,idempotencyKey,
   }:{...common,studentId:draft.studentId,idempotencyKey};
   const body=await expectJson(await fetch(url,{
    method:editing?"PATCH":"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(input),
   }));
   setExpanded(false);setPendingKey(null);
   showToast(editing?
    "Recurrence updated; "+String(body.preservedHistory??0)+" protected sessions preserved":
    "Weekly chess lessons scheduled");
   router.refresh();
  }catch(e){
   showToast(e instanceof Error?e.message:"Recurring slot update failed","error");
  }finally{setBusy(false)}
 }
 async function remove(slot:Slot){
  const approved=await confirm({
   title:"Remove recurring teaching slot",
   message:"Unprotected future occurrences will be removed. Completed, attended, noted and billed sessions keep their historical IDs.",
   confirmLabel:"Remove recurrence",cancelLabel:"Keep slot",variant:"danger",
  });
  if(!approved)return;
  setBusy(true);
  try{
   const body=await expectJson(await fetch(
    "/api/coaching/calendar/slots/"+slot.id,{
      method:"DELETE",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idempotencyKey:crypto.randomUUID()}),
    }));
   showToast("Recurrence removed. "+
    String(body.preserved??0)+" protected sessions kept.");
   router.refresh();
  }catch(e){showToast(e instanceof Error?e.message:"Unable to remove slot","error")}
  finally{setBusy(false)}
 }
 return <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
  <div className="flex justify-between items-center gap-3">
   <div>
    <h2 className="font-semibold">Recurring lessons</h2>
    <p className="text-xs text-muted">Rules for future teaching; historical sessions are preserved.</p>
   </div>
   <button className="border border-primary rounded-lg px-3 py-2 text-sm text-primary hover:bg-primary/10"
    onClick={openCreate}>Add weekly slot</button>
  </div>
  {slots.length===0?<p className="text-sm text-muted">No recurring lessons yet.</p>:
   <div className="space-y-2">{slots.map(s=><div key={s.id}
     className="flex flex-wrap items-center gap-2 justify-between border border-border rounded-lg px-3 py-2 text-sm">
     <div>
      <strong>{students.find(x=>x.id===s.student_id)?.name??"Student"}</strong>
      <span className="text-muted"> · {days[s.day_of_week]} {s.start_time.slice(0,5)}
       {" · "}{s.duration_minutes} min
       {s.workplace_id?" · "+(workplaces.find(w=>w.id===s.workplace_id)?.name??"Workplace"):""}
       {!s.active?" · inactive":""}
      </span>
     </div>
     <div className="flex gap-3">
      <button className="text-primary hover:underline" onClick={()=>openEdit(s)}>Edit</button>
      <button disabled={busy} className="text-error hover:underline"
       onClick={()=>remove(s)}>Delete</button>
     </div>
    </div>)}</div>}
  {expanded&&<div className="space-y-3 border-t border-border pt-4">
   <h3 className="font-medium text-sm">{editing?"Edit weekly slot":"New weekly slot"}</h3>
   <div className="grid sm:grid-cols-2 gap-3">
    <label className="block text-sm">Student
     <select className={inputClass} value={draft.studentId}
      disabled={Boolean(editing)} onChange={e=>edit({studentId:e.target.value})}>
      <option value="">Choose student</option>
      {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">Workplace
     <select className={inputClass} value={draft.workplaceId}
      onChange={e=>edit({workplaceId:e.target.value})}>
      <option value="">Personal coaching</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">Weekday
     <select className={inputClass} value={draft.dayOfWeek}
      onChange={e=>edit({dayOfWeek:Number(e.target.value)})}>
      {days.map((day,i)=><option key={day} value={i}>{day}</option>)}
     </select>
    </label>
    <label className="block text-sm">Local start time
     <input type="time" className={inputClass} value={draft.startTime}
      onChange={e=>edit({startTime:e.target.value})}/>
    </label>
    <label className="block text-sm">Duration
     <select className={inputClass} value={draft.durationMinutes}
      onChange={e=>edit({durationMinutes:Number(e.target.value)})}>
      {[...new Set([...durationOptions,30,45,60,90].filter(x=>x>=15&&x<=480))]
       .sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} minutes</option>)}
     </select>
    </label>
    <label className="block text-sm">Rate (cents, optional)
     <input className={inputClass} inputMode="numeric" value={draft.rateCents}
      onChange={e=>edit({rateCents:e.target.value})} placeholder="Studio/student rate"/>
    </label>
    <label className="block text-sm">Starts on
     <input type="date" className={inputClass} value={draft.startDate}
      onChange={e=>edit({startDate:e.target.value})}/>
    </label>
    <label className="block text-sm">Ends on (optional)
     <input type="date" className={inputClass} value={draft.endDate}
      onChange={e=>edit({endDate:e.target.value})}/>
    </label>
    <label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={draft.isHomeVisit}
      onChange={e=>edit({isHomeVisit:e.target.checked})}/>
     Home visit
    </label>
    {editing&&<label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={draft.active}
      onChange={e=>edit({active:e.target.checked})}/>
     Active
    </label>}
   </div>
   <div className="flex gap-3">
    <button disabled={busy} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
     onClick={save}>{busy?"Saving…":"Save recurring schedule"}</button>
    <button className="px-4 py-2 border border-border rounded-lg text-sm"
     onClick={()=>setExpanded(false)}>Cancel</button>
   </div>
  </div>}
 </section>;
}
