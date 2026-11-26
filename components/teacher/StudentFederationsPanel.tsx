"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {useTranslations,useLocale} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import type {FideEvidenceExport} from "@/lib/server/student-federations-service";

type Membership={id:string;studentId:string;federationCode:string;playerId:string;
 membershipStatus:"unverified"|"source_matched";revision:number;
 sourceUrl:string|null;verifiedAt:string|null};
type Snapshot={id:string;provider:"fide"|"icf";time_control:string;
 rating:number;observed_at:string;effective_at:string|null;
 verification_state:"unverified"|"provider_published";source_url:string|null;
 external_player_id:string|null;provider_list_version:string|null};
type FideEvidence={timeControl:"standard"|"rapid"|"blitz"} & (
 {status:"recorded";snapshot:Snapshot}|
 {status:"not_linked"|"not_recorded"|"edition_order_unknown"|"evidence_incomplete";snapshot:null});
type EffectiveEvidence={throughDate:string;basis:"stored_editions_for_current_link";fide:FideEvidence[]};
type Overview={identity:{fideId:string|null;fideFederationCode:string|null;
 nationalFederationPreference:string|null;defaultNationalFederationCode:string|null;
 suggestedFederationCode:string|null};memberships:Membership[];snapshots:Snapshot[];
 currentEvidence:{fide:FideEvidence[]};fideEffectiveEvidence?:EffectiveEvidence;fideEvidenceExport?:FideEvidenceExport;retrieval:{fide:"not_automated";icf:"manual_only"};
 sourceWarning:string};
const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const code=(value:string)=>value.trim().toUpperCase();
const optionalCode=(value:string)=>code(value)||null;
const today=()=>new Date().toISOString().slice(0,10);
export function StudentFederationsPanel({studentId}:{studentId:string}){
 return <StudentFederationsScope key={studentId} studentId={studentId}/>;
}
function StudentFederationsScope({studentId}:{studentId:string}){
 const t=useTranslations("federationRatings"),locale=useLocale();
 const [loaded,setOverview]=useState<(Overview & {studentId:string})|null>(null);
 const overview=loaded?.studentId===studentId?loaded:null;
 const readGeneration=useRef(0);
 const identityPending=useRef(false),mounted=useRef(false);
 const [readFailed,setReadFailed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [fideId,setFideId]=useState(""),[fideCode,setFideCode]=useState("");
 const [national,setNational]=useState(""),[defaultCode,setDefaultCode]=useState("");
 const [membershipCode,setMembershipCode]=useState(""),[playerId,setPlayerId]=useState("");
 const [editingId,setEditingId]=useState(""),[editingPlayerId,setEditingPlayerId]=useState("");
 const [provider,setProvider]=useState<"fide"|"icf">("fide");
 const [control,setControl]=useState("standard"),[rating,setRating]=useState("");
 const [observedAt,setObservedAt]=useState(today()),[effectiveAt,setEffectiveAt]=useState("");
 const [sourceUrl,setSourceUrl]=useState("");
 const [fideOn,setFideOn]=useState("");
 const [historical,setHistorical]=useState<{linkedId:string;evidence:EffectiveEvidence;file:FideEvidenceExport}|null>(null);
 const load=useCallback(async(expectedIdentity?:{fideId:string|null})=>{
  if(!mounted.current||(identityPending.current&&!expectedIdentity))return;
  const generation=++readGeneration.current;
  const response=await fetch(`/api/students/${studentId}/federations`,{cache:"no-store"});
  if(!mounted.current||generation!==readGeneration.current)return;
  if(!response.ok)throw new Error("FEDERATION_READ");
  const result=await response.json() as Overview & {studentId:string};
  if(!mounted.current||generation!==readGeneration.current)return;
  if(result.studentId!==studentId||(expectedIdentity&&result.identity.fideId!==expectedIdentity.fideId))
   throw new Error("FEDERATION_READ");
  setReadFailed(false);setOverview(result);
  setFideId(result.identity.fideId??"");setFideCode(result.identity.fideFederationCode??"");
  setNational(result.identity.nationalFederationPreference??"");
  setDefaultCode(result.identity.defaultNationalFederationCode??"");
 },[studentId]);
 useEffect(()=>{
  mounted.current=true;
  void load().catch(()=>{if(mounted.current)setReadFailed(true);});
  return ()=>{mounted.current=false;readGeneration.current++;};
 },[load]);
 async function post(url:string,method:"PUT"|"POST"|"PATCH",body:unknown,expectedIdentity?:{fideId:string|null}){
  const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},
   body:JSON.stringify(body)});
  if(!mounted.current)return;
  if(!response.ok){const payload=await response.json().catch(()=>null);
   throw new Error(payload?.error??t("saveError"));}
  await load(expectedIdentity);
 }
 async function run(fn:()=>Promise<void>){
  setBusy(true);setError("");setReadFailed(false);
  try{await fn();}catch(e){if(mounted.current){
   if(e instanceof Error&&e.message==="FEDERATION_READ")setReadFailed(true);
   else setError(e instanceof Error?e.message:t("saveError"));
  }}finally{if(mounted.current)setBusy(false);}
 }
 const studentUrl=`/api/students/${studentId}`;
 const selectedControl=provider==="icf"?"national":control;
 async function updateIdentity(e:FormEvent){
  e.preventDefault();await run(async()=>{
   const nextId=fideId.trim()||null;
   identityPending.current=true;readGeneration.current++;
   setHistorical(null);
   setOverview(null);
   try{
    await post(studentUrl,"PUT",{
     fideId:nextId,fideFederationCode:optionalCode(fideCode),
     nationalFederationPreference:national==="NONE"?"NONE":optionalCode(national),
    },{fideId:nextId});
   }finally{identityPending.current=false;}
  });
 }
 async function reviewEffective(e:FormEvent){
  e.preventDefault();
  const linkedId=overview?.identity.fideId,requested=fideOn;
  if(!linkedId||!requested||identityPending.current)return;
  const generation=readGeneration.current;
  await run(async()=>{
   setHistorical(null);
   const response=await fetch(`${studentUrl}/federations?`+new URLSearchParams({fideOn:requested}),{cache:"no-store"});
   if(!mounted.current||generation!==readGeneration.current)return;
   if(!response.ok)throw new Error("FEDERATION_READ");
   const result=await response.json() as Overview&{studentId:string};
   if(!mounted.current||generation!==readGeneration.current)return;
   if(result.studentId!==studentId||result.identity.fideId!==linkedId||
    result.fideEffectiveEvidence?.throughDate!==requested||
    result.fideEffectiveEvidence.basis!=="stored_editions_for_current_link"||
    result.fideEvidenceExport?.throughDate!==requested||
    result.fideEvidenceExport.format!=="chesscoachpal_fide_effective_evidence_v1")throw new Error("FEDERATION_READ");
   setHistorical({linkedId,evidence:result.fideEffectiveEvidence,file:result.fideEvidenceExport});
  });
 }
 function downloadReview(file:FideEvidenceExport){
  const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)+"\n"],{type:"application/json"}));
  try{
   const anchor=document.createElement("a");
   anchor.href=url;anchor.download=`chesscoachpal-fide-evidence-${file.throughDate}.json`;
   anchor.click();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 async function updateDefault(e:FormEvent){
  e.preventDefault();await run(async()=>{
   await post("/api/teacher/federation-default","PUT",{
    defaultNationalFederationCode:optionalCode(defaultCode),
    expectedDefaultNationalFederationCode:overview?.identity.defaultNationalFederationCode??null,
    confirmed:true,
   });
  });
 }
 async function addMembership(e:FormEvent){
  e.preventDefault();await run(async()=>{
   await post(`${studentUrl}/federations`,"POST",{
    studentId,federationCode:code(membershipCode),playerId:playerId.trim(),
    idempotencyKey:crypto.randomUUID(),confirmed:true,
   });
   setPlayerId("");
  });
 }
 async function updateMembership(e:FormEvent){
  e.preventDefault();await run(async()=>{
   const membership=overview?.memberships.find(x=>x.id===editingId);
   if(!membership)throw new Error(t("readError"));
   await post(`${studentUrl}/federations/${editingId}`,"PATCH",{
    studentId,membershipId:editingId,playerId:editingPlayerId.trim(),
    expectedRevision:membership.revision,idempotencyKey:crypto.randomUUID(),confirmed:true,
   });
   setEditingId("");
  });
 }
 async function addRating(e:FormEvent){
  e.preventDefault();await run(async()=>{
   await post(`${studentUrl}/federation-ratings`,"POST",{
    studentId,provider,timeControl:provider==="icf"?"national":control,
    rating:Number(rating),observedAt:new Date(`${observedAt}T12:00:00.000Z`).toISOString(),
    effectiveAt:effectiveAt||null,sourceUrl:sourceUrl.trim()||null,
    requestId:crypto.randomUUID(),confirmed:true,
   });
   setRating("");setSourceUrl("");
  });
 }
 return <Card padding="sm" className="mb-6">
   <div className="mb-4 space-y-1">
    <h2 className="font-semibold">{t("title")}</h2>
    <p className="text-sm text-muted">{t("warning")}</p>
   </div>
   {(error||readFailed)&&<p role="alert" className="mb-3 text-sm text-error">{error||t("readError")}</p>}
   <form onSubmit={updateIdentity} className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
    <label className="text-sm">{t("fideId")}
     <input data-testid="fide-id-input" className={field} value={fideId} inputMode="numeric"
      pattern="[0-9]{5,12}" maxLength={12} onChange={e=>setFideId(e.target.value)}/>
    </label>
    <label className="text-sm">{t("fideFederation")}
     <input className={field} value={fideCode} maxLength={3} placeholder={t("codeExample")}
      pattern="[a-zA-Z]{3}" onChange={e=>setFideCode(code(e.target.value))}/>
    </label>
    <div className="text-sm">
     <label>{t("nationalPreference")}
      <input className={field} value={national==="NONE"?"":national}
       disabled={national==="NONE"} maxLength={3} pattern="[A-Z]{3}"
       placeholder={t("codeExample")}
       onChange={e=>setNational(code(e.target.value))}/>
     </label>
     <label className="mt-1 flex gap-2 text-xs text-muted">
      <input type="checkbox" checked={national==="NONE"}
       onChange={e=>setNational(e.target.checked?"NONE":"")}/>
      {t("explicitNone")}
     </label>
     <p className="text-xs text-muted">{t("useTeacherDefault")}</p>
    </div>
    <div className="flex items-end"><Button type="submit" disabled={busy}>{t("saveIdentity")}</Button></div>
   </form>
   <form onSubmit={updateDefault} className="mb-5 flex flex-wrap items-end gap-3 border-t border-border pt-4">
    <label className="text-sm">{t("teacherDefault")}
     <input data-testid="teacher-federation-default" className={field} value={defaultCode}
      maxLength={3} pattern="[A-Z]{3}" placeholder={t("codeExample")}
      onChange={e=>setDefaultCode(code(e.target.value))}/>
    </label>
    <Button type="submit" disabled={busy}>{t("saveDefault")}</Button>
    <p className="basis-full text-xs text-muted">{t("defaultDisclaimer",{
     code:overview?.identity.suggestedFederationCode??t("notConfigured"),
    })}</p>
   </form>
   <section className="mb-5 border-t border-border pt-4">
    <h3 className="mb-2 text-sm font-semibold">{t("memberships")}</h3>
    {overview?.memberships.length===0&&<p className="text-xs text-muted">{t("noneRecorded")}</p>}
    <ul className="mb-3 space-y-2">{overview?.memberships.map(member=><li key={member.id}
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
     <span><strong>{member.federationCode}</strong> · {member.playerId} · {t(member.membershipStatus)}</span>
     {editingId===member.id?<form onSubmit={updateMembership} className="flex items-end gap-2">
      <label className="text-xs">{t("playerId")}
       <input className={field} maxLength={64} required value={editingPlayerId}
        onChange={e=>setEditingPlayerId(e.target.value)}/>
      </label>
      <Button type="submit" disabled={busy}>{t("save")}</Button>
     </form>:<button type="button" className="text-primary underline" disabled={busy}
       onClick={()=>{setEditingId(member.id);setEditingPlayerId(member.playerId);}}>
       {t("edit")}</button>}
    </li>)}</ul>
    <form onSubmit={addMembership} className="flex flex-wrap items-end gap-2">
     <label className="text-xs">{t("federationCode")}
      <input className={field} maxLength={3} pattern="[A-Z]{3}" required
       value={membershipCode} onChange={e=>setMembershipCode(code(e.target.value))}/>
     </label>
     <label className="text-xs">{t("playerId")}
      <input className={field} maxLength={64} required value={playerId}
       onChange={e=>setPlayerId(e.target.value)}/>
     </label>
     <Button type="submit" disabled={busy}>{t("addUnverifiedMembership")}</Button>
    </form>
   </section>
   <section className="border-t border-border pt-4">
    <h3 className="mb-2 text-sm font-semibold">{t("manualRatings")}</h3>
    <form onSubmit={addRating} className="mb-4 grid grid-cols-1 items-end gap-3 md:grid-cols-3">
     <label className="text-xs">{t("provider")}
      <select className={field} value={provider} onChange={e=>{
       const value=e.target.value as "fide"|"icf";setProvider(value);
       setControl(value==="icf"?"national":"standard");}}>
       <option value="fide">{t("fide")}</option><option value="icf">{t("icf")}</option>
      </select>
     </label>
     <label className="text-xs">{t("category")}
      <select className={field} value={selectedControl}
       onChange={e=>setControl(e.target.value)} disabled={provider==="icf"}>
       {(provider==="icf"?["national"]:["standard","rapid","blitz"]).map(c=>
        <option key={c} value={c}>{t(c as "standard"|"rapid"|"blitz"|"national")}</option>)}
      </select>
     </label>
     <label className="text-xs">{t("rating")}
      <input className={field} type="number" min={100} max={4000} required value={rating}
       onChange={e=>setRating(e.target.value)}/>
     </label>
     <label className="text-xs">{t("observedOn")}
      <input className={field} type="date" max={today()} required value={observedAt}
       onChange={e=>setObservedAt(e.target.value)}/>
     </label>
     <label className="text-xs">{t("effectiveOn")}
      <input className={field} type="date" max={today()} value={effectiveAt}
       onChange={e=>setEffectiveAt(e.target.value)}/>
     </label>
     <label className="text-xs">{t("referenceUrl")}
      <input className={field} type="url" maxLength={600} placeholder={t("sourcePlaceholder")}
       value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/>
     </label>
     <div className="md:col-span-3"><Button type="submit" disabled={busy}>{t("recordUnverified")}</Button></div>
    </form>
    {overview&&<div className="space-y-2" data-testid="federation-rating-evidence">
     <h3 className="text-sm font-semibold">{t("currentEvidence")}</h3>
     {overview.identity.fideId&&<p>{t("evidencePlayerId",{id:overview.identity.fideId})}</p>}
     <p>{t(overview.retrieval.fide)}</p>
     <p>{t(overview.retrieval.icf)}</p>
     <ul className="space-y-1" aria-label={t("currentEvidence")}>
      {overview.currentEvidence.fide.map(({timeControl,status,snapshot})=><li key={timeControl}>
       {t(timeControl)}: {snapshot? <><strong>{snapshot.rating}</strong> · {t("provider_published")}
        {" · "}<time dateTime={snapshot.effective_at??undefined}>{snapshot.effective_at}</time>
        {" · "}{snapshot.provider_list_version}</>:t(status)}
      </li>)}
     </ul>
    </div>}
    {overview?.identity.fideId&&<div className="space-y-2 rounded-lg border border-border p-3">
     <h3 className="text-sm font-semibold">{t("effectiveReview.heading")}</h3>
     <p>{t("effectiveReview.explanation")}</p>
     <form onSubmit={reviewEffective} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-xs">{t("effectiveReview.date")}
       <input className={field} type="date" min="1900-01-01" max={today()} required value={fideOn}
        onChange={e=>{setFideOn(e.target.value);setHistorical(null);}} disabled={busy}/>
      </label>
      <Button type="submit" disabled={busy}>{t("effectiveReview.open")}</Button>
     </form>
     {historical?.linkedId===overview.identity.fideId&&
      <div role="region" aria-label={t("effectiveReview.result")} className="space-y-1" aria-live="polite">
       <p>{t("effectiveReview.through")} <time dateTime={historical.evidence.throughDate}><bdi>{historical.evidence.throughDate}</bdi></time></p>
       <ul className="space-y-1">
        {historical.evidence.fide.map(({timeControl,status,snapshot})=><li key={timeControl}>
         {t(timeControl)}: {snapshot? <><strong>{snapshot.rating}</strong> · {t("provider_published")}
          {" · "}<time dateTime={snapshot.effective_at??undefined}><bdi>{snapshot.effective_at}</bdi></time>
          {" · "}<bdi>{snapshot.provider_list_version}</bdi></>:t(status)}
        </li>)}
       </ul>
       <Button type="button" variant="secondary" disabled={busy} onClick={()=>downloadReview(historical.file)}>
        {t("effectiveReview.download")}
       </Button>
       <p className="text-sm text-muted">{t("effectiveReview.downloadNote")}</p>
      </div>}
    </div>}
    <h3 className="text-sm font-semibold">{t("evidenceHistory")}</h3>
    <ul className="space-y-2" aria-label={t("evidenceHistory")}>
     {overview?.snapshots.map(row=><li key={row.id} className="rounded-lg border border-border p-2 text-xs">
      <span className="font-semibold uppercase">{row.provider} · {t(row.time_control as "standard"|"rapid"|"blitz"|"national")}</span>
      {" · "}<strong>{row.rating}</strong>
      {" · "}<time dateTime={row.observed_at}>{new Date(row.observed_at).toLocaleDateString(locale)}</time>
      {" · "}{t(row.verification_state)}
      {row.external_player_id&&<> · {t("evidencePlayerId",{id:row.external_player_id})}</>}
      {row.provider_list_version&&<> · {row.provider_list_version}</>}
      {row.effective_at&&<> · <time dateTime={row.effective_at}>{row.effective_at}</time></>}
      {row.source_url&&<> · <a href={row.source_url} rel="noopener noreferrer" target="_blank"
       className="text-primary underline">{t("referenceUrl")}</a></>}
     </li>)}
    </ul>
   </section>
 </Card>;
}
