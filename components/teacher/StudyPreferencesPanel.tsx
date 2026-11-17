"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";

type Scope="teacher"|"workplace"|"student";
type Purpose="lesson"|"puzzle";
type Workplace={id:string;name:string;timezone:string};
type Student={id:string;name:string};
type Existing={study_id:string;revision:number};
type Context={teacherId:string;workplaces:Workplace[]};
const field="w-full min-w-0 max-w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";

/**
 * Plain HTTPS /api and delegated MCP share the same owner-scoped SQL receipt.
 * No Lichess OAuth token, PGN contents, attendance or mastery is exposed.
 */
export function StudyPreferencesPanel(){
 const t=useTranslations("studyPreferences");
  const toUserError=useLocalizedApiError();
 const [context,setContext]=useState<Context|null>(null);
 const [students,setStudents]=useState<Student[]>([]);
 const [purpose,setPurpose]=useState<Purpose>("lesson");
 const [scope,setScope]=useState<Scope>("teacher");
 const [scopeId,setScopeId]=useState("");
 const [studyId,setStudyId]=useState("");
 const [revision,setRevision]=useState(0);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [effective,setEffective]=useState("");
 const requestRef=useRef<{signature:string;requestId:string}|null>(null);
 useEffect(()=>{
  let active=true;
  void Promise.all([
   fetch("/api/teacher/context",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error(t("contextUnavailable")))),
   fetch("/api/students?limit=100&offset=0",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error(t("studentsUnavailable")))),
  ]).then(([ctx,roster]:[Context,{students:Student[];nextOffset:number|null}])=>{
    if(!active)return;
    setContext(ctx);setScopeId(ctx.teacherId);
    setStudents(roster.students??[]);
    if(roster.nextOffset!==null)setNotice(t("firstHundred"));
   }).catch(e=>{if(active)setError(toUserError(e, t("loadError")));});
  return()=>{active=false;};
 },[t,toUserError]);
 const selectedId=scope==="teacher"?context?.teacherId??"":scopeId;
 useEffect(()=>{
  if(!selectedId)return;
  let active=true;
  setLoading(true);setError("");setEffective("");requestRef.current=null;
  const query=new URLSearchParams({action:"list",purpose,scope,
   scopeId:selectedId,limit:"1"});
  void fetch("/api/lichess/study-preferences?"+query,{cache:"no-store"})
   .then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error??t("lookupFailed"));return result;})
   .then((result:{preferences:Existing[]})=>{
    if(!active)return;
    const current=result.preferences[0];
    setStudyId(current?.study_id??"");setRevision(current?.revision??0);
   }).catch(e=>{if(active)setError(toUserError(e, t("unavailable")));})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[purpose,scope,selectedId,t,toUserError]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selectedId||busy)return;
  const payload={purpose,scope,scopeId:selectedId,studyId:studyId.trim()||null,
   expectedRevision:revision,confirmed:true};
  const signature=JSON.stringify(payload);
  if(requestRef.current?.signature!==signature)
    requestRef.current={signature,requestId:crypto.randomUUID()};
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/lichess/study-preferences",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"set",...payload,
     requestId:requestRef.current.requestId}),cache:"no-store",
   });
   const result=await response.json() as {error?:string;revision?:number;
    replayed?:boolean;studyId?:string|null};
   if(!response.ok)throw Error(result.error??t("updateDenied"));
   setRevision(result.revision??0);setStudyId(result.studyId??"");
   requestRef.current=null;
   setEffective("");
   setNotice(result.studyId?
    t("saved"):
    t("cleared"));
  }catch(x){setError(toUserError(x, t("writeUnavailable")));}
  finally{setBusy(false);}
 }
 async function resolve(){
  setError("");setEffective("");
  try{
   const query=new URLSearchParams({action:"resolve",purpose,
    ...(scope==="workplace"?{workplaceId:selectedId}:{}),
    ...(scope==="student"?{studentId:selectedId}:{})});
   const response=await fetch("/api/lichess/study-preferences?"+query,{cache:"no-store"});
   const data=await response.json() as {error?:string;studyId?:string|null;
    selectedScope?:string|null;needsSync?:boolean};
   if(!response.ok)throw Error(toUserError(data, t("resolutionUnavailable")));
   setEffective(data.studyId?
    t("effective",{studyId:data.studyId,scope:data.selectedScope==="teacher"?t("teacher"):data.selectedScope==="workplace"?t("workplace"):data.selectedScope==="student"?t("student"):data.selectedScope??"",state:data.needsSync?t("needsSync"):t("indexed")}):
    t("noEffective"));
  }catch(e){setError(toUserError(e, t("resolutionFailed")));}
 }
 return <section aria-label={t("aria")} className="space-y-3 rounded-xl border border-border bg-surface p-5">
  <h2 className="font-semibold text-lg">{t("title")}</h2>
  <p className="text-sm text-muted-foreground">{t("description")}</p>
  <form onSubmit={e=>void submit(e)} className="grid gap-3 md:grid-cols-2">
   <label className="text-sm">{t("purpose")}
    <select className={field} value={purpose} onChange={e=>setPurpose(e.target.value as Purpose)}>
     <option value="lesson">{t("lessonStudy")}</option><option value="puzzle">{t("puzzleStudy")}</option>
    </select>
   </label>
   <label className="text-sm">{t("scope")}
    <select className={field} value={scope} onChange={e=>{const val=e.target.value as Scope;
     setScope(val);setScopeId(val==="teacher"?context?.teacherId??"":"");}}>
     <option value="teacher">{t("teacherDefault")}</option><option value="workplace">{t("workplaceDefault")}</option>
     <option value="student">{t("studentOverride")}</option>
    </select>
   </label>
   {scope==="workplace"&&<label className="text-sm">{t("workplace")}
    <select className={field} required value={scopeId} onChange={e=>setScopeId(e.target.value)}>
     <option value="">{t("selectWorkplace")}</option>
     {(context?.workplaces??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>}
   {scope==="student"&&<label className="text-sm">{t("student")}
    <select className={field} required value={scopeId} onChange={e=>setScopeId(e.target.value)}>
     <option value="">{t("selectStudent")}</option>
     {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>}
   <label className="text-sm">{t("studyId")}
    <input className={field} value={studyId} maxLength={8} pattern="[A-Za-z0-9]{8}"
     placeholder={t("studyExample")}
     onChange={e=>{setStudyId(e.target.value);requestRef.current=null;}} />
   </label>
   <div className="flex items-end flex-wrap gap-2">
    <button className={button} disabled={busy||loading||!selectedId} type="submit">
     {studyId.trim()?t("savePreference"):t("clearOverride")}
    </button>
    <button className={button} type="button" disabled={busy||!selectedId}
     onClick={()=>void resolve()}>{t("showEffective")}</button>
   </div>
  </form>
  <p className="text-xs text-muted-foreground">{t("revisionNotice",{revision})}</p>
  {loading&&<p role="status">{t("loading")}</p>}
  {effective&&<p role="status">{effective}</p>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="text-red-500">{error}</p>}
 </section>;
}
