"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useLocale,useTranslations} from "next-intl";

type Slot={id:string;updated_at:string};
type Request={slotId:string;expectedUpdatedAt:string;originalOccurrenceOn:string;revisedDate:string;revisedTime:string;reason:string};
type Review={originalOccurrenceOn:string;originalStartsAt:string;revisedStartsAt:string;timezone:string;
 durationMinutes:number;reviewDigest:string};
type Approved=Request&{reviewDigest:string;idempotencyKey:string;confirmed:true};
const endpoint="/api/coaching/calendar/slots/occurrence-move";
const row="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const errors:Record<string,"changed"|"materialized"|"conflict"|"invalid">={
 CANONICAL_SLOT_REVISION_CONFLICT:"changed",SLOT_RESCHEDULE_REVIEW_CONFLICT:"changed",
 SLOT_OCCURRENCE_ALREADY_MATERIALIZED:"materialized",SLOT_OCCURRENCE_ALREADY_HAS_EXCEPTION:"changed",
 SESSION_CONFLICT:"conflict",SLOT_RESCHEDULE_AMBIGUOUS_LOCAL_TIME:"invalid",
 SLOT_RESCHEDULE_INVALID_TIME:"invalid",SLOT_RESCHEDULE_NOT_A_RULE_DATE:"invalid",
 SLOT_RESCHEDULE_ENROLLMENT_REQUIRED:"changed",CANONICAL_SLOT_NOT_FOUND:"changed",
 CANONICAL_SLOT_WORKPLACE_NOT_FOUND:"changed",
};
export function OriginalOccurrenceMove({slot,learner,onClose}:{slot:Slot;learner:string;onClose:()=>void}){
 const t=useTranslations("occurrenceMove"),locale=useLocale(),router=useRouter();
 const [original,setOriginal]=useState(""),[revised,setRevised]=useState(""),[time,setTime]=useState(""),[reason,setReason]=useState("");
 const [proposal,setProposal]=useState<{request:Request;review:Review}|null>(null),[approved,setApproved]=useState(false);
 const [pending,setPending]=useState<Approved|null>(null),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[saved,setSaved]=useState(false);
 const clear=()=>{setProposal(null);setApproved(false);setError("");};
 const message=(key:string)=>Object.hasOwn(errors,key)?t(errors[key]):t("unavailable");
 const send=(method:"POST"|"PUT",body:Request|Approved)=>fetch(endpoint,{
  method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
 });
 const format=(instant:string,zone:string)=>new Intl.DateTimeFormat(locale,{timeZone:zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(instant));
 async function preview(){
  if(busy||pending)return;
  if(!original||!revised||!time||reason.trim().length<4){setError(t("required"));return;}
  const request={slotId:slot.id,expectedUpdatedAt:slot.updated_at,originalOccurrenceOn:original,
   revisedDate:revised,revisedTime:time,reason:reason.trim()};
  clear();setBusy(true);
  try{
   const response=await send("POST",request),body=await response.json();
   if(!response.ok||!body.reviewDigest){setError(message(body.code));return;}
   setProposal({request,review:body as Review});
  }catch{setError(t("unavailable"));}
  finally{setBusy(false);}
 }
 async function commit(){
  if(busy||!proposal||(!approved&&!pending))return;
  const request:Approved=pending??{...proposal.request,reviewDigest:proposal.review.reviewDigest,
   confirmed:true,idempotencyKey:crypto.randomUUID()};
  setPending(request);setBusy(true);setError("");
  try{
   const response=await send("PUT",request),body=await response.json();
   if(!response.ok&&response.status<500&&Object.hasOwn(errors,body.code)){
    setPending(null);clear();setError(message(body.code));return;
   }
   if(!response.ok||body.idempotencyKey!==request.idempotencyKey||!body.sessionId)
    throw new Error("unverified");
   setPending(null);clear();setSaved(true);router.refresh();
  }catch{setError(t("unconfirmed"));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("heading")} className="space-y-3 rounded-lg border border-border p-3">
  <h3 className="font-semibold">{t("heading")}</h3>
  <p><bdi>{learner}</bdi></p>
  <p className="text-sm">{t("help")}</p>
  <fieldset disabled={busy||!!pending||saved} className="grid gap-2 sm:grid-cols-2">
   <label>{t("original")}<input className={row} type="date" value={original} onChange={e=>{setOriginal(e.target.value);clear();}}/></label>
   <label>{t("destination")}<input className={row} type="date" value={revised} onChange={e=>{setRevised(e.target.value);clear();}}/></label>
   <label>{t("time")}<input className={row} type="time" value={time} onChange={e=>{setTime(e.target.value);clear();}}/></label>
   <label>{t("reason")}<input className={row} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);clear();}}/></label>
   <button type="button" className="text-primary underline" onClick={()=>void preview()}>{t("preview")}</button>
  </fieldset>
  {proposal&&<div className="space-y-2">
   <p role="status">{t("review",{original:format(proposal.review.originalStartsAt,proposal.review.timezone),
    revised:format(proposal.review.revisedStartsAt,proposal.review.timezone),zone:proposal.review.timezone,
    minutes:proposal.review.durationMinutes})}</p>
   <label className="flex gap-2"><input type="checkbox" checked={approved} disabled={busy||!!pending}
    onChange={e=>setApproved(e.target.checked)}/>{t("approve")}</label>
   <button type="button" disabled={busy||!approved} className="text-primary underline"
    onClick={()=>void commit()}>{t(pending?"retry":"save")}</button>
  </div>}
  {error&&<p role="alert">{error}</p>}
  {saved&&<p role="status">{t("saved")}</p>}
  <button type="button" disabled={busy||!!pending} className="text-primary underline" onClick={onClose}>{t("close")}</button>
 </section>;
}
