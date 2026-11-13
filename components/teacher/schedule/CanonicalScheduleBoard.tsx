"use client";

import {useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useToast} from "@/components/ui/toast";
import type {CanonicalCalendarRow} from "@/lib/server/canonical-calendar-read";
import {addDays,toLocalDateString,formatLessonDate,formatLessonTime,zonedTimeToUtc} from "@/lib/schedule";

type Student={id:string;name:string};
type Workplace={id:string;name:string};
type Event={id:string;title:string;startsAt:string;localDate:string};
type AttendanceRow={
 studentId:string;status:string;note:string;noticeAt:string|null;
 cancelReason:string;updatedAt:string|null;
};
type NoteRow={
 id:string;student_id:string|null;body:string;private_body?:string;
 shared_with_guardian:boolean;updated_at:string;emailed_at:string|null;
};
type Decision="present"|"late"|"absent"|"excused"|"student_cancelled"|"teacher_cancelled";
const DECISIONS:Record<Decision,string>={
 present:"Present",late:"Arrived late",absent:"Absent / no-show",
 excused:"Excused",student_cancelled:"Student cancelled",
 teacher_cancelled:"Teacher cancelled",
};
const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
function errText(e:unknown){return e instanceof Error?e.message:"Action could not be saved"}
async function jsonResponse(res:Response){
 const data=await res.json().catch(()=>null);
 if(!res.ok)throw new Error(data&&typeof data.error==="string"?data.error:
  "Request failed ("+res.status+")");
 return data;
}

/** Current-schema week board: every actual teaching card is a canonical
 * teaching_sessions UUID. Attendance and notes always address a frozen
 * participant, and all writes use the exact website/MCP domain operations.
 */
export function CanonicalScheduleBoard({
 weekStart,today,timezone,sessions,events,students,workplaces,durationOptions,
}:{
 weekStart:string;today:string;timezone:string;
 sessions:CanonicalCalendarRow[];events:Event[];
 students:Student[];workplaces:Workplace[];durationOptions:number[];
}){
 const router=useRouter(),{showToast}=useToast();
 const [open,setOpen]=useState<CanonicalCalendarRow|null>(null);
 const [tab,setTab]=useState<"attendance"|"notes"|"schedule">("attendance");
 const [moveDate,setMoveDate]=useState(today);
 const [moveTime,setMoveTime]=useState("16:00");
 const [moveDuration,setMoveDuration]=useState(60);
 const [bulkDecision,setBulkDecision]=useState<"present"|"absent"|"teacher_cancelled">("present");
 const [register,setRegister]=useState<AttendanceRow[]>([]);
 const [notes,setNotes]=useState<NoteRow[]>([]);
 const [selectedStudent,setSelectedStudent]=useState("");
 const [draftStatus,setDraftStatus]=useState<Decision|null>(null);
 const [attendanceNote,setAttendanceNote]=useState("");
 const [cancelReason,setCancelReason]=useState("");
 const [noticeAt,setNoticeAt]=useState("");
 const [notifyFamily,setNotifyFamily]=useState(false);
 const [body,setBody]=useState("");
 const [privateBody,setPrivateBody]=useState("");
 const [shareWithGuardian,setShareWithGuardian]=useState(false);
 const [emailGuardian,setEmailGuardian]=useState(false);
 const [busy,setBusy]=useState(false);
 const [addOpen,setAddOpen]=useState(false);
 const [addStudent,setAddStudent]=useState("");
 const [addWorkplace,setAddWorkplace]=useState("");
 const [addDate,setAddDate]=useState(today);
 const [addTime,setAddTime]=useState("16:00");
 const [addDuration,setAddDuration]=useState(60);
 const [addHomeVisit,setAddHomeVisit]=useState(false);
 const days=useMemo(()=>Array.from({length:7},(_,i)=>addDays(weekStart,i)),[weekStart]);
 const byDay=useMemo(()=>{
  const daysMap=new Map<string,CanonicalCalendarRow[]>();
  for(const session of sessions){
   const date=toLocalDateString(new Date(session.starts_at),session.local_timezone||timezone);
   const arr=daysMap.get(date)??[];arr.push(session);daysMap.set(date,arr);
  }
  for(const arr of daysMap.values())arr.sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  return daysMap;
 },[sessions,timezone]);

 const chosen=register.find(r=>r.studentId===selectedStudent);
 const chosenNote=notes.find(n=>n.student_id===selectedStudent);
 function loadDecision(studentId:string,rows:AttendanceRow[]){
  const item=rows.find(x=>x.studentId===studentId);
  setSelectedStudent(studentId);
  setDraftStatus(item?.status&&item.status!=="unmarked"?item.status as Decision:null);
  setAttendanceNote(item?.note??"");
  setCancelReason(item?.cancelReason??"");
  setNoticeAt(item?.noticeAt??"");
  setNotifyFamily(false);
 }
 function loadNote(studentId:string,rows:NoteRow[]){
  const item=rows.find(x=>x.student_id===studentId);
  setSelectedStudent(studentId);
  setBody(item?.body??"");
  setPrivateBody(item?.private_body??"");
  setShareWithGuardian(item?.shared_with_guardian??false);
  setEmailGuardian(false);
 }
 async function openSession(session:CanonicalCalendarRow,section:"attendance"|"notes"|"schedule"){
  setBusy(true);
  try{
   const path="/api/coaching/sessions/"+session.id;
   // Private notes are fetched only in response to an explicit teacher
   // click on the notes editor, never in the initial roster/calendar payload.
   const endpoint=section==="notes"?
    path+"/notes?includePrivate=true&confirmed=true":path+"/attendance";
   const rows=section==="schedule"?[]:
    await jsonResponse(await fetch(endpoint,{cache:"no-store"}));
   if(!Array.isArray(rows))throw new Error("Invalid session register");
   setOpen(session);setTab(section);
   if(section==="schedule"){
    const zone=session.local_timezone||timezone;
    setMoveDate(toLocalDateString(new Date(session.starts_at),zone));
    setMoveTime(new Intl.DateTimeFormat("en-GB",{timeZone:zone,
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(session.starts_at)));
    setMoveDuration(session.duration_minutes);
    return;
   }
   const first=session.participants[0]?.studentId??"";
   if(section==="notes"){
    setNotes(rows as NoteRow[]);loadNote(first,rows as NoteRow[]);
   }else{
    setRegister(rows as AttendanceRow[]);loadDecision(first,rows as AttendanceRow[]);
   }
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 async function saveAttendance(){
  if(!open||!selectedStudent)return;
  if(draftStatus==="student_cancelled"&&!noticeAt){
   showToast("Student cancellation needs a notice timestamp","error");return;
  }
  setBusy(true);
  try{
   const result=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/attendance",{
     method:"PUT",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      studentId:selectedStudent,status:draftStatus,
      note:attendanceNote,cancelReason:draftStatus?.endsWith("_cancelled")?cancelReason:"",
      noticeAt:draftStatus==="student_cancelled"?new Date(noticeAt).toISOString():null,
      expectedUpdatedAt:chosen?.updatedAt??null,
      idempotencyKey:crypto.randomUUID(),notifyFamily:draftStatus==="teacher_cancelled"&&notifyFamily,
      confirmed:true,confirmedEmail:draftStatus==="teacher_cancelled"&&notifyFamily,
     }),
    }));
   const fresh=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/attendance",{cache:"no-store"}));
   setRegister(fresh);
   loadDecision(selectedStudent,fresh);
   showToast(result.emailQueued?"Attendance saved; family email queued":"Attendance saved");
   router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 async function saveNotes(){
  if(!open||!selectedStudent)return;
  setBusy(true);
  try{
   const result=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/notes",{
     method:"PUT",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      studentId:selectedStudent,body,privateBody,
      sharedWithGuardian:shareWithGuardian,sendEmail:emailGuardian,
      confirmedEmail:emailGuardian,
      expectedUpdatedAt:chosenNote?.updated_at??null,
      idempotencyKey:crypto.randomUUID(),
     }),
    }));
   const fresh=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/notes?includePrivate=true&confirmed=true",
    {cache:"no-store"}));
   setNotes(fresh);loadNote(selectedStudent,fresh);
   showToast(result.emailQueued?"Notes saved; approved family email queued":"Notes saved");
   router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }

 async function saveSchedule(){
  if(!open)return;
  let startsAt:string;
  try{
   startsAt=zonedTimeToUtc(moveDate,moveTime,open.local_timezone||timezone,"reject").toISOString();
  }catch{showToast("Selected local time does not exist in this timezone","error");return;}
  setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/sessions/"+open.id+"/lifecycle",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({startsAt,durationMinutes:moveDuration,
      expectedUpdatedAt:open.updated_at,idempotencyKey:crypto.randomUUID()}),
   }));
   setOpen(null);showToast("Teaching session rescheduled");router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 async function cancelTeachingSession(){
  if(!open)return;
  if(!window.confirm("Cancel this session for every frozen participant? Attendance and billing evidence will be preserved."))return;
  setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/sessions/"+open.id+"/lifecycle",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({status:"cancelled",
      expectedUpdatedAt:open.updated_at,idempotencyKey:crypto.randomUUID()}),
   }));
   setOpen(null);showToast("Session cancelled, historical evidence retained");router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 async function bulkAttendance(){
  if(!open||!register.length)return;
  if(bulkDecision==="teacher_cancelled"&&notifyFamily&&
    !window.confirm("Queue teacher-approved cancellation emails for each family?"))return;
  setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/sessions/"+open.id+"/attendance",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     idempotencyKey:crypto.randomUUID(),
     attendance:register.map(row=>({
      studentId:row.studentId,status:bulkDecision,note:row.note??"",
      noticeAt:null,cancelReason:bulkDecision==="teacher_cancelled"?cancelReason:"",
      expectedUpdatedAt:row.updatedAt??null,
      notifyFamily:bulkDecision==="teacher_cancelled"&&notifyFamily,
      confirmed:true,confirmedEmail:bulkDecision==="teacher_cancelled"&&notifyFamily,
     })),
    }),
   }));
   const fresh=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/attendance",{cache:"no-store"}));
   setRegister(fresh);loadDecision(selectedStudent,fresh);
   showToast("Attendance updated for the full frozen roster");router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 async function addPrivateSession(){
  if(!addStudent)return showToast("Choose a student","error");
  setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/calendar/private-sessions",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     studentId:addStudent,workplaceId:addWorkplace||null,
     date:addDate,time:addTime,durationMinutes:addDuration,
     isHomeVisit:addHomeVisit,idempotencyKey:crypto.randomUUID(),
    }),
   }));
   setAddOpen(false);showToast("Private teaching session scheduled");
   router.refresh();
  }catch(e){showToast(errText(e),"error")}
  finally{setBusy(false)}
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap gap-3 items-center justify-between">
   <div className="flex gap-3 items-center">
    <Link className="text-primary hover:underline" href={"/schedule?week="+addDays(weekStart,-7)}>Previous</Link>
    <span className="text-sm font-medium">{weekStart} – {addDays(weekStart,6)}</span>
    <Link className="text-primary hover:underline" href={"/schedule?week="+addDays(weekStart,7)}>Next</Link>
    <Link className="text-primary hover:underline" href="/schedule">Today</Link>
   </div>
   <button className="rounded-lg border border-primary px-3 py-2 text-sm text-primary hover:bg-primary/10"
    onClick={()=>setAddOpen(!addOpen)}>+ Private session</button>
  </div>
  {addOpen&&<div className="rounded-xl border border-border bg-surface p-4 space-y-3">
   <h3 className="font-medium">Schedule an individual chess lesson</h3>
   <div className="grid sm:grid-cols-3 gap-3">
    <label className="text-sm">Student
     <select className={field} value={addStudent} onChange={e=>setAddStudent(e.target.value)}>
      <option value="">Choose a student</option>
      {students.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    <label className="text-sm">Workplace
     <select className={field} value={addWorkplace} onChange={e=>setAddWorkplace(e.target.value)}>
      <option value="">Personal coaching</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
    <label className="text-sm">Duration
     <select className={field} value={addDuration} onChange={e=>setAddDuration(Number(e.target.value))}>
      {[...new Set([...durationOptions,30,45,60,90].filter(x=>x>=15&&x<=480))]
       .sort((a,b)=>a-b).map(d=><option key={d} value={d}>{d} minutes</option>)}
     </select>
    </label>
    <label className="text-sm">Date
     <input className={field} type="date" value={addDate} onChange={e=>setAddDate(e.target.value)}/>
    </label>
    <label className="text-sm">Local time
     <input className={field} type="time" value={addTime} onChange={e=>setAddTime(e.target.value)}/>
    </label>
    <label className="text-sm flex gap-2 items-end pb-2">
     <input type="checkbox" checked={addHomeVisit} onChange={e=>setAddHomeVisit(e.target.checked)}/>
     Home visit
    </label>
   </div>
   <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm"
    disabled={busy} onClick={addPrivateSession}>Create session</button>
  </div>}
  <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
   {days.map((date,i)=><div key={date} className={
    "min-h-28 rounded-xl border p-2 "+
     (date===today?"border-primary/60 bg-primary/5":"border-border bg-surface")
   }>
    <div className="text-xs font-semibold mb-3">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][i]} {date.slice(5)}</div>
    {events.filter(e=>e.localDate===date).map(e=><Link key={e.id} href={"/events/"+e.id}
      className="block rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs mb-2">
      <b>Event</b> {e.title}
    </Link>)}
    {(byDay.get(date)??[]).map(session=><div key={session.id}
      className="rounded-lg border border-border bg-background p-2 text-xs mb-2 space-y-1">
      <div className="font-medium">{formatLessonTime(session.starts_at,session.local_timezone||timezone)}</div>
      <div className="text-foreground break-all">{session.participants.map(p=>p.name).join(", ")}</div>
      <div className="text-muted">{session.duration_minutes} min · {session.status}</div>
      <div className="flex gap-2">
       <button disabled={busy} className="text-primary hover:underline"
        onClick={()=>openSession(session,"attendance")}>Attendance</button>
       <button disabled={busy} className="text-primary hover:underline"
        onClick={()=>openSession(session,"notes")}>Notes</button>
       {session.status==="scheduled"&&<button disabled={busy}
        className="text-primary hover:underline"
        onClick={()=>openSession(session,"schedule")}>Move / cancel</button>}
      </div>
     </div>)}
   </div>)}
  </div>
  {open&&<div role="dialog" aria-modal="true" aria-label="Teaching session details"
    className="rounded-xl border border-border bg-surface p-5 space-y-4">
   <div className="flex justify-between gap-2">
    <div>
     <h2 className="font-semibold break-all">{open.title}</h2>
     <p className="text-sm text-muted">{formatLessonDate(open.starts_at,open.local_timezone||timezone,"long")} · {formatLessonTime(open.starts_at,open.local_timezone||timezone)}</p>
    </div>
    <button className="text-primary hover:underline text-sm" onClick={()=>setOpen(null)}>Close</button>
   </div>
   <div className="flex gap-3 border-b border-border">
    {(["attendance","notes","schedule"] as const).map(x=><button key={x}
      className={"pb-2 capitalize text-sm "+(tab===x?"border-b-2 border-primary text-primary":"text-muted")}
      onClick={()=>openSession(open,x)}>{x}</button>)}
   </div>
   {tab!=="schedule"&&<label className="block text-sm">Frozen participant
    <select className={field} value={selectedStudent} onChange={e=>{
     if(tab==="notes")loadNote(e.target.value,notes);
     else loadDecision(e.target.value,register);
    }}>
     {open.participants.map(p=><option key={p.studentId} value={p.studentId}>{p.name}</option>)}
    </select>
   </label>}
   {tab==="attendance"?<div className="space-y-3">
    <label className="block text-sm">Decision
     <select className={field} value={draftStatus??""}
      onChange={e=>{setDraftStatus((e.target.value||null) as Decision|null);setNotifyFamily(false)}}>
      <option value="">Unmarked</option>
      {Object.entries(DECISIONS).map(([v,label])=><option key={v} value={v}>{label}</option>)}
     </select>
    </label>
    <label className="block text-sm">Teacher attendance note
     <textarea className={field} rows={2} maxLength={5000} value={attendanceNote}
      onChange={e=>setAttendanceNote(e.target.value)}/>
    </label>
    {(draftStatus==="student_cancelled"||draftStatus==="teacher_cancelled")&&<label className="block text-sm">
     Cancellation reason
     <textarea className={field} rows={2} maxLength={1000} value={cancelReason}
      onChange={e=>setCancelReason(e.target.value)}/>
    </label>}
    {draftStatus==="student_cancelled"&&<label className="block text-sm">
     Verified notice time
     <input type="datetime-local" className={field} value={noticeAt?
      new Date(new Date(noticeAt).getTime()-
       new Date(noticeAt).getTimezoneOffset()*60_000).toISOString().slice(0,16):""}
      onChange={e=>setNoticeAt(e.target.value?new Date(e.target.value).toISOString():"")}/>
    </label>}
    {draftStatus==="teacher_cancelled"&&<label className="flex items-center gap-2 text-sm">
     <input type="checkbox" checked={notifyFamily} onChange={e=>setNotifyFamily(e.target.checked)}/>
     Queue an explicitly approved family cancellation email
    </label>}
    <button disabled={busy} onClick={saveAttendance}
     className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
     {busy?"Saving…":"Save attendance"}
    </button>
    {register.length>1&&<div className="mt-4 border-t border-border pt-3 flex flex-wrap items-end gap-3">
     <label className="text-sm">Entire frozen roster
      <select className={field} value={bulkDecision} onChange={e=>
       setBulkDecision(e.target.value as typeof bulkDecision)}>
       <option value="present">Present</option><option value="absent">Absent</option>
       <option value="teacher_cancelled">Teacher cancelled</option>
      </select></label>
     <button disabled={busy} onClick={bulkAttendance}
      className="rounded-lg border border-primary px-3 py-2 text-primary text-sm">
      Apply to all {register.length} participants
     </button>
    </div>}
   </div>:tab==="notes"?<div className="space-y-3">
    <label className="block text-sm">Family-shareable coaching note
     <textarea className={field} rows={3} maxLength={10000} value={body}
      onChange={e=>setBody(e.target.value)}/>
    </label>
    <label className="block text-sm">Teacher-private note (never shown in portal)
     <textarea className={field} rows={3} maxLength={10000} value={privateBody}
      onChange={e=>setPrivateBody(e.target.value)}/>
    </label>
    <label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={shareWithGuardian}
      onChange={e=>{setShareWithGuardian(e.target.checked);if(!e.target.checked)setEmailGuardian(false)}}/>
     Share the family note in the guardian portal
    </label>
    {shareWithGuardian&&<label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={emailGuardian} onChange={e=>setEmailGuardian(e.target.checked)}/>
     Queue an explicitly approved email with the shared note
    </label>}
    <button disabled={busy} onClick={saveNotes}
     className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
     {busy?"Saving…":"Save coaching notes"}
    </button>
   </div>:<div className="space-y-3">
    <p className="text-xs text-muted">
     Rescheduling preserves the original recurring slot and frozen roster history.
    </p>
    <div className="grid sm:grid-cols-3 gap-3">
     <label className="text-sm">Date
      <input type="date" className={field} value={moveDate}
       onChange={e=>setMoveDate(e.target.value)}/></label>
     <label className="text-sm">Local time ({open.local_timezone||timezone})
      <input type="time" className={field} value={moveTime}
       onChange={e=>setMoveTime(e.target.value)}/></label>
     <label className="text-sm">Duration
      <input type="number" className={field} min={15} max={480}
       value={moveDuration} onChange={e=>setMoveDuration(Number(e.target.value))}/></label>
    </div>
    <div className="flex flex-wrap gap-3">
     <button disabled={busy||open.status!=="scheduled"} onClick={saveSchedule}
      className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
      Save new time
     </button>
     <button disabled={busy||open.status!=="scheduled"} onClick={cancelTeachingSession}
      className="rounded-lg border border-warning px-4 py-2 text-sm text-warning">
      Cancel teaching session
     </button>
    </div>
   </div>}
  </div>}
 </div>;
}
