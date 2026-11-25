"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";

type Slot={id:string;updated_at:string};
type Review={
 cutoff:string;reviewThrough:string;reviewDigest:string;
 affectedSegments:number;planned:number;replaceableDrafts:number;preservedHistory:number;
};
type Scope="this_and_future"|"entire_series";
type Draft={slotId:string;scope:Scope;originalCutoff:string|null;reviewThrough:string;
 successorId:string|null;expectedUpdatedAt:string;changes:{startTime?:string;durationMinutes?:number}};
type Approved=Draft&{reviewDigest:string;idempotencyKey:string;confirmed:true};
const endpoint="/api/coaching/calendar/slots/scoped";
const input="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const rejectedBeforeCommit=new Set([
 "RECURRENCE_SCOPE_NOT_FOUND","RECURRENCE_SCOPE_WORKPLACE_REQUIRED","RECURRENCE_SCOPE_ENROLLMENT_REQUIRED",
 "RECURRENCE_SCOPE_REVISION_CONFLICT","RECURRENCE_SCOPE_REVIEW_CONFLICT","RECURRENCE_SCOPE_INVALID_CUTOFF",
 "RECURRENCE_SCOPE_INVALID_RANGE","RECURRENCE_SCOPE_REVIEW_RANGE_INCOMPLETE",
 "RECURRENCE_SCOPE_AMBIGUOUS_LOCAL_TIME","RECURRENCE_SCOPE_PROPOSED_START_PASSED",
 "RECURRENCE_SCOPE_EXCEPTION_RECONCILIATION_REQUIRED","RECURRENCE_SCOPE_TAIL_CONFLICT","SESSION_CONFLICT",
]);
export function ScopedSeriesEditor({slot,learner,onClose}:{slot:Slot;learner:string;onClose:()=>void}){
 const t=useTranslations("scopedRecurrence"),router=useRouter();
 const [scope,setScope]=useState<Scope>("this_and_future"),[cutoff,setCutoff]=useState(""),[through,setThrough]=useState("");
 const [time,setTime]=useState(""),[duration,setDuration]=useState("");
 const [review,setReview]=useState<{request:Draft;receipt:Review}|null>(null);
 const [pending,setPending]=useState<Approved|null>(null),[approve,setApprove]=useState(false);
 const [busy,setBusy]=useState(false),[issue,setIssue]=useState(""),[stored,setStored]=useState(false);
 const clear=()=>{setReview(null);setApprove(false);setIssue("");setStored(false);};
 async function check(){
  if(busy||pending)return;
  if(!through||scope==="this_and_future"&&!cutoff||!time&&!duration){setIssue(t("missing"));return;}
  let request:Draft={slotId:slot.id,scope,originalCutoff:scope==="this_and_future"?cutoff:null,
   reviewThrough:through,successorId:null,expectedUpdatedAt:slot.updated_at,
   changes:{...(time?{startTime:time}:{}),...(duration?{durationMinutes:Number(duration)}:{})}};
  clear();setBusy(true);
  try{
   const send=(draft:Draft)=>fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(draft)});
   let res=await send(request),body=await res.json();
   if(!res.ok&&body.code==="RECURRENCE_SCOPE_TAIL_ID_REQUIRED"){
    request={...request,successorId:crypto.randomUUID()};
    res=await send(request);
    body=await res.json();
   }
   if(!res.ok||!body.reviewDigest){setIssue(t("notReviewable"));return;}
   setReview({request,receipt:body as Review});
  }catch{setIssue(t("unavailable"));}
  finally{setBusy(false);}
 }
 async function save(){
  if(busy||(!pending&&(!review||!approve)))return;
  const payload=pending??{...review!.request,reviewDigest:review!.receipt.reviewDigest,
   confirmed:true as const,idempotencyKey:crypto.randomUUID()};
  setPending(payload);setBusy(true);setIssue("");
  try{
   const res=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)});
   const body=await res.json();
   if(!res.ok&&res.status<500&&rejectedBeforeCommit.has(body.code)){
    setPending(null);clear();setIssue(t("notReviewable"));return;
   }
   if(!res.ok||body.idempotencyKey!==payload.idempotencyKey||typeof body.replayed!=="boolean")
    throw new Error("unverified");
   setPending(null);clear();setStored(true);router.refresh();
  }catch{setIssue(t("unconfirmed"));}
  finally{setBusy(false);}
 }
 return <section className="space-y-3 rounded-lg border border-border p-3" aria-label={t("heading")}>
  <h3 className="font-semibold">{t("heading")}</h3>
  <p><bdi>{learner}</bdi></p>
  <p className="text-sm">{t("help")}</p>
  <fieldset disabled={busy||!!pending||stored} className="grid gap-2 sm:grid-cols-2">
   <label>{t("scope")}<select className={input} value={scope} onChange={e=>{setScope(e.target.value as Scope);clear();}}>
    <option value="this_and_future">{t("future")}</option><option value="entire_series">{t("entire")}</option>
   </select></label>
   {scope==="this_and_future"&&<label>{t("original")}<input className={input} type="date" value={cutoff}
    onChange={e=>{setCutoff(e.target.value);clear();}}/></label>}
   <label>{t("through")}<input className={input} type="date" value={through}
    onChange={e=>{setThrough(e.target.value);clear();}}/></label>
   <label>{t("newTime")}<input className={input} type="time" value={time} onChange={e=>{setTime(e.target.value);clear();}}/></label>
   <label>{t("newDuration")}<input className={input} type="number" min={15} max={480} value={duration}
    onChange={e=>{setDuration(e.target.value);clear();}}/></label>
   <button type="button" className="text-primary underline" onClick={()=>void check()}>{t("review")}</button>
  </fieldset>
  {review&&<div className="space-y-2">
   <p role="status">{t("reviewCounts",{from:review.receipt.cutoff,to:review.receipt.reviewThrough,
    segments:review.receipt.affectedSegments,planned:review.receipt.planned,
    drafts:review.receipt.replaceableDrafts,protected:review.receipt.preservedHistory})}</p>
   <label className="flex gap-2"><input type="checkbox" checked={approve} disabled={busy||!!pending}
    onChange={e=>setApprove(e.target.checked)}/>{t("confirm")}</label>
   <button type="button" className="text-primary underline" disabled={busy||!approve}
    onClick={()=>void save()}>{t(pending?"retry":"save")}</button>
  </div>}
  {stored&&<p role="status">{t("saved")}</p>}
  {issue&&<p role="alert">{issue}</p>}
  <button type="button" className="text-primary underline" disabled={busy||!!pending} onClick={onClose}>{t("close")}</button>
 </section>;
}
