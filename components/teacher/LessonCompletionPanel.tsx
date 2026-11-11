"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";

type Session={id:string;title:string;status:string;starts_at:string};
type Person={studentId:string;name:string};
type Roster={sessionId:string;title:string;status:string;updatedAt:string;
 participants:Person[];studentIds:string[]};
type Register={student_id:string;status:string;note:string;updated_at:string};
type Decision={studentId:string;status:""|"present"|"absent"|"late"|"excused";
 note:string;expectedUpdatedAt:string};
const select="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground";
const statuses=[["present","Present"],["absent","Absent"],["late","Late"],["excused","Excused"]] as const;

async function api<T>(action:string,args:Record<string,unknown>={}):Promise<T>{
 const res=await fetch("/api/agent/v1",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action,...args}),cache:"no-store",
 });
 const value=await res.json() as {ok?:boolean;data?:T;error?:{message?:string;code:string}};
 if(!res.ok||!value.ok)
   throw new Error(value.error?.message??value.error?.code??"Unable to load lesson");
 return value.data as T;
}

/** A completion records the WHOLE immutable roster in one SQL transaction.
 * No unmarked learner is silently treated as present, and a completed
 * lesson never implies material mastery or homework completion.
 */
export function LessonCompletionPanel(){
 const [sessions,setSessions]=useState<Session[]>([]);
 const [sessionId,setSessionId]=useState("");
 const [roster,setRoster]=useState<Roster|null>(null);
 const [decisions,setDecisions]=useState<Record<string,Decision>>({});
 const [lessonNote,setLessonNote]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");

 const refresh=useCallback(async(id:string)=>{
  if(!id){setRoster(null);setDecisions({});return;}
  const [details,register]=await Promise.all([
   fetch("/api/coaching/sessions/"+encodeURIComponent(id)+"/roster",{cache:"no-store"}).then(async response=>{
    if(!response.ok)throw new Error("Cannot read the lesson's frozen roster");
    return response.json() as Promise<Roster>;
   }),
   api<Register[]>("attendance.list",{sessionId:id}),
  ]);
  const current=new Map(register.map(x=>[x.student_id,x]));
  setRoster(details);
  setDecisions(Object.fromEntries(details.participants.map(p=>{
    const r=current.get(p.studentId);
    return [p.studentId,{
     studentId:p.studentId,
     status:(r?.status==="present"||r?.status==="absent"||
      r?.status==="late"||r?.status==="excused"?r.status:"") as Decision["status"],
     note:r?.note??"",
     expectedUpdatedAt:r?.updated_at??"",
    }];
  })));
  setConfirmed(false);
 },[]);
 useEffect(()=>{
  let mounted=true;
  void api<Session[]>("sessions.list").then(items=>{
    if(!mounted)return;
    setSessions(items);
    setSessionId(old=>old&&items.some(s=>s.id===old)?old:items[0]?.id??"");
  }).catch(e=>{if(mounted)setError(String(e));});
  return ()=>{mounted=false;};
 },[]);
 useEffect(()=>{
  let mounted=true;
  void refresh(sessionId).catch(e=>{if(mounted){setRoster(null);setError(String(e));}});
  return ()=>{mounted=false;};
 },[sessionId,refresh]);

 function change(studentId:string,patch:Partial<Decision>){
  setDecisions(old=>({...old,[studentId]:{...old[studentId],...patch}}));
  setConfirmed(false);
 }

 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!roster||busy||!confirmed)return;
  if(roster.participants.some(p=>!decisions[p.studentId]?.status||
     !decisions[p.studentId]?.expectedUpdatedAt)){
   setError("Choose an explicit attendance status for each learner.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const attendance=roster.participants.map(p=>{
    const d=decisions[p.studentId];
    return {studentId:p.studentId,status:d.status,note:d.note,
      expectedUpdatedAt:d.expectedUpdatedAt};
   });
   await api("sessions.complete",{
    sessionId:roster.sessionId,expectedUpdatedAt:roster.updatedAt,
    idempotencyKey:crypto.randomUUID(),attendance,lessonNote,confirmed:true,
   });
   setNotice("Lesson and full frozen-roster attendance committed atomically.");
   setConfirmed(false);
   await refresh(roster.sessionId);
   setSessions(old=>old.map(x=>x.id===roster.sessionId?{...x,status:"completed"}:x));
  }catch(e){setError(e instanceof Error?e.message:"Unable to complete lesson");}
  finally{setBusy(false);}
 }

 return <section aria-label="Complete coaching lesson" className="rounded-xl border border-border bg-surface p-5 space-y-4">
  <header>
   <h2 className="text-lg font-semibold">Complete a coaching lesson</h2>
   <p className="text-sm text-muted">Record every learner's actual attendance, then complete the lesson as one confirmed transaction. Attendance is not a skill grade or evidence that material was taught.</p>
  </header>
  {error&&<p role="alert" className="text-error">{error}</p>}
  {notice&&<p role="status" className="text-success">{notice}</p>}
  <label className="block">Lesson
   <select className={select} aria-label="Lesson to complete" value={sessionId}
     onChange={e=>{setSessionId(e.target.value);setNotice("");setError("");}}>
    {!sessions.length&&<option value="">No coaching sessions</option>}
    {sessions.map(s=><option value={s.id} key={s.id}>
     {s.title} · {new Date(s.starts_at).toLocaleDateString()} · {s.status}
    </option>)}
   </select>
  </label>
  {roster&&<form onSubmit={submit} className="space-y-3">
   <p className="text-sm font-medium">{roster.participants.length} frozen learner(s) · {roster.status}</p>
   {roster.participants.map(person=>{
    const decision=decisions[person.studentId];
    return <div key={person.studentId} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
     <label>{person.name}: attendance
      <select className={select} aria-label={"Attendance for "+person.name}
       value={decision?.status??""} required onChange={e=>change(person.studentId,{
         status:e.target.value as Decision["status"],
       })}>
       <option value="">Select actual attendance</option>
       {statuses.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
     </label>
     <label>Attendance note (optional)
      <input className={select} maxLength={5000} value={decision?.note??""}
       onChange={e=>change(person.studentId,{note:e.target.value})}/>
     </label>
    </div>;
   })}
   <label className="block">Shared coaching lesson note (optional)
    <textarea className={select} maxLength={10000} rows={2} value={lessonNote}
     onChange={e=>{setLessonNote(e.target.value);setConfirmed(false);}}/>
   </label>
   <label className="flex gap-2 items-center">
    <input type="checkbox" checked={confirmed}
     onChange={e=>setConfirmed(e.target.checked)}/>
    I confirm these attendance statuses and lesson completion.
   </label>
   <button type="submit" disabled={busy||!confirmed||!roster.participants.length||
      roster.participants.some(p=>!decisions[p.studentId]?.status)}
    className="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50">
     {busy?"Recording…":"Complete lesson"}
   </button>
  </form>}
 </section>;
}
