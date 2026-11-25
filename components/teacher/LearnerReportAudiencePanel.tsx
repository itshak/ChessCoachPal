"use client";

import {useId,useRef,useState} from "react";
import {useFormatter,useTranslations} from "next-intl";
import type {ReportAudienceOverview,ReportAudienceReceipt,ReportAudienceReview} from "@/lib/server/private-learner-report-audience";

type Choice=ReportAudienceOverview["choices"][number];
type Previous=ReportAudienceOverview["approvals"][number];
type Pending=
 | {mode:"approve";publicationId:string;portalGrantId:string;reviewDigest:string;requestId:string;confirmed:true}
 | {mode:"withdraw";publicationId:string;portalGrantId:string;approvalId:string;confirmed:true};
type ErrorKey="unavailable"|"reviewAgain"|"upgrade"|"uncertain";

export function LearnerReportAudiencePanel({studentId,publicationId,onUncertain}:{
 studentId:string;publicationId:string;onUncertain:(uncertain:boolean)=>void;
}){
 const t=useTranslations("learnerReportAudience");
 const f=useFormatter();
 const id=useId();
 const guard=useRef(false);
 const [busy,setBusy]=useState(false);
 const [overview,setOverview]=useState<ReportAudienceOverview|null>(null);
 const [choice,setChoice]=useState("");
 const [review,setReview]=useState<ReportAudienceReview|null>(null);
 const [withdrawal,setWithdrawal]=useState<Previous|null>(null);
 const [attempt,setAttempt]=useState<Pending|null>(null);
 const [receipt,setReceipt]=useState<ReportAudienceReceipt|null>(null);
 const [issue,setIssue]=useState<ErrorKey|null>(null);
 const endpoint="/api/students/"+encodeURIComponent(studentId)+"/private-reports/audience";
 const date=(value:string)=>f.dateTime(new Date(value),{dateStyle:"medium",timeStyle:"short"});
 const action="w-fit max-w-full rounded border border-border px-3 py-2 text-sm";
 function begin(){
  if(guard.current)return false;
  guard.current=true;setBusy(true);setIssue(null);setReceipt(null);
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
 async function load(more=false){
  if(attempt||!begin())return;
  if(!more){setChoice("");setReview(null);setWithdrawal(null);}
  try{
   const cursor=more?overview?.nextApprovalCursor:null;
   const response=await read({mode:"list",...(cursor?{
    afterApprovedAt:cursor.approvedAt,afterPortalGrantId:cursor.portalGrantId,
   }:{})});
   if(!response.ok)throw new Error();
   const value:ReportAudienceOverview=await response.json();
   setOverview(old=>more&&old?{
    ...old,approvals:[...old.approvals,...value.approvals.filter(next=>
     !old.approvals.some(row=>row.approvalId===next.approvalId))],nextApprovalCursor:value.nextApprovalCursor,
   }:value);
  }catch{setIssue("unavailable");}
  finally{end();}
 }
 async function reviewChoice(){
  if(attempt||!choice||!begin())return;
  setReview(null);setWithdrawal(null);
  try{
   const response=await read({mode:"review",portalGrantId:choice});
   if(!response.ok){setIssue(response.status===404?"reviewAgain":"unavailable");return;}
   setReview(await response.json());
  }catch{setIssue("unavailable");}
  finally{end();}
 }
 async function commit(request:Pending){
  if(!begin())return;
  setAttempt(request);
  onUncertain(true);
  try{
   const response=await fetch(endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),
   });
   if(!response.ok){
    if(response.status>=500){setIssue("uncertain");return;}
    const result=await response.json().catch(()=>null);
    setAttempt(null);onUncertain(false);
    setReview(null);setWithdrawal(null);
    setIssue(result?.code==="UPGRADE_REQUIRED"?"upgrade":
      response.status===404||response.status===409?"reviewAgain":"unavailable");
    return;
   }
   const confirmed:ReportAudienceReceipt=await response.json();
   setReceipt(confirmed);
   setAttempt(null);onUncertain(false);
   setChoice("");setReview(null);setWithdrawal(null);
   setOverview(current=>current&&({
    ...current,
    choices:current.choices.filter(item=>item.portalGrantId!==confirmed.portalGrantId),
    approvals:[
     {...confirmed,recipientName:review?.recipientName??withdrawal?.recipientName??null},
     ...current.approvals.filter(item=>item.approvalId!==confirmed.approvalId),
    ],
   }));
  }catch{setIssue("uncertain");}
  finally{end();}
 }
 function name(option:Choice){
  return t("choice",{name:option.recipientName,time:date(option.expiresAt),code:option.portalGrantId.slice(-8)});
 }
 return (
  <section aria-labelledby={id+"-title"} aria-busy={busy} className="mt-4 min-w-0 border-t border-border pt-3">
   <h3 id={id+"-title"} className="font-semibold">{t("title")}</h3>
   <p className="mt-1 text-sm text-muted">{t("intro")}</p>
   <button type="button" className={action+" mt-2"} disabled={busy||!!attempt} onClick={()=>load()}>{t("load")}</button>
   {issue&&<p role="alert" className="mt-2 text-sm">{t(issue)}</p>}
   {receipt&&<p role="status" className="mt-2 text-sm font-semibold">{t(receipt.revokedAt?"withdrawn":"approved")}</p>}
   {overview&&(
    <div className="mt-3 space-y-3 text-sm">
     {overview.choices.length>0?(
      <div className="grid min-w-0 gap-2">
       <label htmlFor={id+"-choice"}>{t("recipient")}</label>
       <select id={id+"-choice"} className="w-full min-w-0 rounded border border-border bg-background px-2 py-2"
        value={choice} disabled={busy||!!attempt} onChange={e=>{
         setChoice(e.target.value);setReview(null);setWithdrawal(null);setIssue(null);setReceipt(null);
        }}>
        <option value="">{t("select")}</option>
        {overview.choices.map(option=><option key={option.portalGrantId} value={option.portalGrantId}>{name(option)}</option>)}
       </select>
       <button type="button" className={action} disabled={busy||!choice||!!attempt||!!review} onClick={reviewChoice}>{t("review")}</button>
      </div>
     ):<p>{t("none")}</p>}
     {overview.choicesTruncated&&<p>{t("choicesLimited")}</p>}
     {review&&(
      <div className="min-w-0 space-y-2 rounded border border-border p-3">
       <p className="break-words">{t("reviewExact",{name:review.recipientName,student:review.learnerName,
        workplace:review.workplaceName,time:date(review.expiresAt),code:review.portalGrantId.slice(-8)})}</p>
       {!attempt&&<div className="flex flex-wrap gap-2">
        <button type="button" className={action} disabled={busy} onClick={()=>commit({
         mode:"approve",publicationId,portalGrantId:review.portalGrantId,reviewDigest:review.reviewDigest,
         requestId:crypto.randomUUID(),confirmed:true,
        })}>{t("confirm")}</button>
        <button type="button" className={action} disabled={busy} onClick={()=>setReview(null)}>{t("cancel")}</button>
       </div>}
      </div>
     )}
     {overview.approvals.length>0&&(
      <div className="space-y-2">
       <h4 className="font-semibold">{t("previous")}</h4>
       <ul className="space-y-3">
        {overview.approvals.map(row=>(
         <li key={row.approvalId} className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words">{t("previousEntry",{name:row.recipientName??t("unknown"),
           code:row.portalGrantId.slice(-8),time:date(row.revokedAt??row.approvedAt),
           state:t(row.revokedAt?"statusWithdrawn":"statusApproved")})}</span>
          {!row.revokedAt&&<button type="button" className={action} disabled={busy||!!attempt} onClick={()=>{
           setReview(null);setIssue(null);setReceipt(null);setWithdrawal(row);
          }}>{t("withdraw")}</button>}
         </li>
        ))}
       </ul>
      </div>
     )}
     {overview.nextApprovalCursor&&<button type="button" className={action} disabled={busy||!!attempt} onClick={()=>load(true)}>{t("more")}</button>}
     {withdrawal&&(
      <div className="min-w-0 space-y-2 rounded border border-border p-3">
       <p className="break-words">{t("withdrawExact",{name:withdrawal.recipientName??t("unknown"),code:withdrawal.portalGrantId.slice(-8)})}</p>
       {!attempt&&<div className="flex flex-wrap gap-2">
        <button type="button" className={action} disabled={busy} onClick={()=>commit({
         mode:"withdraw",publicationId,portalGrantId:withdrawal.portalGrantId,approvalId:withdrawal.approvalId,confirmed:true,
        })}>{t("confirmWithdraw")}</button>
        <button type="button" className={action} disabled={busy} onClick={()=>setWithdrawal(null)}>{t("cancel")}</button>
       </div>}
      </div>
     )}
     {attempt&&issue==="uncertain"&&<button type="button" className={action} disabled={busy} onClick={()=>commit(attempt)}>{t("retry")}</button>}
    </div>
   )}
  </section>
 );
}
