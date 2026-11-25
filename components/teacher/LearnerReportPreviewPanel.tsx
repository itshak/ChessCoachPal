"use client";

import {useId,useState,useSyncExternalStore,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import {localeDetails,locales,supportedLocale} from "@/i18n/locales";
import {messagesFor} from "@/i18n/messages";
import type {
  BoundLearnerReport,PrivateLearnerReportSave,PrivateLearnerReportReceipt,
  PrivateLearnerReportSnapshot,PrivateLearnerReportSummary,
} from "@/lib/server/private-learner-report";
import {LearnerReportAudiencePanel} from "@/components/teacher/LearnerReportAudiencePanel";
import {LearnerReportLifecyclePanel} from "@/components/teacher/LearnerReportLifecyclePanel";
import type {ReportLifecycleReceipt} from "@/lib/server/private-learner-report-lifecycle";
import type {LearnerReportPreview} from "@/lib/server/learner-report-preview";

const hydrationSubscribe=()=>()=>{};
const clientReady=()=>true;
const serverReady=()=>false;
type Filters=Omit<PrivateLearnerReportSave,"studentId"|"reviewDigest"|"requestId"|"confirmed">;
type Approval={bound:BoundLearnerReport;request:Omit<PrivateLearnerReportSave,"studentId">};
type SavedList={reports:PrivateLearnerReportSummary[];truncated:boolean};

/** A single retry for a transport interruption: these GETs do not mutate. */
async function readReport(url:string){
  try{return await fetch(url,{cache:"no-store"});}
  catch{
    await new Promise(resolve=>setTimeout(resolve,250));
    return fetch(url,{cache:"no-store"});
  }
}

export function LearnerReportPreviewPanel({studentId,workplaces}:{
  studentId:string;workplaces:{id:string;name:string}[];
}){
  const t=useTranslations("learnerReportPreview");
  const lifecycleText=useTranslations("learnerReportLifecycle");
  const appLocale=supportedLocale(useLocale())??"en";
  const id=useId();
  // The server-rendered form cannot submit before the client handler attaches.
  const ready=useSyncExternalStore(hydrationSubscribe,clientReady,serverReady);
  const [result,setResult]=useState<LearnerReportPreview|null>(null);
  const [error,setError]=useState<"invalid"|"range"|"unavailable"|"stale"|"upgrade"|"retrySave"|null>(null);
  const [filters,setFilters]=useState<Filters|null>(null);
  const [approval,setApproval]=useState<Approval|null>(null);
  const [saved,setSaved]=useState<PrivateLearnerReportSnapshot|null>(null);
  const [receipt,setReceipt]=useState<PrivateLearnerReportReceipt|null>(null);
  const [savedList,setSavedList]=useState<SavedList|null>(null);
  const endpoint="/api/students/"+encodeURIComponent(studentId);
  const reportsUrl=endpoint+"/private-reports";
  const [pending,setPending]=useState(false);
  const [audienceUncertain,setAudienceUncertain]=useState(false);
  const [lifecycleUncertain,setLifecycleUncertain]=useState(false);
  const [lifecycleReceipt,setLifecycleReceipt]=useState<ReportLifecycleReceipt|null>(null);
  const reportActionPending=audienceUncertain||lifecycleUncertain;
  function applyLifecycle(receipt:ReportLifecycleReceipt){
    setSaved(current=>current?.publicationId===receipt.publicationId
      ?{...current,revision:receipt.revision,status:receipt.status}:current);
    setSavedList(current=>current?{...current,reports:current.reports.map(row=>row.publicationId===receipt.publicationId
      ?{...row,status:receipt.status}:row)}:null);
    setLifecycleReceipt(receipt);
  }

  function reset(){
    setResult(null);setError(null);setFilters(null);setApproval(null);setReceipt(null);setSaved(null);setLifecycleReceipt(null);
  }
  async function preview(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(reportActionPending)return;
    const form=new FormData(event.currentTarget);
    const query=new URLSearchParams();
    for(const name of ["workplaceId","from","to","outputLocale"])
      query.set(name,String(form.get(name)??""));
    reset();
    setPending(true);
    try{
      const response=await readReport(endpoint+"/report-preview?"+query);
      if(!response.ok){
        setError(response.status===400?"invalid":response.status===413?"range":"unavailable");
        return;
      }
      const value:LearnerReportPreview=await response.json();
      setResult(value);
      setFilters({workplaceId:query.get("workplaceId")!,from:value.candidate.from,
        to:value.candidate.to,outputLocale:value.candidate.outputLocale});
    }catch{setError("unavailable");}
    finally{setPending(false);}
  }

  async function reviewForSave(){
    if(!filters||pending||approval||receipt)return;
    setError(null);setSaved(null);setPending(true);
    try{
      const response=await readReport(reportsUrl+"?"+new URLSearchParams({mode:"review",...filters}));
      if(!response.ok){
        setError(response.status===413?"range":response.status===400?"invalid":"unavailable");return;
      }
      const bound:BoundLearnerReport=await response.json();
      setApproval({bound,request:{...filters,reviewDigest:bound.reviewDigest,requestId:crypto.randomUUID(),confirmed:true}});
    }catch{setError("unavailable");}
    finally{setPending(false);}
  }

  async function saveReviewed(){
    if(!approval||pending||receipt)return;
    setError(null);setPending(true);
    try{
      const response=await fetch(reportsUrl,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(approval.request)});
      if(!response.ok){
        const failure=await response.json().catch(()=>null);
        if(failure?.code==="REPORT_REVIEW_STALE"||failure?.code==="IDEMPOTENCY_CONFLICT"){
          setApproval(null);setError("stale");return;
        }
        setError(failure?.code==="UPGRADE_REQUIRED"?"upgrade":response.status>=500?"retrySave":"unavailable");return;
      }
      setReceipt(await response.json());
      setResult(approval.bound);
      setApproval(null);setSavedList(null);
    }catch{setError("retrySave");}
    finally{setPending(false);}
  }

  async function openSaved(publicationId:string){
    if(pending||reportActionPending)return;
    setError(null);setPending(true);
    try{
      const response=await readReport(reportsUrl+"?"+new URLSearchParams({mode:"get",publicationId}));
      if(!response.ok){setError("unavailable");return;}
      setSaved(await response.json());setApproval(null);setLifecycleReceipt(null);
    }catch{setError("unavailable");}
    finally{setPending(false);}
  }

  async function loadSaved(){
    if(pending||reportActionPending)return;
    setError(null);setPending(true);
    try{
      const response=await readReport(reportsUrl+"?mode=list");
      if(!response.ok){setError("unavailable");return;}
      setSavedList(await response.json());
    }catch{setError("unavailable");}
    finally{setPending(false);}
  }

  const saveUncertain=error==="retrySave";
  const candidate=saved?.candidate??approval?.bound.candidate??result?.candidate;
  const output=candidate?messagesFor(candidate.outputLocale).learnerReportPreview:null;
  const info=candidate?localeDetails[candidate.outputLocale]:null;
  const date=info?new Intl.DateTimeFormat(info.intl,{dateStyle:"medium",timeZone:"UTC"}):null;
  const displayDate=(value:string)=>date?.format(new Date(value+"T12:00:00Z"));
  const saveDate=new Intl.DateTimeFormat(localeDetails[appLocale].intl,{dateStyle:"medium",timeStyle:"short"});
  const action="w-fit max-w-full rounded border border-border px-3 py-2 text-sm";
  const control="min-w-0 w-full rounded border border-border bg-background px-2 py-1 text-foreground";
  return (
    <details className="mb-6 rounded-lg border border-border p-4">
      <summary className="cursor-pointer font-semibold">{t("title")}</summary>
      <p id={id+"-help"} className="mt-2 text-sm text-muted">{t("noSharing")}</p>
      {workplaces.length===0?<p className="mt-2 text-sm text-muted">{t("noWorkplaces")}</p>:(
        <form className="mt-3" onSubmit={preview} onChange={reset} aria-describedby={id+"-help"} aria-busy={pending}>
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2" disabled={!ready||pending||saveUncertain||reportActionPending}>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("workplace")}
              <select name="workplaceId" defaultValue="" required className={control}>
                <option value="" disabled>{t("chooseWorkplace")}</option>
                {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("outputLanguage")}
              <select name="outputLocale" defaultValue={appLocale} className={control}>
                {locales.map(locale=><option key={locale} value={locale}>{localeDetails[locale].name}</option>)}
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("from")}
              <input type="date" name="from" required className={control}/>
            </label>
            <label className="grid min-w-0 gap-1 text-sm">
              {t("to")}
              <input type="date" name="to" required className={control}/>
            </label>
            <button type="submit" className="w-fit max-w-full rounded border border-border px-3 py-2 text-sm">
              {pending?t("loading"):t("review")}
            </button>
          </fieldset>
        </form>
      )}
      {error&&<p className="mt-2 text-sm text-muted" role="alert">{t(error)}</p>}
      <div aria-live="polite" aria-atomic="false">
        {approval&&<p className="mt-3 text-sm font-semibold">{t("approvalHint")}</p>}
        {receipt&&<p className="mt-3 text-sm font-semibold" role="status">{t("savedNotice")}</p>}
        {saved&&<p className="mt-3 text-sm font-semibold">{t("savedSnapshot",{state:t(`reportStates.${saved.status}`)})}</p>}
        {candidate&&output&&info&&(
          <section className="mt-3 border-t border-border pt-3" aria-labelledby={id+"-result"}
            lang={candidate.outputLocale} dir={info.dir}>
            <h3 id={id+"-result"} className="font-semibold">{output.resultTitle}</h3>
            <p className="text-sm">{output.from}: {displayDate(candidate.from)} · {output.to}: {displayDate(candidate.to)}</p>
            <p className="mt-1 text-sm text-muted">{output.dateBasis}</p>
            {candidate.records.length===0?<p className="mt-2 text-sm">{output.noRecords}</p>:(
              <ul className="mt-2 list-disc ps-5 text-sm">
                {candidate.records.map((row,i)=>(
                  <li key={row.localDate+"-"+i}>{displayDate(row.localDate)}: {output.outcomes[row.attendance]}</li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {filters&&result?.candidate.records.length&&!receipt&&!approval&&!saved?(
          <button type="button" className={action} disabled={!ready||pending} onClick={reviewForSave}>
           {t("reviewToSave")}
          </button>
        ):null}
        {approval&&approval.bound.candidate.records.length>0&&(
          <button type="button" className={action} disabled={!ready||pending} onClick={saveReviewed}>
           {error==="retrySave"?t("retrySaveAction"):t("approveSave")}
          </button>
        )}
        {approval&&!saveUncertain&&(
          <button type="button" className={action} disabled={!ready||pending}
            onClick={()=>{setApproval(null);setError(null);}}>{t("cancelApproval")}</button>
        )}
        {receipt&&receipt.publicationId!==saved?.publicationId&&(
          <button type="button" className={action} disabled={!ready||pending} onClick={()=>openSaved(receipt.publicationId)}>
           {t("reopen")}
          </button>
        )}
        <button type="button" className={action} disabled={!ready||pending||saveUncertain||reportActionPending} onClick={loadSaved}>{t("loadSaved")}</button>
      </div>
      {lifecycleReceipt&&<p role="status" className="mt-3 text-sm font-semibold">
        {lifecycleText(lifecycleReceipt.status==="revoked"?"revoked":"superseded")}
      </p>}
      {saved&&<LearnerReportAudiencePanel key={saved.publicationId+"-"+saved.revision} studentId={studentId}
        publicationId={saved.publicationId} blocked={lifecycleUncertain} onUncertain={setAudienceUncertain}/>}
      {saved?.status==="sealed"&&<LearnerReportLifecyclePanel key={saved.publicationId} studentId={studentId}
        publicationId={saved.publicationId} blocked={audienceUncertain} onUncertain={setLifecycleUncertain}
        onCommitted={applyLifecycle}/>}
      {savedList&&(
        <div className="mt-3 text-sm" role="region" aria-label={t("loadSaved")}>
          {savedList.reports.length===0&&<p>{t("noSaved")}</p>}
          {savedList.truncated&&<p>{t("recentOnly")}</p>}
          <ul className="space-y-2">
            {savedList.reports.map(row=>{
              const label=t("savedEntry",{
                workplace:workplaces.find(w=>w.id===row.workplaceId)?.name??t("workplace"),
                time:saveDate.format(new Date(row.approvedAt)),
                language:localeDetails[row.outputLocale].name,state:t(`reportStates.${row.status}`),
              });
              return <li key={row.publicationId}><button type="button" className={action}
                disabled={!ready||pending||saveUncertain||reportActionPending} onClick={()=>openSaved(row.publicationId)}>{label}</button></li>;
            })}
          </ul>
        </div>
      )}
    </details>
  );
}
