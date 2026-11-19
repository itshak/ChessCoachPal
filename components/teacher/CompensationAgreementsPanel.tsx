"use client";
import {useEffect,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

type Workplace={id:string;name:string;currency:string;timezone:string};
type Student={id:string;name:string};
type Group={id:string;name:string;workplace_id:string};
type Payer={id:string;displayName:string;status:string};
type Agreement={id:string;workplaceId:string;studentId:string|null;groupId:string|null;
 billingAccountId:string;agreementRole:"coach_earning"|"participant_charge";
 model:"hourly"|"per_session"|"per_student"|"fixed_period";
 rateCents:number;currency:string;effectiveFrom:string;effectiveTo:string|null;
 status:"active"|"archived";revision:number};
type Preview={agreement:Agreement;projection:{expectedCents:number;currency:string;
 eligibleInstructorMinutes:number;eligibleSessionCount:number;eligibleParticipantCount:number};
 persistedObligation:false;paymentRecorded:false};
const field="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
async function getJson<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{cache:"no-store",...init});
 const value=await res.json().catch(()=>null);
 if(!res.ok)throw Object.assign(new Error(typeof value?.error==="string"?value.error:"Request failed"),
  {code:value?.code});
 return value as T;
}
export function CompensationAgreementsPanel({initialWorkplaceId}:{initialWorkplaceId?:string|null}){
 const t=useTranslations("compensation"),locale=useLocale(),errorText=useLocalizedApiError();
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [workplaceId,setWorkplaceId]=useState(initialWorkplaceId??"");
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
 async function load(){
  const [context,studentsData,groupsData,payersData]=await Promise.all([
   getJson<{workplaces:Workplace[]}>("/api/teacher/workplace-context"),
   getJson<{data:Student[];ok:boolean}>("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"students.search",query:""})}),
   getJson<{data:Group[];ok:boolean}>("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"groups.list"})}),
   getJson<Payer[]>("/api/billing-accounts"),
  ]);
  setWorkplaces(context.workplaces);
  setStudents(studentsData.data??[]);setGroups(groupsData.data??[]);
  setPayers(payersData.filter(p=>p.status==="active"));
  const preferred=initialWorkplaceId&&context.workplaces.some(w=>w.id===initialWorkplaceId)?
   initialWorkplaceId:workplaceId&&context.workplaces.some(w=>w.id===workplaceId)?
   workplaceId:context.workplaces[0]?.id??"";
  setWorkplaceId(preferred);
 }
 async function refreshAgreements(id:string){
  if(!id){setAgreements([]);return;}
  setAgreements(await getJson<Agreement[]>("/api/compensation-agreements?"+
   new URLSearchParams({workplaceId:id,includeArchived:"true"})));
 }
 useEffect(()=>{
  let cancelled=false;
  void load().catch(e=>{if(!cancelled)setError(errorText(e,t("loadFailed")));});
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
  event.preventDefault();setBusy(true);setError("");setPreview(null);
  try{
   if(!workplace)throw new Error(t("selectWorkplace"));
   const body={workplaceId,agreementRole:role,model,rateCents:rate,
    currency:workplace.currency,effectiveFrom:start,effectiveTo:end||null,
    studentId:scope==="student"?scopedId:null,
    groupId:scope==="group"?scopedId:null,
    billingAccountId:payerId,
    idempotencyKey:crypto.randomUUID(),confirmed:true};
   if(scope!=="workplace"&&!scopedId)throw new Error(t("chooseScope"));
   if(!payerId)throw new Error(t("chooseCounterparty"));
   await getJson("/api/compensation-agreements",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
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
  }catch(e){setError(errorText(e,t("previewFailed")));}
  finally{setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border border-border bg-surface p-5" aria-label={t("title")}>
  <div className="space-y-1">
   <h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("intro")}</p>
  </div>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label className="text-xs">{t("workplace")}
    <select className={field} value={workplaceId} onChange={e=>{setWorkplaceId(e.target.value);setPreview(null);setScopedId("");}} required>
     <option value="">{t("selectWorkplace")}</option>
     {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>
   <label className="text-xs">{t("role")}
    <select className={field} value={role} onChange={e=>{setRole(e.target.value as Agreement["agreementRole"]);setPreview(null);}}>
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
    <select className={field} value={scope} onChange={e=>{setScope(e.target.value);setScopedId("");}}>
     <option value="workplace">{t("allInWorkplace")}</option>
     <option value="student">{t("oneStudent")}</option>
     <option value="group">{t("oneGroup")}</option>
    </select>
   </label>
   {scope!=="workplace"&&<label className="text-xs">{t("specificScope")}
    <select className={field} value={scopedId} onChange={e=>setScopedId(e.target.value)} required>
     <option value="">{t("chooseScope")}</option>
     {(scope==="student"?students:groups.filter(g=>g.workplace_id===workplaceId))
       .map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select>
   </label>}
   <label className="text-xs">{t("counterparty")}
    <select className={field} value={payerId} onChange={e=>setPayerId(e.target.value)} required>
     <option value="">{t("chooseCounterparty")}</option>
     {payers.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select>
   </label>
   <label className="text-xs">{t("validFrom")}
    <input className={field} type="date" value={start} onChange={e=>setStart(e.target.value)} required/>
   </label>
   <label className="text-xs">{t("validTo")}
    <input className={field} type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/>
   </label>
   <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
    disabled={busy||!workplaceId}>{busy?t("saving"):t("addAgreement")}</button>
  </form>
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
       {a.studentId?" · "+t("oneStudent"):a.groupId?" · "+t("oneGroup"):""}</p>
     </div>
     <div className="flex gap-3">
      {a.status==="active"&&<><button className="text-primary underline" disabled={busy}
       onClick={()=>void showPreview(a)}>{t("preview")}</button>
       <button className="text-muted underline" disabled={busy}
       onClick={()=>void archive(a)}>{t("archive")}</button></>}
     </div>
    </li>)
   }</ul>}
  {preview&&<div className="rounded-lg border border-border p-4" aria-live="polite">
   <p className="font-semibold">{t("expected",{count:preview.projection.expectedCents,currency:preview.projection.currency})}</p>
   <p className="text-sm text-muted">{t("sessions",{count:preview.projection.eligibleSessionCount})}
    {" · "}{t("minutes",{count:preview.projection.eligibleInstructorMinutes})}
    {" · "}{t("people",{count:preview.projection.eligibleParticipantCount})}</p>
   <p className="text-xs text-muted">{t("previewNotice")}</p>
  </div>}
 </section>;
}
