"use client";

import {useState} from "react";
import {useLocale,useTranslations} from "next-intl";

type Target={slotId:string;originalOccurrenceOn:string};
type Cancel={action:"cancel";expectedUpdatedAt:string;reason:string}&Target;
type Restore={action:"restore"}&Target;
type Preview=Cancel|Restore;
type Choice=Cancel|{action:"restore";exceptionId:string;expectedRevision:string};
type Approved=Choice&{idempotencyKey:string;confirmed:true};
const endpoint="/api/coaching/calendar/slots/occurrence-cancellation";
const field="w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const errors:Record<string,"changed"|"materialized"|"invalid"|"notFound">={
 CANONICAL_SLOT_NOT_FOUND:"changed",CANONICAL_SLOT_REVISION_CONFLICT:"changed",
 CANONICAL_SLOT_WORKPLACE_NOT_FOUND:"changed",SLOT_OCCURRENCE_ALREADY_MATERIALIZED:"materialized",
 SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION:"changed",SLOT_CANCELLATION_ALREADY_REVOKED:"changed",
 SLOT_CANCELLATION_REVISION_CONFLICT:"changed",SLOT_CANCELLATION_REVOCATION_NOT_SUPPORTED:"notFound",
 SLOT_CANCELLATION_REPLAY_CONFLICT:"changed",SLOT_CANCELLATION_REVOCATION_REPLAY_CONFLICT:"changed",
 SLOT_CANCELLATION_NOT_FOUND:"notFound",SLOT_CANCELLATION_NOT_A_RULE_DATE:"invalid",
 SLOT_CANCELLATION_NOT_FUTURE:"invalid",VALIDATION_ERROR:"invalid",
 INVALID_SLOT_CANCELLATION:"invalid",INVALID_SLOT_CANCELLATION_REVOCATION:"invalid",
};

export function OriginalOccurrenceCancellation({slot,learner,onClose}:{
 slot:{id:string;updated_at:string};learner:string;onClose:()=>void;
}){
 const t=useTranslations("occurrenceCancellation"),locale=useLocale();
 const [original,setOriginal]=useState(""),[reason,setReason]=useState("");
 const [action,setAction]=useState<Preview["action"]>("cancel");
 const [review,setReview]=useState<{date:string;choice:Choice}|null>(null);
 const [approved,setApproved]=useState(false),[pending,setPending]=useState<Approved|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState<Preview["action"]|null>(null);
 const clear=()=>{setReview(null);setApproved(false);setError("");};
 const message=(code:string)=>Object.hasOwn(errors,code)?t(errors[code]):t("unavailable");
 const send=(method:"POST"|"PUT",body:Preview|Approved)=>fetch(endpoint,{
  method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
 });
 async function preview(){
  if(busy||pending||saved)return;
  if(!original||(action==="cancel"&&Array.from(reason.trim()).length<4)){setError(t("required"));return;}
  const target={slotId:slot.id,originalOccurrenceOn:original};
  const input:Preview=action==="cancel"?{...target,action,expectedUpdatedAt:slot.updated_at,reason:reason.trim()}:{...target,action};
  clear();setBusy(true);
  try{
   const response=await send("POST",input),body=await response.json();
   if(!response.ok){setError(message(body.code));return;}
   if(body.action!==input.action||body.originalOccurrenceOn!==original||body.writesPerformed!==false||
      body.requiresExplicitApproval!==true)throw new Error("Unverified review");
   if(input.action==="cancel"){
    if(body.slotId!==slot.id||typeof body.expectedUpdatedAt!=="string")throw new Error("Unverified rule");
    setReview({date:original,choice:{...input,expectedUpdatedAt:body.expectedUpdatedAt}});
   }else{
    if(typeof body.exceptionId!=="string"||typeof body.expectedRevision!=="string")throw new Error("Unverified cancellation");
    setReview({date:original,choice:{action:"restore",exceptionId:body.exceptionId,expectedRevision:body.expectedRevision}});
   }
  }catch{setError(t("unavailable"));}
  finally{setBusy(false);}
 }
 async function commit(){
  if(busy||!review||(!approved&&!pending)||saved)return;
  const input:Approved=pending??{...review.choice,idempotencyKey:crypto.randomUUID(),confirmed:true};
  setPending(input);setBusy(true);setError("");
  try{
   const response=await send("PUT",input),body=await response.json();
   if(!response.ok&&response.status<500&&Object.hasOwn(errors,body.code)){
    setPending(null);clear();setError(message(body.code));return;
   }
   if(!response.ok||body.idempotencyKey!==input.idempotencyKey||body.action!==input.action||
      body.originalOccurrenceOn!==review.date||typeof body.exceptionId!=="string"||
      (input.action==="restore"&&body.exceptionId!==input.exceptionId))throw new Error("Unverified receipt");
   setPending(null);clear();setSaved(input.action);
   // Do not auto-refresh the schedule: its separate materializer may create
   // a newly eligible lesson. This action reports only its exception receipt.
  }catch{setError(t("unconfirmed"));}
  finally{setBusy(false);}
 }
 const formatted=(date:string)=>new Intl.DateTimeFormat(locale,{timeZone:"UTC",dateStyle:"full"}).format(new Date(date+"T12:00:00Z"));
 return <section aria-label={t("heading")} className="space-y-3 rounded-lg border border-border p-3">
  <h3 className="font-semibold">{t("heading")}</h3>
  <p><bdi>{learner}</bdi></p>
  <p className="text-sm">{t("help")}</p>
  <fieldset disabled={busy||!!pending||!!saved} className="grid gap-2 sm:grid-cols-2">
   <label className="min-w-0">{t("action")}<select className={field} value={action} onChange={e=>{setAction(e.target.value==="restore"?"restore":"cancel");clear();}}>
    <option value="cancel">{t("cancelChoice")}</option>
    <option value="restore">{t("restoreChoice")}</option>
   </select></label>
   <label className="min-w-0">{t("original")}<input type="date" className={field} value={original} onChange={e=>{setOriginal(e.target.value);clear();}}/></label>
   {action==="cancel"&&<label className="min-w-0">{t("reason")}<input className={field} value={reason} maxLength={500} onChange={e=>{setReason(e.target.value);clear();}}/></label>}
   <button type="button" className="text-primary underline" onClick={()=>void preview()}>{t("preview")}</button>
  </fieldset>
  {review&&<div className="space-y-2">
   <p role="status">{t(review.choice.action==="cancel"?"reviewCancel":"reviewRestore",{date:formatted(review.date)})}</p>
   <label className="flex gap-2"><input type="checkbox" checked={approved} disabled={busy||!!pending}
    onChange={e=>setApproved(e.target.checked)}/>{t("approve")}</label>
   <button type="button" disabled={busy||!approved} className="text-primary underline" onClick={()=>void commit()}>{t(pending?"retry":"save")}</button>
  </div>}
  {error&&<p role="alert">{error}</p>}
  {saved&&<p role="status">{t(saved==="cancel"?"savedCancel":"savedRestore")}</p>}
  <button type="button" disabled={busy||!!pending} className="text-primary underline" onClick={onClose}>{t("close")}</button>
 </section>;
}
