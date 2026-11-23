"use client";

import {useId,useRef,useState} from "react";
import {useTranslations} from "next-intl";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {workplaceLocalToUtc} from "@/lib/coaching-time";

type Outcome=""|"present"|"late"|"excused";
export type CompletedRecoveryPhase="idle"|"inFlight"|"unconfirmed";
type Learner={id:string;name:string;archived:boolean};
type Preview={
 canCommit:boolean;issues:{code:string;studentId?:string}[];
 calendar:{teacherDay:string;teacherTimezone:string;venueDay:string;venueTimezone:string};
 proposedCommit:Record<string,unknown>|null;activeCapacityRemaining:number|null;
};
// Only explicit business denials from the signed route establish no commit.
const definitiveDenials:Record<number,readonly string[]>={
 400:["VALIDATION_ERROR"],404:["NOT_FOUND"],409:["PREVIEW_CHANGED","CAPACITY_EXCEEDED","CONFLICT"],
};
const endpoint="/api/coaching/lesson-capture/recovery/completed";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";
const field="w-full min-w-0 rounded-lg border border-border bg-surface p-2 text-foreground";

export function CompletedArchivedRecoveryPanel({
 workplace,learners,title,localStart,durationMinutes,onCommitted,onPhaseChange,
}:{
 workplace:{id:string;name:string;timezone:string};
 learners:Learner[];title:string;localStart:string;durationMinutes:number;
 onCommitted:(id:string)=>void;
 onPhaseChange:(phase:CompletedRecoveryPhase)=>void;
}){
 const t=useTranslations("lessonCapture"),toUserError=useLocalizedApiError();
 const legendId=useId();
 const [outcomes,setOutcomes]=useState<Record<string,Outcome>>({});
 const [review,setReview]=useState<Preview|null>(null);
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [unconfirmed,setUnconfirmed]=useState(false);
 const inFlight=useRef(false);
 const pendingBody=useRef<string|null>(null);
 function begin(){
  inFlight.current=true;setBusy(true);onPhaseChange("inFlight");
 }
 function settle(phase:CompletedRecoveryPhase){
  inFlight.current=false;setBusy(false);onPhaseChange(phase);
 }
 const premiseLocked=busy||unconfirmed;
 const allAttested=learners.length>0&&learners.every(x=>outcomes[x.id])&&
  learners.some(x=>outcomes[x.id]==="present"||outcomes[x.id]==="late");
 const eligible=learners.length===1||learners.some(x=>!x.archived);
 async function preview(){
  if(!allAttested||!eligible||inFlight.current||pendingBody.current)return;
  begin();setError("");setConfirmed(false);setReview(null);
  try{
   const startsAt=workplaceLocalToUtc(localStart,workplace.timezone);
   const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({workplaceId:workplace.id,studentIds:learners.map(x=>x.id),
     title,startsAt,localStart,durationMinutes,attendance:learners.map(x=>({studentId:x.id,status:outcomes[x.id]}))}),
    cache:"no-store",signal:AbortSignal.timeout(20000)});
   const data=await response.json();
   if(!response.ok)throw new Error(toUserError(data,t("completedRecoveryFailed")));
   setReview(data as Preview);
  }catch(caught){setError(toUserError(caught,t("completedRecoveryFailed")));}
  finally{settle("idle");}
 }
 async function commit(){
  if(inFlight.current)return;
  if(!pendingBody.current){
   if(!review?.canCommit||!review.proposedCommit||!confirmed||reason.trim().length<8)return;
   pendingBody.current=JSON.stringify({...review.proposedCommit,reason:reason.trim(),
    confirmed:true,requestId:crypto.randomUUID()});
  }
  begin();setError("");
  try{
   const response=await fetch(endpoint,{method:"PUT",headers:{"Content-Type":"application/json"},
    body:pendingBody.current,cache:"no-store",signal:AbortSignal.timeout(20000)});
   const data=await response.json();
   if(response.ok&&data?.status==="completed"&&typeof data.sessionId==="string"){
    pendingBody.current=null;setUnconfirmed(false);settle("idle");onCommitted(data.sessionId);
    return;
   }
   if(typeof data?.code==="string"&&definitiveDenials[response.status]?.includes(data.code)){
    pendingBody.current=null;setUnconfirmed(false);setReview(null);setConfirmed(false);
    setError(toUserError(data,t("completedRecoveryFailed")));settle("idle");return;
   }
  }catch{/* A transport or invalid-response failure does not prove the write failed. */}
  setUnconfirmed(true);settle("unconfirmed");
 }
 const issueMessage=(code:string)=>{
  switch(code){
   case "CAPACITY_EXCEEDED":return t("recoveryCapacityBlocked");
   case "COMPLETED_RECOVERY_SAME_DAY_ONLY":return t("completedRecoverySameDay");
   case "COMPLETED_RECOVERY_PRE_ARCHIVE_HISTORY":return t("completedRecoveryBeforeArchive");
   case "COMPLETED_RECOVERY_UNREVIEWED_LOCAL_TIME":return t("invalidLocalTime");
   default:return t("completedRecoveryBlocked");
  }
 };
 return <section aria-labelledby={legendId} className="space-y-3">
   <h4 className="font-semibold" id={legendId}>{t("completedRecoveryChoice")}</h4>
   <p className="text-sm">{t("completedRecoveryIntro")}</p>
   {!eligible?<p role="alert">{t("completedRecoveryMixedOnly")}</p>:<>
    <fieldset className="space-y-2" disabled={premiseLocked}>
     <legend className="text-sm font-semibold">{t("completedRecoveryAttendance")}</legend>
     {learners.map((learner,i)=><label className="block text-sm" key={learner.id}>
      <span>{t("completedRecoveryLearner",{name:learner.name,position:i+1})}</span>
      <select className={field} value={outcomes[learner.id]??""} onChange={e=>{
       const value=e.target.value as Outcome;
       setOutcomes(old=>({...old,[learner.id]:value}));setReview(null);setConfirmed(false);
      }}>
       <option value="">{t("completedRecoveryChooseOutcome")}</option>
       <option value="present">{t("completedRecoveryPresent")}</option>
       <option value="late">{t("completedRecoveryLate")}</option>
       <option value="excused">{t("completedRecoveryExcused")}</option>
      </select>
     </label>)}
    </fieldset>
    <button className={button} type="button" disabled={!allAttested||premiseLocked} onClick={()=>void preview()}>{t("completedRecoveryPreview")}</button>
   </>}
   {busy&&<p role="status">{t("completedRecoveryPending")}</p>}
   {unconfirmed&&!busy&&<p role="alert">{t("completedRecoveryUnconfirmed")}</p>}
   {error&&<p role="alert">{error}</p>}
   {review&&<div aria-live="polite" className="space-y-2">
    <p className="text-sm">{t("completedRecoveryReadBack",{
     place:workplace.name,venue:review.calendar.venueDay,zone:review.calendar.venueTimezone,
     teacher:review.calendar.teacherDay,
    })}</p>
    {review.issues.map((i,n)=><p role="alert" key={n}>{issueMessage(i.code)}</p>)}
    {review.canCommit&&review.proposedCommit&&<>
     <label className="block text-sm">{t("completedRecoveryReason")}
      <textarea className={field} value={reason} onChange={e=>{
       setReason(e.target.value);setConfirmed(false);
      }} maxLength={1000} disabled={premiseLocked} />
     </label>
     <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={premiseLocked}/>
      {t("completedRecoveryApprove")}
     </label>
     <button className={button} type="button" disabled={busy||(!unconfirmed&&(!confirmed||reason.trim().length<8))}
      onClick={()=>void commit()}>{t(unconfirmed?"completedRecoveryRetry":"completedRecoveryCommit")}</button>
    </>}
   </div>}
 </section>;
}
