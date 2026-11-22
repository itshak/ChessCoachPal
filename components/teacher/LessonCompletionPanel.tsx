"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";

type Session={id:string;title:string;status:string;starts_at:string};
type Person={studentId:string;name:string};
type Roster={sessionId:string;title:string;status:string;updatedAt:string;
 participants:Person[];studentIds:string[]};
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
export function LessonCompletionPanel({workplaceId=null}:{workplaceId?:string|null}={}){
 const t=useTranslations("lessonCompletion"),locale=useLocale();
  const toUserError=useLocalizedApiError();
 const statusName=(status:string)=>status==="scheduled"?t("scheduled"):status==="completed"?t("completed"):status==="cancelled"?t("cancelled"):status;
 const [sessions,setSessions]=useState<Session[]>([]);
 const [sessionId,setSessionId]=useState("");
 const [roster,setRoster]=useState<Roster|null>(null);
 const [decisions,setDecisions]=useState<Record<string,Decision>>({});
 const [lessonNote,setLessonNote]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 // A slow roster read must never replace the learner decisions for a newer
 // selected session. The transaction also verifies all revisions in SQL.
 const rosterLoad=useRef(0);

 const refresh=useCallback(async(id:string)=>{
  const generation=++rosterLoad.current;
  if(!id){setRoster(null);setDecisions({});return;}
  let details:Roster,register:Register[];
  try{
   [details,register]=await Promise.all([
    fetch("/api/coaching/sessions/"+encodeURIComponent(id)+"/roster",{cache:"no-store"}).then(async response=>{
     if(!response.ok)throw new Error(t("rosterReadFailed"));
     return response.json() as Promise<Roster>;
    }),
    api<Register[]>("attendance.list",{sessionId:id},t("loadFailed")),
   ]);
  }catch(e){
   // A superseded request must never blank a newer selected lesson.
   if(generation===rosterLoad.current){
    setRoster(null);setError(toUserError(e, t("rosterLoadFailed")));
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
 },[t,toUserError]);
 const refreshSessions=useCallback(async()=>{
  const items=await api<Session[]>("sessions.list",{workplaceId},t("loadFailed"));
  setSessions(items);
  setSessionId(old=>old&&items.some(s=>s.id===old)?old:items[0]?.id??"");
 },[t,workplaceId]);
 useEffect(()=>{
  void refreshSessions().catch(e=>setError(String(e)));
 },[refreshSessions]);
 useEffect(()=>{
  void refresh(sessionId);
 },[sessionId,refresh]);

 function change(studentId:string,patch:Partial<Decision>){
  setDecisions(old=>({...old,[studentId]:{...old[studentId],...patch}}));
  setConfirmed(false);
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
   await refresh(roster.sessionId);
  }catch(e){setError(toUserError(e, t("attendanceFailed")));}
  finally{setBusy(false);}
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  await commit(true);
 }

 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-5 space-y-4">
  <header>
   <h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("description")}</p>
  </header>
  {error&&<p role="alert" className="text-error">{error}</p>}
  {notice&&<p role="status" className="text-success">{notice}</p>}
  <button type="button" disabled={busy} className="text-sm underline"
   onClick={()=>void refreshSessions().catch(e=>setError(String(e)))}>
   {t("refresh")}
  </button>
  <button type="button" disabled={!sessionId||busy} className="text-sm underline"
   onClick={()=>void refresh(sessionId)}>
   {t("reloadRoster")}
  </button>
  <label className="block">{t("lesson")}
   <select className={select} aria-label={t("lessonToComplete")} value={sessionId}
     onChange={e=>{rosterLoad.current++;setRoster(null);setDecisions({});
      setSessionId(e.target.value);setLessonNote("");setConfirmed(false);
      setNotice("");setError("");}}>
    {!sessions.length&&<option value="">{t("noSessions")}</option>}
    {sessions.map(s=><option value={s.id} key={s.id}>
     {s.title} · {new Date(s.starts_at).toLocaleDateString(locale)} · {statusName(s.status)}
    </option>)}
   </select>
  </label>
  {roster&&<form onSubmit={submit} data-session-id={roster.sessionId} className="space-y-3">
   <p className="text-sm font-medium">{t("frozenRoster",{count:roster.participants.length,status:statusName(roster.status)})}</p>
   {roster.participants.map(person=>{
    const decision=decisions[person.studentId];
    return <div key={person.studentId} className="grid min-w-0 grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
     <label><bdi dir="auto">{person.name}</bdi>: {t("attendance")}
      <select className={select} aria-label={t("attendanceFor",{name:person.name})} data-student-id={person.studentId}
       value={decision?.status??""} required onChange={e=>change(person.studentId,{
         status:e.target.value as Decision["status"],
       })}>
       <option value="">{t("chooseAttendance")}</option>
       {statuses.map(key=><option key={key} value={key}>{t(key)}</option>)}
      </select>
     </label>
     <label>{t("attendanceNote")}
      <input className={select} maxLength={5000} value={decision?.note??""}
       onChange={e=>change(person.studentId,{note:e.target.value})}/>
     </label>
    </div>;
   })}
   <label className="block">{t("sharedNote")}
    <textarea className={select} maxLength={10000} rows={2} value={lessonNote}
     onChange={e=>{setLessonNote(e.target.value);setConfirmed(false);}}/>
   </label>
   <label className="flex gap-2 items-center">
    <input type="checkbox" checked={confirmed}
     onChange={e=>setConfirmed(e.target.checked)}/>
    {t("approval")}
   </label>
   <button type="submit" disabled={busy||!confirmed||roster.sessionId!==sessionId||!roster.participants.length||
      roster.participants.some(p=>!decisions[p.studentId]?.status)}
    className="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50">
     {busy?t("recording"):t("complete")}
   </button>
   <button type="button" disabled={busy||!confirmed||roster.sessionId!==sessionId||
      roster.participants.some(p=>!decisions[p.studentId]?.status)}
    onClick={()=>void commit(false)}
    className="rounded-lg border border-border px-4 py-2 font-semibold disabled:opacity-50">
     {t("saveAttendance")}
   </button>
  </form>}
 </section>;
}
