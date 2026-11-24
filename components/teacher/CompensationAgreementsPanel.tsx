"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {ExactSponsorPanel} from "./ExactSponsorPanel";
import {PrivateSeriesCompensationPanel} from "./PrivateSeriesCompensationPanel";

type Workplace={id:string;name:string;currency:string;timezone:string};
type Student={id:string;name:string};
type Group={id:string;name:string;workplace_id:string};
type Payer={id:string;displayName:string;status:string};
type ExactLesson={id:string;title:string;startsAt:string;durationMinutes:number;timezone:string};
type Agreement={id:string;workplaceId:string;studentId:string|null;groupId:string|null;
 exactSessionId:string|null;billingAccountId:string;agreementRole:"coach_earning"|"participant_charge";
 model:"hourly"|"per_session"|"per_student"|"fixed_period";
 rateCents:number;currency:string;effectiveFrom:string;effectiveTo:string|null;
 status:"active"|"archived";revision:number};
type Preview={agreement:Agreement;projection:{expectedCents:number;currency:string;
 eligibleInstructorMinutes:number;eligibleSessionCount:number;eligibleParticipantCount:number};
 excludedExactSessionCount:number;excludedGroupSessionCount:number;persistedObligation:false;paymentRecorded:false};
const field="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
async function getJson<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{cache:"no-store",...init});
 const value=await res.json().catch(()=>null);
 if(!res.ok)throw Object.assign(new Error(typeof value?.error==="string"?value.error:"Request failed"),
  {code:value?.code,status:res.status});
 return value as T;
}
export function CompensationAgreementsPanel({initialWorkplaceId}:{initialWorkplaceId?:string|null}){
 const t=useTranslations("compensation"),locale=useLocale(),errorText=useLocalizedApiError();
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [workplaceId,setWorkplaceId]=useState(initialWorkplaceId??"");
 const [loadedContext,setLoadedContext]=useState(initialWorkplaceId);
 const [students,setStudents]=useState<Student[]>([]),[groups,setGroups]=useState<Group[]>([]);
 const [payers,setPayers]=useState<Payer[]>([]);
 const [agreements,setAgreements]=useState<Agreement[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [role,setRole]=useState<Agreement["agreementRole"]>("coach_earning");
 const [model,setModel]=useState<Agreement["model"]>("hourly");
 const [rate,setRate]=useState(12000);
 const [scope,setScope]=useState("workplace"),[scopedId,setScopedId]=useState("");
 const [payerId,setPayerId]=useState("");
 const [start,setStart]=useState(new Date().toISOString().slice(0,7)+"-01");
 const [end,setEnd]=useState("");
 const [previewFrom,setPreviewFrom]=useState(new Date().toISOString().slice(0,7)+"-01");
 const [previewTo,setPreviewTo]=useState(()=>{
  const now=new Date();return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,0))
   .toISOString().slice(0,10);
 });
 const [preview,setPreview]=useState<Preview|null>(null);
 const [exactDay,setExactDay]=useState(""),[exactChoices,setExactChoices]=useState<ExactLesson[]>([]);
 const [exactState,setExactState]=useState<"idle"|"loading"|"ready"|"error">("idle");
 const exactScopeKey=workplaceId+":"+exactDay;
 const [resolvedExactScope,setResolvedExactScope]=useState("");
 const readyExact=exactState==="ready"&&resolvedExactScope===exactScopeKey&&loadedContext===initialWorkplaceId;
 const visibleExactChoices=readyExact?exactChoices:[];
 const exactChoice=visibleExactChoices.find(x=>x.id===scopedId);
 const writeKey=useRef<{premise:string;id:string}|null>(null);
 const exactAttempt=useRef<{workplaceId:string;body:Record<string,unknown>}|null>(null);
 const [uncertain,setUncertain]=useState(false);
 const [superseded,setSuperseded]=useState(false);
 async function sendExact(){
  const attempt=exactAttempt.current;
  if(!attempt)return;
  setBusy(true);setError("");
  try{
   await getJson("/api/compensation-agreements",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(attempt.body)});
   exactAttempt.current=null;setUncertain(false);setSuperseded(false);writeKey.current=null;
   if(workplaceId===attempt.workplaceId)await refreshAgreements(attempt.workplaceId);
  }catch(e){
   const status=(e as {status?:number}|null)?.status;
   const code=(e as {code?:string}|null)?.code;
   const refused=!uncertain&&status!==undefined&&status<500&&[
    "AGREEMENT_CONFLICT","CURRENCY_MISMATCH","EXACT_AGREEMENT_ALREADY_POSTED",
    "EXACT_AGREEMENT_SCOPE_UNAVAILABLE","PAYER_ARCHIVED","VALIDATION_ERROR","NOT_FOUND",
   ].includes(code??"");
   if(refused){exactAttempt.current=null;setUncertain(false);writeKey.current=null;}
   else{
    setUncertain(Boolean(exactAttempt.current));
    if(uncertain&&code==="AGREEMENT_CONFLICT")setSuperseded(true);
   }
   setError(errorText(e,t("saveFailed")));
  }finally{setBusy(false);}
 }
 useEffect(()=>{
  if(scope!=="exact"||!workplaceId||!exactDay)return;
  const controller=new AbortController();
  const query=new URLSearchParams({workplaceId,date:exactDay});
  void getJson<{workplaceId:string;date:string;lessons:ExactLesson[]}>("/api/compensation-agreements/completed-lessons?"+query,{signal:controller.signal})
   .then(value=>{
    if(controller.signal.aborted)return;
    if(value.workplaceId!==workplaceId||value.date!==exactDay){setExactState("error");return;}
    setExactChoices(value.lessons);setResolvedExactScope(workplaceId+":"+exactDay);setExactState("ready");
   }).catch(()=>{if(!controller.signal.aborted)setExactState("error");});
  return ()=>controller.abort();
 },[scope,workplaceId,exactDay]);
 function clearExact(){
  setScopedId("");setExactChoices([]);setResolvedExactScope("");setExactState(exactDay?"loading":"idle");setPreview(null);
 }
 async function load(stillCurrent:()=>boolean){
  const [context,studentsData,groupsData,payersData]=await Promise.all([
   getJson<{workplaces:Workplace[]}>("/api/teacher/workplace-context"),
   getJson<{data:Student[];ok:boolean}>("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"students.search",query:""})}),
   getJson<{data:Group[];ok:boolean}>("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"groups.list"})}),
   getJson<Payer[]>("/api/billing-accounts"),
  ]);
  if(!stillCurrent())return;
  setWorkplaces(context.workplaces);
  setStudents(studentsData.data??[]);setGroups(groupsData.data??[]);
  setPayers(payersData.filter(p=>p.status==="active"));
  const preferred=initialWorkplaceId&&context.workplaces.some(w=>w.id===initialWorkplaceId)?
   initialWorkplaceId:workplaceId&&context.workplaces.some(w=>w.id===workplaceId)?
   workplaceId:context.workplaces[0]?.id??"";
  if(preferred!==workplaceId)clearExact();
  setWorkplaceId(preferred);
  setLoadedContext(initialWorkplaceId);
 }
 async function refreshAgreements(id:string){
  if(!id){setAgreements([]);return;}
  setAgreements(await getJson<Agreement[]>("/api/compensation-agreements?"+
   new URLSearchParams({workplaceId:id,includeArchived:"true"})));
 }
 useEffect(()=>{
  let cancelled=false;
  void load(()=>!cancelled).catch(e=>{if(!cancelled)setError(errorText(e,t("loadFailed")));});
  return ()=>{cancelled=true;};
 // The component intentionally re-reads global selection on server refresh.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[initialWorkplaceId]);
 useEffect(()=>{
  let cancelled=false;
  void refreshAgreements(workplaceId).catch(e=>{if(!cancelled)setError(errorText(e,t("loadFailed")));});
  return ()=>{cancelled=true;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[workplaceId]);
 const workplace=workplaces.find(w=>w.id===workplaceId);
 async function create(event:FormEvent){
  event.preventDefault();
  if(busy||uncertain)return;
  setBusy(true);setError("");setPreview(null);
  try{
   if(!workplace)throw new Error(t("selectWorkplace"));
   if(scope==="exact"&&(!exactChoice||!readyExact))throw new Error(t("exactChoose"));
   const approved={workplaceId,agreementRole:role,model,rateCents:rate,
    currency:workplace.currency,effectiveFrom:scope==="exact"?exactDay:start,effectiveTo:scope==="exact"?exactDay:end||null,
    studentId:scope==="student"?scopedId:null,
    groupId:scope==="group"?scopedId:null,
    ...(scope==="exact"?{exactSessionId:scopedId}:{}),
    billingAccountId:payerId};
   if(scope!=="workplace"&&!scopedId)throw new Error(t("chooseScope"));
   if(!payerId)throw new Error(t("chooseCounterparty"));
   if(scope==="exact"&&exactChoice&&!window.confirm(t("exactConfirm",{
    title:exactChoice.title,date:exactDay,reference:exactChoice.id.slice(0,8),
    time:new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:exactChoice.timezone}).format(new Date(exactChoice.startsAt)),
   })))return;
   const premise=JSON.stringify(approved);
   if(!writeKey.current||writeKey.current.premise!==premise)
    writeKey.current={premise,id:crypto.randomUUID()};
   const body={...approved,idempotencyKey:writeKey.current.id,confirmed:true};
   if(scope==="exact"){
    exactAttempt.current={workplaceId,body};
    await sendExact();return;
   }
   await getJson("/api/compensation-agreements",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
   writeKey.current=null;
   await refreshAgreements(workplaceId);
  }catch(e){setError(errorText(e,t("saveFailed")));}
  finally{setBusy(false);}
 }
 async function archive(agreement:Agreement){
  if(!window.confirm(t("archiveConfirm")))return;
  setBusy(true);setError("");
  try{
   await getJson("/api/compensation-agreements/"+agreement.id,{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({id:agreement.id,expectedRevision:agreement.revision,
     changes:{status:"archived"},idempotencyKey:crypto.randomUUID(),confirmed:true}),
   });
   await refreshAgreements(workplaceId);
  }catch(e){setError(errorText(e,t("saveFailed")));}
  finally{setBusy(false);}
 }
 async function showPreview(agreement:Agreement){
  setBusy(true);setError("");setPreview(null);
  try{
   const q=new URLSearchParams({from:previewFrom,to:previewTo});
   setPreview(await getJson<Preview>(`/api/compensation-agreements/${agreement.id}/preview?${q}`));
  }catch(e){
   const code=(e as {code?:string}|null)?.code;
   setError(code==="GROUP_AGREEMENT_REVIEW_REQUIRED"?t("groupPreviewOverlap"):errorText(e,t("previewFailed")));
  }
  finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-label={t("title")}>
  <div className="space-y-1">
   <h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("intro")}</p>
  </div>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  <form onSubmit={create}>
   <fieldset disabled={busy||uncertain} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label className="text-xs">{t("workplace")}
    <select aria-label={t("workplace")} className={field} value={workplaceId} onChange={e=>{setWorkplaceId(e.target.value);clearExact();}} required>
     <option value="">{t("selectWorkplace")}</option>
     {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>
   <label className="text-xs">{t("role")}
    <select className={field} value={role} onChange={e=>{setRole(e.target.value as Agreement["agreementRole"]);if(scope==="exact"&&e.target.value!=="coach_earning"){setScope("workplace");clearExact();}setPreview(null);}}>
     <option value="coach_earning">{t("coachEarning")}</option>
     <option value="participant_charge">{t("participantCharge")}</option>
    </select>
   </label>
   <label className="text-xs">{t("model")}
    <select className={field} value={model} onChange={e=>setModel(e.target.value as Agreement["model"])}>
     <option value="hourly">{t("hourly")}</option>
     <option value="per_session">{t("perSession")}</option>
     <option value="per_student">{t("perStudent")}</option>
     <option value="fixed_period">{t("fixedMonthly")}</option>
    </select>
   </label>
   <label className="text-xs">{t("rateMinorUnits")}
    <input className={field} type="number" min={0} max={1000000000} step={1}
      value={rate} onChange={e=>setRate(Number(e.target.value))} required/>
   </label>
   <label className="text-xs">{t("scope")}
    <select aria-label={t("scope")} className={field} value={scope} onChange={e=>{setScope(e.target.value);clearExact();}}>
     <option value="workplace">{t("allInWorkplace")}</option>
     <option value="student">{t("oneStudent")}</option>
     <option value="group">{t("oneGroup")}</option>
     {role==="coach_earning"&&model!=="fixed_period"&&<option value="exact">{t("exactScope")}</option>}
    </select>
   </label>
   {(scope==="student"||scope==="group")&&<label className="text-xs">{t("specificScope")}
    <select className={field} value={scopedId} onChange={e=>setScopedId(e.target.value)} required>
     <option value="">{t("chooseScope")}</option>
     {(scope==="student"?students:groups.filter(g=>g.workplace_id===workplaceId))
       .map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </label>}
   {scope==="exact"&&<>
    <label className="text-xs">{t("exactDay")}
     <input required className={field} type="date" value={exactDay} onChange={event=>{
      const value=event.target.value;setExactDay(value);clearExact();setExactState(value?"loading":"idle");
     }}/>
    </label>
    <label className="text-xs">{t("exactScope")}
     <select aria-label={t("exactScope")} required className={field} disabled={!readyExact} value={readyExact?scopedId:""} onChange={event=>setScopedId(event.target.value)}>
      <option value="">{t("exactChoose")}</option>
      {visibleExactChoices.map(lesson=><option key={lesson.id} value={lesson.id}>
       {lesson.title} · {new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:lesson.timezone}).format(new Date(lesson.startsAt))} · {lesson.id.slice(0,8)}
      </option>)}
     </select>
    </label>
    <p className="text-xs text-muted" role="status">{exactDay&&!readyExact&&exactState!=="error"?t("exactLoading"):
      readyExact&&!visibleExactChoices.length?t("exactEmpty"):""}</p>
    {exactState==="error"&&<p className="text-xs text-error" role="alert">{t("exactUnavailable")}</p>}
   </>}
   <label className="text-xs">{t("counterparty")}
    <select aria-label={t("payer")} className={field} value={payerId} onChange={e=>setPayerId(e.target.value)} required>
     <option value="">{t("chooseCounterparty")}</option>
     {payers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select>
   </label>
   {scope!=="exact"&&<><label className="text-xs">{t("validFrom")}
    <input className={field} type="date" value={start} onChange={e=>setStart(e.target.value)} required/>
   </label>
   <label className="text-xs">{t("validTo")}
    <input className={field} type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/>
   </label></>}
   <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
    disabled={busy||!workplaceId||(scope==="exact"&&!exactChoice)}>{busy?t("saving"):t("addAgreement")}</button>
   </fieldset>
  </form>
  {uncertain&&<div role="status" className="text-sm">
   <p>{t(superseded?"supersededReview":"pendingReview")}</p>
   <button type="button" className="text-primary underline" disabled={busy} onClick={()=>void sendExact()}>{t("retryExact")}</button>
  </div>}
  <div className="flex flex-wrap items-end gap-3 text-xs">
   <label>{t("previewFrom")}
    <input className={field} type="date" value={previewFrom} onChange={e=>setPreviewFrom(e.target.value)}/>
   </label>
   <label>{t("previewTo")}
    <input className={field} type="date" value={previewTo} min={previewFrom}
      onChange={e=>setPreviewTo(e.target.value)}/>
   </label>
  </div>
  {agreements.length===0?<p className="text-sm text-muted">{t("noAgreements")}</p>:
   <ul className="divide-y divide-border rounded-lg border border-border">{
    agreements.map(a=><li className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm" key={a.id}>
     <div>
      <p className="font-medium">{t(a.agreementRole==="coach_earning"?"coachEarning":"participantCharge")}
       {" · "}{t(a.model==="hourly"?"hourly":a.model==="per_session"?"perSession":a.model==="per_student"?"perStudent":"fixedMonthly")}
       {" · "}<span dir="ltr">{a.rateCents} {a.currency}</span></p>
      <p className="text-xs text-muted">{a.effectiveFrom}{a.effectiveTo?" – "+a.effectiveTo:""}
       {" · "}{t(a.status==="active"?"active":"archived")}
       {a.exactSessionId?" · "+t("exactScope")+" · "+a.exactSessionId.slice(0,8):a.studentId?" · "+t("oneStudent"):a.groupId?" · "+t("oneGroup"):""}</p>
     </div>
     <div className="flex gap-3">
      {a.status==="active"&&<><button className="text-primary underline" disabled={busy}
       onClick={()=>void showPreview(a)}>{t("preview")}</button>
       <button className="text-muted underline" disabled={busy||uncertain}
       onClick={()=>void archive(a)}>{t("archive")}</button></>}
     </div>
    </li>)
   }</ul>}
  {preview&&<div className="rounded-lg border border-border p-4" aria-live="polite">
   <p className="font-semibold">{t("expected",{count:preview.projection.expectedCents,currency:preview.projection.currency})}</p>
   <p className="text-sm text-muted">{t("sessions",{count:preview.projection.eligibleSessionCount})}
    {" · "}{t("minutes",{count:preview.projection.eligibleInstructorMinutes})}
    {" · "}{t("people",{count:preview.projection.eligibleParticipantCount})}</p>
   {preview.excludedExactSessionCount>0&&<p className="text-xs text-muted">{t("exactExcluded",{count:preview.excludedExactSessionCount})}</p>}
   {preview.excludedGroupSessionCount>0&&<p className="text-xs text-muted">{t("groupExcluded",{count:preview.excludedGroupSessionCount})}</p>}
   <p className="text-xs text-muted">{t("previewNotice")}</p>
  </div>}
  <PrivateSeriesCompensationPanel workplaceId={loadedContext===initialWorkplaceId?workplaceId:""}/>
  <ExactSponsorPanel workplaceId={loadedContext===initialWorkplaceId?workplaceId:""}
   onSaved={()=>void refreshAgreements(workplaceId).catch(()=>setError(t("loadFailed")))}/>
 </section>;
}
