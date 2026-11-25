"use client";

import {useId,useRef,useState} from "react";
import {useFormatter,useTranslations} from "next-intl";
import {localeDetails} from "@/i18n/locales";
import {messagesFor} from "@/i18n/messages";
import type {
 ReportLifecycleChoices,ReportLifecycleReceipt,ReportLifecycleReview,
} from "@/lib/server/private-learner-report-lifecycle";

type Pending={publicationId:string;replacementId:string|null;reviewDigest:string;requestId:string;confirmed:true};
type ErrorKey="unavailable"|"changed"|"uncertain";

export function LearnerReportLifecyclePanel({studentId,publicationId,blocked,onUncertain,onCommitted}:{
 studentId:string;publicationId:string;blocked:boolean;
 onUncertain:(uncertain:boolean)=>void;onCommitted:(receipt:ReportLifecycleReceipt)=>void;
}){
 const t=useTranslations("learnerReportLifecycle");
 const f=useFormatter();
 const id=useId();
 const guard=useRef(false);
 const [busy,setBusy]=useState(false);
 const [choices,setChoices]=useState<ReportLifecycleChoices|null>(null);
 const [replacementId,setReplacementId]=useState("");
 const [review,setReview]=useState<ReportLifecycleReview|null>(null);
 const [attempt,setAttempt]=useState<Pending|null>(null);
 const [issue,setIssue]=useState<ErrorKey|null>(null);
 const endpoint="/api/students/"+encodeURIComponent(studentId)+"/private-reports/lifecycle";
 const action="w-fit max-w-full rounded border border-border px-3 py-2 text-sm";
 const disabled=blocked||busy||!!attempt;
 function begin(){
  if(blocked||guard.current)return false;
  guard.current=true;setBusy(true);setIssue(null);
  return true;
 }
 function end(){guard.current=false;setBusy(false);}
 async function read(params:Record<string,string>){
  const url=endpoint+"?"+new URLSearchParams({publicationId,...params});
  try{return await fetch(url,{cache:"no-store"});}
  catch{
   await new Promise(resolve=>setTimeout(resolve,250));
   return fetch(url,{cache:"no-store"});
  }
 }
 async function loadChoices(){
  if(attempt||!begin())return;
  setReview(null);setReplacementId("");
  try{
   const response=await read({mode:"choices"});
   if(!response.ok)throw new Error();
   setChoices(await response.json());
  }catch{setIssue("unavailable");}
  finally{end();}
 }
 async function reviewExact(replacement:string|null){
  if(attempt||!begin())return;
  setReview(null);
  try{
   const response=await read({mode:"review",...(replacement?{replacementId:replacement}:{})});
   if(!response.ok){setIssue(response.status===409?"changed":"unavailable");return;}
   setReview(await response.json());
  }catch{setIssue("unavailable");}
  finally{end();}
 }
 async function commit(request:Pending){
  if(!begin())return;
  setAttempt(request);onUncertain(true);
  try{
   const response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),
   });
   if(!response.ok){
    if(response.status>=500){setIssue("uncertain");return;}
    setAttempt(null);onUncertain(false);setReview(null);
    setIssue(response.status===409?"changed":"unavailable");
    return;
   }
   const confirmed:ReportLifecycleReceipt=await response.json();
   setAttempt(null);onUncertain(false);onCommitted(confirmed);
  }catch{setIssue("uncertain");}
  finally{end();}
 }
 return (
  <section aria-labelledby={id+"-title"} aria-busy={busy} className="mt-4 min-w-0 border-t border-border pt-3">
   <h3 id={id+"-title"} className="font-semibold">{t("title")}</h3>
   <p className="mt-1 text-sm text-muted">{t("intro")}</p>
   <div className="mt-2 flex flex-wrap gap-2">
    <button type="button" className={action} disabled={disabled} onClick={()=>reviewExact(null)}>{t("reviewRevoke")}</button>
    <button type="button" className={action} disabled={disabled} onClick={loadChoices}>{t("loadChoices")}</button>
   </div>
   {issue&&<p role="alert" className="mt-2 text-sm">{t(issue)}</p>}
   {choices&&(
    <div className="mt-2 grid min-w-0 gap-2 text-sm">
     {choices.choices.length?<>
      <label htmlFor={id+"-replacement"}>{t("replacement")}</label>
      <select id={id+"-replacement"} className="w-full min-w-0 rounded border border-border bg-background px-2 py-2"
       value={replacementId} disabled={disabled} onChange={event=>{
        setReplacementId(event.target.value);setReview(null);setIssue(null);
       }}>
       <option value="">{t("choose")}</option>
       {choices.choices.map(choice=><option key={choice.publicationId} value={choice.publicationId}>
        {t("choice",{time:f.dateTime(new Date(choice.approvedAt),{dateStyle:"medium",timeStyle:"short"}),
         language:localeDetails[choice.outputLocale].name,code:choice.publicationId.slice(-8)})}
       </option>)}
      </select>
      <button type="button" className={action} disabled={disabled||!replacementId} onClick={()=>reviewExact(replacementId)}>
       {t("reviewReplacement")}
      </button>
     </>:<p>{t("none")}</p>}
     {choices.truncated&&<p>{t("limited")}</p>}
    </div>
   )}
   {review&&(
    <section className="mt-3 min-w-0 space-y-2 rounded border border-border p-3 text-sm" aria-labelledby={id+"-review"}>
     <h4 id={id+"-review"} className="font-semibold">{t(review.action==="revoke"?"confirmRevokeTitle":"confirmReplaceTitle")}</h4>
     <p>{t("impact",{count:review.notWithdrawnApprovals})}</p>
     <p>{t(review.action==="revoke"?"revokeHint":"replaceHint")}</p>
     {[review.original,...(review.replacement?[review.replacement]:[])].map((item,i)=>{
      const labels=messagesFor(item.candidate.outputLocale).learnerReportPreview;
      return <div key={item.publicationId} className="min-w-0 space-y-1">
       <h5 className="font-semibold">{t(i===0?"original":"corrected")}</h5>
       <p className="break-words">
        {t("reviewRange",{from:item.candidate.from,to:item.candidate.to,language:localeDetails[item.candidate.outputLocale].name,
         code:item.publicationId.slice(-8)})}
       </p>
       <ul lang={item.candidate.outputLocale} dir={localeDetails[item.candidate.outputLocale].dir} className="list-disc ps-5">
        {item.candidate.records.map((row,index)=><li key={index}>
         <time dateTime={row.localDate}><bdi>{row.localDate}</bdi></time>: {labels.outcomes[row.attendance]}
        </li>)}
       </ul>
      </div>;
     })}
     {!attempt&&<div className="flex flex-wrap gap-2">
      <button type="button" className={action} disabled={disabled} onClick={()=>commit({
       publicationId,replacementId:review.replacement?.publicationId??null,reviewDigest:review.reviewDigest,
       requestId:crypto.randomUUID(),confirmed:true,
      })}>{t(review.action==="revoke"?"confirmRevoke":"confirmReplace")}</button>
      <button type="button" className={action} disabled={disabled} onClick={()=>setReview(null)}>{t("cancel")}</button>
     </div>}
     {attempt&&issue==="uncertain"&&<button type="button" className={action} disabled={busy||blocked}
      onClick={()=>commit(attempt)}>{t("retry")}</button>}
    </section>
   )}
  </section>
 );
}
