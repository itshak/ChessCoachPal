"use client";

import {formatLocalizedInstantDate} from "@/i18n/date-time";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import type { DailyCombinedCommitInput } from "@/lib/server/daily-lesson-combined";

type Session={id:string;title:string;status:string;starts_at:string;sessionTimeZone:string};
type Person={studentId:string;name:string};
type Roster={sessionId:string;title:string;status:string;updatedAt:string;
 participants:Person[];studentIds:string[]};
class ExactReviewError extends Error {}
class CombinedResponseError extends Error {
 constructor(readonly status:number,readonly code:string){super(code)}
}
type MaterialOption={id:string;title:string};
type CombinedReview={material:MaterialOption;proposed:Omit<DailyCombinedCommitInput,"requestId"|"confirmed">};
async function combinedRequest<T>(action:"preview"|"commit",payload:object):Promise<T>{
 const result=await fetch("/api/coaching/lesson-completion",{method:"POST",cache:"no-store",
  headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
 const body=await result.json();
 if(!result.ok)throw new CombinedResponseError(result.status,typeof body?.code==="string"?body.code:"DATABASE_ERROR");
 return body as T;
}
type Pin={sessionId:string;workplaceId:string|null};
type Register={student_id:string;status:string;note:string;updated_at:string|null};
type Decision={studentId:string;status:""|"present"|"absent"|"late"|"excused";
 note:string;expectedUpdatedAt:string|null};
const select="w-full min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground";
const statuses=["present","absent","late","excused"] as const;

async function api<T>(action:string,args:Record<string,unknown>={},fallback="Unable to load lesson"):Promise<T>{
 const res=await fetch("/api/agent/v1",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action,...args}),cache:"no-store",
 });
 const value=await res.json() as {ok?:boolean;data?:T;error?:{message?:string;code:string}};
 if(!res.ok||!value.ok)
   throw new Error(value.error?.message??value.error?.code??fallback);
 return value.data as T;
}

/** A completion records the WHOLE immutable roster in one SQL transaction.
 * No unmarked learner is silently treated as present, and a completed
 * lesson never implies material mastery or homework completion.
 */
export function LessonCompletionPanel({workplaceId=null,pinned}:{workplaceId?:string|null;pinned?:Pin}={}){
 const t=useTranslations("lessonCompletion"),locale=useLocale();
  const toUserError=useLocalizedApiError();
 const statusName=(status:string)=>status==="scheduled"?t("scheduled"):status==="completed"?t("completed"):status==="cancelled"?t("cancelled"):status;
 const [sessions,setSessions]=useState<Session[]>([]);
 const [sessionId,setSessionId]=useState(pinned?.sessionId??"");
 const [roster,setRoster]=useState<Roster|null>(null);
 const [decisions,setDecisions]=useState<Record<string,Decision>>({});
 const [lessonNote,setLessonNote]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [withMaterial,setWithMaterial]=useState(false);
 const [materialQuery,setMaterialQuery]=useState("");
 const [materialChoices,setMaterialChoices]=useState<{materials:MaterialOption[];total:number}|null>(null);
 const [materialId,setMaterialId]=useState("");
 const [taught,setTaught]=useState<string[]>([]);
 const [review,setReview]=useState<CombinedReview|null>(null);
 const [combinedKey,setCombinedKey]=useState<string|null>(null);
 const clearApproval=useCallback(()=>{setConfirmed(false);setReview(null);setCombinedKey(null);},[]);

 // A slow roster read must never replace the learner decisions for a newer
 // selected session. The transaction also verifies all revisions in SQL.
 const rosterLoad=useRef(0);

 const readExact=useCallback(async(id:string)=>{
  if(!pinned||id!==pinned.sessionId)throw new ExactReviewError(t("exactUnavailable"));
  const res=await fetch("/api/coaching/sessions/"+encodeURIComponent(id)+"/roster?dailyWorkplaceId="+
    encodeURIComponent(pinned.workplaceId??"all"),{cache:"no-store"});
  const value=await res.json() as Roster & {attendance:Register[];code?:string};
  if(!res.ok){
    switch(value.code){
      case "STALE_WORKPLACE_CONTEXT":throw new ExactReviewError(t("exactWorkplaceChanged"));
      case "LESSON_NOT_ENDED":throw new ExactReviewError(t("exactNotEnded"));
      case "LESSON_CANCELLATION_REVIEW_REQUIRED":throw new ExactReviewError(t("exactCancellationReview"));
      case "LESSON_ROSTER_UNAVAILABLE":throw new ExactReviewError(t("exactRosterUnavailable"));
      default:throw new ExactReviewError(t("exactUnavailable"));
    }
  }
  if(value.sessionId!==id)throw new ExactReviewError(t("exactUnavailable"));
  return value;
 },[pinned,t]);

 const refresh=useCallback(async(id:string)=>{
  const generation=++rosterLoad.current;
  clearApproval();setTaught([]);
  if(!id){setRoster(null);setDecisions({});return;}
  let details:Roster,register:Register[];
  try{
   if(pinned){
    details=await readExact(id);
    register=(details as Roster & {attendance:Register[]}).attendance;
   }else [details,register]=await Promise.all([
    fetch("/api/coaching/sessions/"+encodeURIComponent(id)+"/roster",{cache:"no-store"}).then(async response=>{
     if(!response.ok)throw new Error(t("rosterReadFailed"));
     return response.json() as Promise<Roster>;
    }),
    api<Register[]>("attendance.list",{sessionId:id},t("loadFailed")),
   ]);
  }catch(e){
   // A superseded request must never blank a newer selected lesson.
   if(generation===rosterLoad.current){
    setRoster(null);setError(e instanceof ExactReviewError?e.message:toUserError(e, t("rosterLoadFailed")));
   }
   return;
  }
  if(generation!==rosterLoad.current)return;
  setError("");
  const current=new Map(register.map(x=>[x.student_id,x]));
  setRoster(details);
  setDecisions(Object.fromEntries(details.participants.map(p=>{
    const r=current.get(p.studentId);
    return [p.studentId,{
     studentId:p.studentId,
     status:(r?.status==="present"||r?.status==="absent"||
      r?.status==="late"||r?.status==="excused"?r.status:"") as Decision["status"],
     note:r?.note??"",
     expectedUpdatedAt:r?.updated_at??null,
    }];
  })));
  setConfirmed(false);
 },[pinned,readExact,t,toUserError,clearApproval]);
 const refreshSessions=useCallback(async()=>{
  const items=await api<Session[]>("sessions.list",{workplaceId},t("loadFailed"));
  setSessions(items);
  setSessionId(old=>old&&items.some(s=>s.id===old)?old:items[0]?.id??"");
 },[t,workplaceId]);
 useEffect(()=>{
  if(!pinned)void refreshSessions().catch(e=>setError(String(e)));
 },[pinned,refreshSessions]);
 useEffect(()=>{
  void refresh(sessionId);
 },[sessionId,refresh]);

 function change(studentId:string,patch:Partial<Decision>){
  setDecisions(old=>({...old,[studentId]:{...old[studentId],...patch}}));
  if(patch.status==="absent"||patch.status==="excused"||patch.status==="")
   setTaught(old=>old.filter(id=>id!==studentId));
  clearApproval();
 }

 async function searchMaterial(){
  if(busy)return;
  setBusy(true);setError("");setMaterialChoices(null);setMaterialId("");clearApproval();
  try{
   const query=new URLSearchParams({limit:"16",...(materialQuery.trim()?{query:materialQuery.trim()}:{})});
   const response=await fetch("/api/training/materials?"+query,{cache:"no-store"});
   if(!response.ok)throw new Error("MATERIAL_SEARCH");
   const data=await response.json() as {materials:MaterialOption[];total:number};
   setMaterialChoices({materials:data.materials.map(({id,title})=>({id,title})),total:data.total});
  }catch{setError(t("combinedMaterialLoadFailed"));}finally{setBusy(false);}
 }

 async function reviewCombined(){
  if(!pinned||!withMaterial||!roster||busy||!materialId||!taught.length)return;
  const attendance=roster.participants.map(p=>decisions[p.studentId]);
  if(attendance.some(d=>!d?.status)){setError(t("attendanceRequired"));return;}
  setBusy(true);setError("");clearApproval();
  try{
   const result=await combinedRequest<CombinedReview>("preview",{
    sessionId:roster.sessionId,dailyWorkplaceId:pinned.workplaceId,expectedUpdatedAt:roster.updatedAt,
    materialId,taughtStudentIds:taught,attendance,...(lessonNote.trim()?{lessonNote}:{}),
   });
   setReview(result);setCombinedKey(crypto.randomUUID());
  }catch(e){
   setError(e instanceof CombinedResponseError&&e.status===409?t("combinedChanged"):t("combinedPreviewFailed"));
  }finally{setBusy(false);}
 }

 async function saveCombined(){
  if(!withMaterial||!review||!combinedKey||!confirmed||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   await combinedRequest("commit",{...review.proposed,requestId:combinedKey,confirmed:true});
   setNotice(t("combinedSaved"));setRoster(null);setLessonNote("");setTaught([]);clearApproval();
  }catch(e){
   // Unknown connection/result keeps the identical reviewed payload and key
   // for replay. A typed refusal requires a separate review.
   if(e instanceof CombinedResponseError&&[400,401,404,409].includes(e.status)){
    clearApproval();
    setError(t("combinedChanged"));
   }else setError(t("combinedRetrySame"));
  }finally{setBusy(false);}
 }

 async function commit(complete:boolean){
  if(!roster||roster.sessionId!==sessionId||busy||!confirmed)return;
  if(roster.participants.some(p=>!decisions[p.studentId]?.status)){
   setError(t("attendanceRequired"));return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const attendance=roster.participants.map(p=>{
    const d=decisions[p.studentId];
    return {studentId:p.studentId,status:d.status,note:d.note,
      expectedUpdatedAt:d.expectedUpdatedAt};
   });
   if(pinned){
    const current=await readExact(roster.sessionId);
    if(current.updatedAt!==roster.updatedAt||current.participants.length!==attendance.length||
       current.attendance.some(row=>!attendance.some(d=>d.studentId===row.student_id&&d.expectedUpdatedAt===row.updated_at))){
     setRoster(null);setConfirmed(false);
     setError(t("exactChanged"));return;
    }
   }
   if(complete){
    await api("sessions.complete",{
     sessionId:roster.sessionId,expectedUpdatedAt:roster.updatedAt,
     idempotencyKey:crypto.randomUUID(),attendance,
     ...(lessonNote.trim()?{lessonNote}:{}),confirmed:true,
    },t("completionFailed"));
    setSessions(old=>old.map(x=>x.id===roster.sessionId?{...x,status:"completed"}:x));
   }else{
    await api("attendance.bulkRecord",{
     sessionId:roster.sessionId,idempotencyKey:crypto.randomUUID(),attendance,
    },t("attendanceFailed"));
   }
   setNotice(complete?t("committed"):t("attendanceSaved"));
   setConfirmed(false);
   if(complete)setLessonNote("");
   if(pinned&&complete)setRoster(null);
   else await refresh(roster.sessionId);
  }catch(e){if(pinned){setRoster(null);setConfirmed(false);}
   setError(e instanceof ExactReviewError?e.message:toUserError(e, t("attendanceFailed")));}
  finally{setBusy(false);}
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(withMaterial)await saveCombined();
  else await commit(true);
 }

 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-5 space-y-4">
  <header>
   <h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("description")}</p>
  </header>
  {error&&<p role="alert" className="text-error">{error}</p>}
  {notice&&<p role="status" className="text-success">{notice}</p>}
  {!pinned&&<button type="button" disabled={busy} className="text-sm underline"
   onClick={()=>void refreshSessions().catch(e=>setError(String(e)))}>
   {t("refresh")}
  </button>}
  <button type="button" disabled={!sessionId||busy} className="text-sm underline"
   onClick={()=>void refresh(sessionId)}>
   {t("reloadRoster")}
  </button>
  {pinned? <p>{t("exactMode")}{roster&&<>{" "}<bdi dir="auto">{roster.title}</bdi></>}</p>: <label className="block">{t("lesson")}
   <select className={select} aria-label={t("lessonToComplete")} value={sessionId}
     onChange={e=>{rosterLoad.current++;setRoster(null);setDecisions({});
      setSessionId(e.target.value);setLessonNote("");setConfirmed(false);
      setNotice("");setError("");}}>
    {!sessions.length&&<option value="">{t("noSessions")}</option>}
    {sessions.map(s=><option value={s.id} key={s.id}>
     {s.title} · {formatLocalizedInstantDate(s.starts_at,locale,s.sessionTimeZone)} · {statusName(s.status)}
    </option>)}
   </select>
  </label>}
  {roster&&<form onSubmit={submit} data-session-id={roster.sessionId} className="space-y-3">
   <p className="text-sm font-medium">{t("frozenRoster",{count:roster.participants.length,status:statusName(roster.status)})}</p>
   {roster.participants.map(person=>{
    const decision=decisions[person.studentId];
    return <div key={person.studentId} data-roster-student-id={person.studentId} className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
     <label><bdi dir="auto">{person.name}</bdi>: {t("attendance")}
      <select className={select} aria-label={t("attendanceFor",{name:person.name})} data-student-id={person.studentId}
       disabled={Boolean(pinned)&&busy} value={decision?.status??""} required onChange={e=>change(person.studentId,{
         status:e.target.value as Decision["status"],
       })}>
       <option value="">{t("chooseAttendance")}</option>
       {statuses.map(key=><option key={key} value={key}>{t(key)}</option>)}
      </select>
     </label>
     <label>{t("attendanceNote")}
      <input className={select} maxLength={5000} disabled={Boolean(pinned)&&busy} value={decision?.note??""}
       onChange={e=>change(person.studentId,{note:e.target.value})}/>
     </label>
    </div>;
   })}
   <label className="block">{t("sharedNote")}
    <textarea className={select} maxLength={10000} rows={2} disabled={Boolean(pinned)&&busy} value={lessonNote}
     onChange={e=>{setLessonNote(e.target.value);clearApproval();}}/>
   </label>
   {pinned&&<fieldset className="rounded-lg border border-border p-3 space-y-3" disabled={busy}>
    <legend className="font-medium">{t("combinedHeading")}</legend>
    <label className="flex gap-2 items-center">
     <input type="checkbox" checked={withMaterial} onChange={e=>{setWithMaterial(e.target.checked);clearApproval();}}/>
     {t("combinedUseMaterial")}
    </label>
    {withMaterial&&<>
     <label className="block">{t("combinedSearchLabel")}
      <input className={select} maxLength={120} value={materialQuery}
       onChange={e=>setMaterialQuery(e.target.value)}
       onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();void searchMaterial();}}}/>
     </label>
     <button type="button" className="underline" onClick={()=>void searchMaterial()}>{t("combinedSearch")}</button>
     {materialChoices&&<>
      {!materialChoices.materials.length?<p role="status">{t("combinedNoMaterial")}</p>:
       <label className="block">{t("combinedMaterial")}
        <select className={select} value={materialId} onChange={e=>{setMaterialId(e.target.value);clearApproval();}}>
         <option value="">{t("combinedChooseMaterial")}</option>
         {materialChoices.materials.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
       </label>}
      {materialChoices.total>materialChoices.materials.length&&<p>{t("combinedRefine")}</p>}
     </>}
     <fieldset className="space-y-2">
      <legend>{t("combinedTaughtLearners")}</legend>
      {roster.participants.map(p=><label className="flex gap-2 items-center" key={p.studentId}>
       <input type="checkbox" checked={taught.includes(p.studentId)}
        disabled={!["present","late"].includes(decisions[p.studentId]?.status??"")}
        onChange={e=>{setTaught(old=>e.target.checked?[...old,p.studentId]:old.filter(id=>id!==p.studentId));clearApproval();}}/>
       <bdi dir="auto">{p.name}</bdi>
      </label>)}
     </fieldset>
     <button type="button" className="underline" disabled={!materialId||!taught.length||
       roster.participants.some(p=>!decisions[p.studentId]?.status)} onClick={()=>void reviewCombined()}>
      {t("combinedReview")}
     </button>
     {review&&<div role="status" className="rounded border border-border p-3">
      <p>{t("combinedReviewReady",{date:review.proposed.occurredOn,count:review.proposed.taughtStudentIds.length})}
       {" "}<bdi dir="auto">{review.material.title}</bdi></p>
     </div>}
    </>}
   </fieldset>}
   <label className="flex gap-2 items-center">
    <input type="checkbox" disabled={Boolean(pinned)&&busy||(withMaterial&&!review)} checked={confirmed}
     onChange={e=>setConfirmed(e.target.checked)}/>
    {t(withMaterial?"combinedApproval":"approval")}
   </label>
   <button type="submit" disabled={busy||!confirmed||withMaterial&&!review||roster.sessionId!==sessionId||!roster.participants.length||
      roster.participants.some(p=>!decisions[p.studentId]?.status)}
    className="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50">
     {busy?t("recording"):t(withMaterial?"combinedComplete":"complete")}
   </button>
   {!pinned&&<button type="button" disabled={busy||!confirmed||roster.sessionId!==sessionId||
      roster.participants.some(p=>!decisions[p.studentId]?.status)}
    onClick={()=>void commit(false)}
    className="rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50">
     {t("saveAttendance")}
   </button>}
  </form>}
 </section>;
}
