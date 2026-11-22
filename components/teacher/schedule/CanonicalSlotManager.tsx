"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useState} from "react";
import {useTranslations,useLocale} from "next-intl";
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
type Workplace={id:string;name:string;localToday:string};
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const inputClass="w-full rounded-lg border border-border bg-background text-foreground px-3 py-2 text-sm";
type Draft={
 studentId:string;workplaceId:string;dayOfWeek:number;startTime:string;
 durationMinutes:number;startDate:string;endDate:string;rateCents:string;
 isHomeVisit:boolean;active:boolean;
};
const empty=(today:string,workplaceId:string):Draft=>({
 studentId:"",workplaceId,dayOfWeek:new Date(today+"T12:00:00Z").getUTCDay(),
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
 slots,students,workplaces,today,personalToday,selectedWorkplaceId,durationOptions,
}:{slots:Slot[];students:Student[];workplaces:Workplace[];today:string;personalToday:string;selectedWorkplaceId:string|null;durationOptions:number[]}){
 const router=useRouter(),{showToast}=useToast(),confirm=useConfirm();
 const t=useTranslations("scheduling"),locale=useLocale();
  const toUserError=useLocalizedApiError();
 const dayLabel=(day:number)=>new Intl.DateTimeFormat(locale,{weekday:"long",timeZone:"UTC"})
   .format(new Date(Date.UTC(2023,0,1+day)));
 const [editing,setEditing]=useState<Slot|null>(null);
 const [expanded,setExpanded]=useState(false);
 const [draft,setDraft]=useState<Draft>(()=>empty(today,selectedWorkplaceId??""));
 const [dateEdited,setDateEdited]=useState(false);
 const [weekdayEdited,setWeekdayEdited]=useState(false);
 const [busy,setBusy]=useState(false);
 const [pendingKey,setPendingKey]=useState<string|null>(null);
 function edit(value:Partial<Draft>){
  setDraft(p=>({...p,...value}));
  setPendingKey(null);
 }
 function openCreate(){setEditing(null);setDraft(empty(today,selectedWorkplaceId??""));setDateEdited(false);setWeekdayEdited(false);setPendingKey(null);setExpanded(true);}
 function openEdit(slot:Slot){
  setEditing(slot);setDraft(fromSlot(slot));setPendingKey(null);setExpanded(true);
 }
 async function save(){
  if(!draft.studentId||!draft.startDate||
    draft.endDate&&draft.endDate<draft.startDate){
   showToast(t("chooseDateError"),"error");return;
  }
  const rate=draft.rateCents.trim();
  if(rate&&(!/^\d+$/.test(rate)||Number(rate)>999_999_999)){
   showToast(t("rateError"),"error");return;
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
    t("updated",{count:Number(body.preservedHistory??0)}):t("created"));
   router.refresh();
  }catch(e){
   showToast(toUserError(e, t("saveError")),"error");
  }finally{setBusy(false)}
 }
 async function remove(slot:Slot){
  const approved=await confirm({
   title:t("removeTitle"),
   message:t("removeDesc"),
   confirmLabel:t("removeConfirm"),cancelLabel:t("keepSlot"),variant:"danger",
  });
  if(!approved)return;
  setBusy(true);
  try{
   const body=await expectJson(await fetch(
    "/api/coaching/calendar/slots/"+slot.id,{
      method:"DELETE",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({idempotencyKey:crypto.randomUUID()}),
    }));
   showToast(t("removed",{count:Number(body.preserved??0)}));
   router.refresh();
  }catch(e){showToast(toUserError(e, t("removeError")),"error")}
  finally{setBusy(false)}
 }
 return <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
  <div className="flex justify-between items-center gap-3">
   <div>
    <h2 className="font-semibold">{t("recurringTitle")}</h2>
    <p className="text-xs text-muted">{t("recurringIntro")}</p>
   </div>
   <button className="border border-primary rounded-lg px-3 py-2 text-sm text-primary hover:bg-primary/10"
    onClick={openCreate}>{t("addWeekly")}</button>
  </div>
  {slots.length===0?<p className="text-sm text-muted">{t("noneRecurring")}</p>:
   <div className="space-y-2">{slots.map(s=><div key={s.id}
     className="flex flex-wrap items-center gap-2 justify-between border border-border rounded-lg px-3 py-2 text-sm">
     <div>
      <strong>{students.find(x=>x.id===s.student_id)?.name??t("studentFallback")}</strong>
      <span className="text-muted"> · {dayLabel(s.day_of_week)} {s.start_time.slice(0,5)}
       {" · "}{t("minutes",{count:s.duration_minutes})}
       {s.workplace_id?" · "+(workplaces.find(w=>w.id===s.workplace_id)?.name??t("workplaceFallback")):""}
       {!s.active?" · "+t("inactive"):""}
      </span>
     </div>
     <div className="flex gap-3">
      <button className="text-primary hover:underline" onClick={()=>openEdit(s)}>{t("edit")}</button>
      <button disabled={busy} className="text-error hover:underline"
       onClick={()=>remove(s)}>{t("delete")}</button>
     </div>
    </div>)}</div>}
  {expanded&&<div className="space-y-3 border-t border-border pt-4">
   <h3 className="font-medium text-sm">{editing?t("editWeekly"):t("newWeekly")}</h3>
   <div className="grid sm:grid-cols-2 gap-3">
    <label className="block text-sm">{t("student")}
     <select className={inputClass} value={draft.studentId}
      disabled={Boolean(editing)} onChange={e=>edit({studentId:e.target.value})}>
      <option value="">{t("chooseStudent")}</option>
      {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("workplace")}
     <select className={inputClass} value={draft.workplaceId}
      onChange={e=>{
       const workplaceId=e.target.value;
       if(editing||dateEdited){edit({workplaceId});return;}
       const startDate=workplaces.find(w=>w.id===workplaceId)?.localToday??personalToday;
       edit({workplaceId,startDate,...(weekdayEdited?{}:{dayOfWeek:new Date(startDate+"T12:00:00Z").getUTCDay()})});
      }}>
      <option value="">{t("personal")}</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("weekday")}
     <select className={inputClass} value={draft.dayOfWeek}
      onChange={e=>{setWeekdayEdited(true);edit({dayOfWeek:Number(e.target.value)})}}>
      {days.map((day,i)=><option key={day} value={i}>{dayLabel(i)}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("localStart")}
     <input type="time" className={inputClass} value={draft.startTime}
      onChange={e=>edit({startTime:e.target.value})}/>
    </label>
    <label className="block text-sm">{t("duration")}
     <select className={inputClass} value={draft.durationMinutes}
      onChange={e=>edit({durationMinutes:Number(e.target.value)})}>
      {[...new Set([...durationOptions,30,45,60,90].filter(x=>x>=15&&x<=480))]
       .sort((a,b)=>a-b).map(n=><option key={n} value={n}>{t("minutes",{count:n})}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("rateCents")}
     <input className={inputClass} inputMode="numeric" value={draft.rateCents}
      onChange={e=>edit({rateCents:e.target.value})} placeholder={t("ratePlaceholder")}/>
    </label>
    <label className="block text-sm">{t("starts")}
     <input type="date" className={inputClass} value={draft.startDate}
      onChange={e=>{setDateEdited(true);edit({startDate:e.target.value})}}/>
    </label>
    <label className="block text-sm">{t("ends")}
     <input type="date" className={inputClass} value={draft.endDate}
      onChange={e=>edit({endDate:e.target.value})}/>
    </label>
    <label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={draft.isHomeVisit}
      onChange={e=>edit({isHomeVisit:e.target.checked})}/>
     {t("homeVisit")}
    </label>
    {editing&&<label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={draft.active}
      onChange={e=>edit({active:e.target.checked})}/>
     {t("active")}
    </label>}
   </div>
   <div className="flex gap-3">
    <button disabled={busy} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
     onClick={save}>{busy?t("saving"):t("saveRecurring")}</button>
    <button className="px-4 py-2 border border-border rounded-lg text-sm"
     onClick={()=>setExpanded(false)}>{t("cancel")}</button>
   </div>
  </div>}
 </section>;
}
