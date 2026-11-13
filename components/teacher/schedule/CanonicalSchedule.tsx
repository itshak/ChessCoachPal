"use client";

import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useToast} from "@/components/ui/toast";
import {addDays,toLocalDateString,zonedTimeToUtc} from "@/lib/schedule";
import type {CanonicalCalendarRow} from "@/lib/server/canonical-calendar-read";
import type {CanonicalMakeupCredit} from "@/lib/server/canonical-makeup-credit-service";

type Slot={
 id:string;student_id:string;workplace_id:string|null;day_of_week:number;
 start_time:string;duration_minutes:number;start_date:string;end_date:string|null;
 active:boolean;rate_cents:number|null;is_home_visit:boolean;updated_at:string;
};
type Name={id:string;name:string};
type Workplace={id:string;name:string;timezone:string};
type Event={id:string;title:string;location:string;starts_at:string;ends_at:string|null};
type Att=CanonicalCalendarRow["participants"][number];
type Note={id:string;student_id:string|null;body:string;private_body?:string;
 shared_with_guardian:boolean;updated_at:string};
const statuses=["present","late","absent","excused","student_cancelled","teacher_cancelled"] as const;
type Status=(typeof statuses)[number];
const labels:Record<Status,string>={
 present:"Present",late:"Late",absent:"Absent / no-show",excused:"Excused",
 student_cancelled:"Student cancelled",teacher_cancelled:"Teacher cancelled",
};
const days=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const inputClass="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
type Payload={method:string;body?:unknown};
async function mutate(url:string,{method,body}:Payload){
 const response=await fetch(url,{
  method,headers:{"Content-Type":"application/json"},
  ...(body!==undefined?{body:JSON.stringify(body)}:{}),
 });
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(typeof data.error==="string"?data.error:"Unable to save changes");
 return data as Record<string,unknown>;
}
function localTime(instant:string,zone:string){
 return new Intl.DateTimeFormat("en-GB",{timeZone:zone,hour:"2-digit",
  minute:"2-digit",hourCycle:"h23"}).format(new Date(instant));
}
function readableWhen(instant:string,zone:string){
 return new Intl.DateTimeFormat("en-US",{timeZone:zone,weekday:"short",month:"short",
  day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(instant));
}
type Props={
 weekStart:string;today:string;timezone:string;
 sessions:CanonicalCalendarRow[];slots:Slot[];students:Name[];
 workplaces:Workplace[];events:Event[];makeups:CanonicalMakeupCredit[];
 durationOptions:number[];materializationWarning?:string|null;
};
export function CanonicalSchedule(props:Props){
 const router=useRouter(),{showToast}=useToast();
 const {weekStart,today,timezone,sessions,slots,students,workplaces,
  events,makeups,durationOptions,materializationWarning}=props;
 const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<CanonicalCalendarRow|null>(null);
 const [reason,setReason]=useState("");
 const [emailFamily,setEmailFamily]=useState(false);
 const [moveDate,setMoveDate]=useState("");
 const [moveTime,setMoveTime]=useState("16:00");
 const [moveDuration,setMoveDuration]=useState(60);
 const [noting,setNoting]=useState<Att|null>(null);
 const [noteBody,setNoteBody]=useState("");
 const [notePrivate,setNotePrivate]=useState("");
 const [noteShared,setNoteShared]=useState(false);
 const [noteSend,setNoteSend]=useState(false);
 const [noteRevision,setNoteRevision]=useState<string|null>(null);
 const [adHocOpen,setAdHocOpen]=useState(false);
 const [sessionStudent,setSessionStudent]=useState(students[0]?.id??"");
 const [sessionWorkplace,setSessionWorkplace]=useState(workplaces[0]?.id??"");
 const [sessionDate,setSessionDate]=useState(today);
 const [sessionTime,setSessionTime]=useState("16:00");
 const [sessionDuration,setSessionDuration]=useState(durationOptions[0]??30);
 const [homeVisit,setHomeVisit]=useState(false);
 const [makeupSource,setMakeupSource]=useState<string|null>(null);
 const [slotOpen,setSlotOpen]=useState(false);
 const [slotEditing,setSlotEditing]=useState<Slot|null>(null);
 const [slotStudent,setSlotStudent]=useState(students[0]?.id??"");
 const [slotWorkplace,setSlotWorkplace]=useState(workplaces[0]?.id??"");
 const [slotDay,setSlotDay]=useState(2);
 const [slotTime,setSlotTime]=useState("16:00");
 const [slotDuration,setSlotDuration]=useState(durationOptions[0]??30);
 const [slotRate,setSlotRate]=useState("");
 const [slotStart,setSlotStart]=useState(today);
 const [slotEnd,setSlotEnd]=useState("");
 const [slotHome,setSlotHome]=useState(false);
 const [slotActive,setSlotActive]=useState(true);
 const [bulkStatus,setBulkStatus]=useState<"present"|"absent"|"teacher_cancelled">("present");
 const week=Array.from({length:7},(_,i)=>addDays(weekStart,i));
 const names=new Map(students.map(x=>[x.id,x.name]));
 const workById=new Map(workplaces.map(x=>[x.id,x.name]));

 async function run(fn:()=>Promise<void>){
  if(busy)return;
  setBusy(true);
  try{await fn();router.refresh();}
  catch(e){showToast(e instanceof Error?e.message:"Unable to save changes","error");}
  finally{setBusy(false);}
 }
 function openSession(session:CanonicalCalendarRow){
  setSelected(session);setReason("");setEmailFamily(false);
  setMoveDate(toLocalDateString(new Date(session.starts_at),session.local_timezone??timezone));
  setMoveTime(localTime(session.starts_at,session.local_timezone??timezone));
  setMoveDuration(session.duration_minutes);setNoting(null);
 }
 async function mark(session:CanonicalCalendarRow,p:Att,status:Status|null){
  if(status==="teacher_cancelled"&&emailFamily&&
    !window.confirm("Queue an email to this student's family about the cancellation?"))return;
  const now=status==="student_cancelled"?new Date().toISOString():null;
  await run(async()=>{
   await mutate("/api/coaching/sessions/"+session.id+"/attendance",{method:"PUT",body:{
    studentId:p.studentId,status,note:p.note,noticeAt:now,
    cancelReason:status==="student_cancelled"||status==="teacher_cancelled"?reason:"",
    expectedUpdatedAt:p.updatedAt,idempotencyKey:crypto.randomUUID(),
    notifyFamily:status==="teacher_cancelled"&&emailFamily,
    confirmed:status==="teacher_cancelled"&&emailFamily,
    confirmedEmail:status==="teacher_cancelled"&&emailFamily,
   }});
   showToast("Attendance recorded");setSelected(null);
  });
 }
 async function bulkMark(session:CanonicalCalendarRow){
  if(!session.participants.length)return;
  if(bulkStatus==="teacher_cancelled"&&emailFamily&&
   !window.confirm("Queue a separate approved family notice for each selected student?"))return;
  await run(async()=>{
   await mutate("/api/coaching/sessions/"+session.id+"/attendance",{method:"POST",body:{
    idempotencyKey:crypto.randomUUID(),
    attendance:session.participants.map(p=>({
     studentId:p.studentId,status:bulkStatus,note:p.note,
     noticeAt:null,cancelReason:bulkStatus==="teacher_cancelled"?reason:"",
     expectedUpdatedAt:p.updatedAt,
     notifyFamily:bulkStatus==="teacher_cancelled"&&emailFamily,
     confirmed:bulkStatus==="teacher_cancelled"&&emailFamily,
     confirmedEmail:bulkStatus==="teacher_cancelled"&&emailFamily,
    })),
   }});
   showToast("All frozen participants updated");setSelected(null);
  });
 }
 async function moveSession(session:CanonicalCalendarRow){
  let instant:string;
  try{instant=zonedTimeToUtc(moveDate,moveTime,
   session.local_timezone??timezone,"reject").toISOString();}
  catch{showToast("That local time does not exist (daylight-saving transition)","error");return;}
  await run(async()=>{
   await mutate("/api/coaching/sessions/"+session.id+"/lifecycle",{method:"PATCH",body:{
    startsAt:instant,durationMinutes:moveDuration,
    expectedUpdatedAt:session.updated_at,idempotencyKey:crypto.randomUUID(),
   }});
   showToast("Teaching session rescheduled");setSelected(null);
  });
 }
 async function cancelSession(session:CanonicalCalendarRow){
  if(!window.confirm("Cancel this teaching session for all participants? Attendance and billing history will be preserved."))return;
  await run(async()=>{
   await mutate("/api/coaching/sessions/"+session.id+"/lifecycle",{method:"PATCH",body:{
    status:"cancelled",expectedUpdatedAt:session.updated_at,
    idempotencyKey:crypto.randomUUID(),
   }});
   showToast("Session cancelled");setSelected(null);
  });
 }
 async function openNotes(session:CanonicalCalendarRow,p:Att){
  if(!window.confirm("Open teacher-private notes for this participant?"))return;
  setBusy(true);
  try{
   const response=await fetch("/api/coaching/sessions/"+session.id+
    "/notes?includePrivate=true&confirmed=true",{cache:"no-store"});
   const rows=await response.json();
   if(!response.ok)throw new Error(rows.error??"Notes unavailable");
   const note=(rows as Note[]).find(n=>n.student_id===p.studentId);
   setNoteBody(note?.body??"");
   setNotePrivate(note?.private_body??"");
   setNoteShared(note?.shared_with_guardian??false);
   setNoteRevision(note?.updated_at??null);
   setNoteSend(false);setNoting(p);
  }catch(e){showToast(e instanceof Error?e.message:"Notes unavailable","error");}
  finally{setBusy(false);}
 }
 async function saveNotes(session:CanonicalCalendarRow,p:Att){
  if(noteSend&&(!noteShared||!noteBody.trim())){
   showToast("Select Share with guardian and write a family note before emailing","error");return;
  }
  if(noteSend&&!window.confirm("Queue this family-facing note for email? Teacher-private notes will never be sent."))return;
  await run(async()=>{
   await mutate("/api/coaching/sessions/"+session.id+"/notes",{method:"PUT",body:{
    studentId:p.studentId,body:noteBody,privateBody:notePrivate,
    sharedWithGuardian:noteShared,sendEmail:noteSend,
    confirmedEmail:noteSend,expectedUpdatedAt:noteRevision,
    idempotencyKey:crypto.randomUUID(),
   }});
   showToast(noteSend?"Notes saved; approved email queued":"Notes saved");
   setNoting(null);setSelected(null);
  });
 }
 async function createPrivate(){
  if(!sessionStudent||!sessionWorkplace)return;
  await run(async()=>{
   await mutate("/api/coaching/calendar/private-sessions",{method:"POST",body:{
    studentId:sessionStudent,workplaceId:sessionWorkplace,
    date:sessionDate,time:sessionTime,durationMinutes:sessionDuration,
    isHomeVisit:homeVisit,makeupForSessionId:makeupSource,
    idempotencyKey:crypto.randomUUID(),
   }});
   showToast(makeupSource?"Make-up session scheduled":"Private session added");
   setAdHocOpen(false);setMakeupSource(null);
  });
 }
 function newSlot(){
  setSlotOpen(true);setSlotEditing(null);setSlotStudent(students[0]?.id??"");
  setSlotWorkplace(workplaces[0]?.id??"");setSlotDay(2);setSlotTime("16:00");
  setSlotDuration(durationOptions[0]??30);setSlotStart(today);setSlotEnd("");
  setSlotRate("");setSlotHome(false);setSlotActive(true);
 }
 function editSlot(slot:Slot){
  setSlotOpen(true);setSlotEditing(slot);setSlotStudent(slot.student_id);
  setSlotWorkplace(slot.workplace_id??workplaces[0]?.id??"");
  setSlotDay(slot.day_of_week);setSlotTime(slot.start_time.slice(0,5));
  setSlotDuration(slot.duration_minutes);setSlotStart(slot.start_date);
  setSlotEnd(slot.end_date??"");setSlotRate(slot.rate_cents===null?"":String(slot.rate_cents/100));
  setSlotHome(slot.is_home_visit);setSlotActive(slot.active);
 }
 async function saveSlot(){
  const parsedRate=slotRate.trim()?Number(slotRate):null;
  if(parsedRate!==null&&(!Number.isFinite(parsedRate)||parsedRate<0)){
   showToast("Enter a valid nonnegative rate","error");return;
  }
  const rateCents=parsedRate===null?null:Math.round(parsedRate*100);
  if(!slotEditing&&!slotStudent){
   showToast("Select a student first","error");return;
  }
  await run(async()=>{
   if(slotEditing){
    await mutate("/api/coaching/calendar/slots/"+slotEditing.id,{method:"PATCH",body:{
     changes:{dayOfWeek:slotDay,startTime:slotTime,
      durationMinutes:slotDuration,startDate:slotStart,
      endDate:slotEnd||null,rateCents,isHomeVisit:slotHome,active:slotActive,
      workplaceId:slotWorkplace},
     expectedUpdatedAt:slotEditing.updated_at,idempotencyKey:crypto.randomUUID(),
    }});
   }else{
    await mutate("/api/coaching/calendar/slots",{method:"POST",body:{
     studentId:slotStudent,workplaceId:slotWorkplace,
     dayOfWeek:slotDay,startTime:slotTime,durationMinutes:slotDuration,
     startDate:slotStart,endDate:slotEnd||null,rateCents,
     isHomeVisit:slotHome,idempotencyKey:crypto.randomUUID(),
    }});
   }
   showToast(slotEditing?"Recurrence safely updated":"Recurring lessons scheduled");
   setSlotOpen(false);
  });
 }
 async function deleteSlot(slot:Slot){
  if(!window.confirm("Remove this recurrence? Protected teaching sessions and billed/attended history will be preserved."))return;
  await run(async()=>{
   await mutate("/api/coaching/calendar/slots/"+slot.id,{method:"DELETE",body:{
    idempotencyKey:crypto.randomUUID(),
   }});
   showToast("Recurrence removed; historical sessions retained");
   setSlotOpen(false);
  });
 }
 const buttonDisabled=busy||!students.length;
 return <div className="space-y-7">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h1 className="text-2xl font-bold">Teaching schedule</h1>
    <p className="text-sm text-muted">One calendar for private and group sessions, with frozen participant attendance.</p></div>
   <div className="flex flex-wrap items-center gap-2">
    <Link className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-dim"
     href={"/schedule?week="+addDays(weekStart,-7)}>Previous week</Link>
    <Link className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-dim"
     href={"/schedule?week="+today}>Today</Link>
    <Link className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-dim"
     href={"/schedule?week="+addDays(weekStart,7)}>Next week</Link>
    <Button onClick={()=>{setAdHocOpen(!adHocOpen);setMakeupSource(null);}} disabled={buttonDisabled}>
     Add private lesson</Button>
   </div>
  </div>
  {materializationWarning&&<p className="text-sm text-warning" role="alert">{materializationWarning}</p>}
  {adHocOpen&&<Card padding="sm"><h2 className="font-semibold mb-3">
   {makeupSource?"Schedule make-up":"New private chess lesson"}</h2>
   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    <label className="text-sm">Student
     <select className={inputClass} value={sessionStudent} onChange={e=>setSessionStudent(e.target.value)}
      disabled={!!makeupSource}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm">Workplace
     <select className={inputClass} value={sessionWorkplace} onChange={e=>setSessionWorkplace(e.target.value)}>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
    <label className="text-sm">Date
     <input className={inputClass} type="date" value={sessionDate}
      onChange={e=>setSessionDate(e.target.value)}/></label>
    <label className="text-sm">Local time
     <input className={inputClass} type="time" value={sessionTime}
      onChange={e=>setSessionTime(e.target.value)}/></label>
    <label className="text-sm">Duration (minutes)
     <input className={inputClass} type="number" min={15} max={480}
      value={sessionDuration} onChange={e=>setSessionDuration(Number(e.target.value))}/></label>
   </div>
   <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox"
    checked={homeVisit} onChange={e=>setHomeVisit(e.target.checked)}/>Home visit</label>
   <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={createPrivate}>Save lesson</Button>
    <Button variant="secondary" onClick={()=>{setAdHocOpen(false);setMakeupSource(null);}}>Cancel</Button></div>
   <p className="mt-2 text-xs text-muted">Lessons use the workplace timezone and require current student enrollment. Historical roster and financial evidence remain immutable.</p>
  </Card>}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
   {week.map((day,i)=>{
    const list=sessions.filter(s=>
     toLocalDateString(new Date(s.starts_at),s.local_timezone??timezone)===day);
    const eventRows=events.filter(e=>toLocalDateString(new Date(e.starts_at),timezone)===day);
    return <Card key={day} padding="sm">
     <div className="font-semibold text-sm pb-2 border-b border-border mb-2">
      {days[new Date(day+"T12:00:00Z").getUTCDay()]}
      <span className="block text-xs font-normal text-muted">{day}</span></div>
     <div className="space-y-2">
      {list.map(s=><button key={s.id} type="button" onClick={()=>openSession(s)}
       className="w-full rounded-lg border border-border bg-surface-dim p-2 text-left hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40">
       <span className="block text-xs font-semibold">{localTime(s.starts_at,s.local_timezone??timezone)}</span>
       <span className="block text-sm font-medium">{s.title}</span>
       <span className="block text-xs text-muted">{s.duration_minutes} min · {s.participants.length} student{s.participants.length===1?"":"s"}</span>
       <span className="block text-xs text-muted">{s.participants.map(p=>p.name).join(", ")}</span>
       {s.status==="cancelled"&&<span className="block text-xs text-warning">Cancelled</span>}
       {s.status==="completed"&&<span className="block text-xs text-success">Completed</span>}
      </button>)}
      {eventRows.map(e=><div key={e.id} className="rounded border border-border p-2 text-xs">
       <span className="font-semibold">{e.title}</span><span className="block text-muted">{e.location}</span></div>)}
      {!list.length&&!eventRows.length&&<span className="text-xs text-muted">No lessons</span>}
     </div>
    </Card>;
   })}
  </div>
  {selected&&<Card padding="sm"><div className="flex items-start justify-between gap-3">
   <div><h2 className="font-semibold">{selected.title}</h2>
    <p className="text-sm text-muted">{readableWhen(selected.starts_at,selected.local_timezone??timezone)}
     {" · "}{selected.duration_minutes} min · {workById.get(selected.workplace_id)??"Workplace"}</p>
    <p className="text-xs text-muted">Session: {selected.status} · {selected.participants.length} frozen participants</p></div>
   <Button variant="secondary" onClick={()=>{setSelected(null);setNoting(null);}}>Close</Button>
  </div>
   <div className="mt-4 space-y-3">{selected.participants.map(p=><div key={p.studentId}
    className="rounded-lg border border-border p-3">
     <div className="flex flex-wrap items-center justify-between gap-2">
      <div><span className="font-medium text-sm">{p.name}</span>
       <span className="block text-xs text-muted">{p.attendanceStatus??"Unmarked"}
        {p.noticeAt?" · Notice "+new Date(p.noticeAt).toLocaleString():""}</span></div>
      <div className="flex flex-wrap items-center gap-2">
       <select aria-label={"Attendance for "+p.name} className={inputClass}
        value={p.attendanceStatus??""} disabled={busy||selected.status==="completed"}
        onChange={e=>void mark(selected,p,(e.target.value||null) as Status|null)}>
        <option value="">Unmarked</option>
        {statuses.map(status=><option key={status} value={status}>{labels[status]}</option>)}
       </select>
       <Button variant="secondary" disabled={busy} onClick={()=>void openNotes(selected,p)}>Notes</Button>
      </div></div>
     {noting?.studentId===p.studentId&&<div className="mt-3 space-y-2">
      <label className="text-sm block">Family-facing note
       <textarea className={inputClass} rows={3} maxLength={10000}
        value={noteBody} onChange={e=>setNoteBody(e.target.value)}/></label>
      <label className="text-sm block">Teacher-private coaching note
       <textarea className={inputClass} rows={3} maxLength={10000}
        value={notePrivate} onChange={e=>setNotePrivate(e.target.value)}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={noteShared}
       onChange={e=>setNoteShared(e.target.checked)}/>Share family-facing note in guardian portal</label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={noteSend}
       onChange={e=>setNoteSend(e.target.checked)}/>Email family-facing note (requires separate confirmation)</label>
      <Button disabled={busy} onClick={()=>void saveNotes(selected,p)}>Save notes</Button>
     </div>}
    </div>)}</div>
   <div className="mt-4 space-y-3">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox"
     checked={emailFamily} onChange={e=>setEmailFamily(e.target.checked)}/>
     Queue family email for teacher cancellations (approval on submit)</label>
    <label className="text-sm block">Cancellation reason (optional)
     <input className={inputClass} value={reason} maxLength={1000}
      onChange={e=>setReason(e.target.value)}/></label>
    {selected.participants.length>1&&<div className="flex flex-wrap items-center gap-2">
     <label className="text-sm">Mark entire frozen roster
      <select className={inputClass} value={bulkStatus}
       onChange={e=>setBulkStatus(e.target.value as typeof bulkStatus)}>
       <option value="present">Present</option><option value="absent">Absent</option>
       <option value="teacher_cancelled">Teacher cancelled</option>
      </select></label>
     <Button disabled={busy||selected.status==="completed"}
      onClick={()=>void bulkMark(selected)}>Apply to all</Button>
    </div>}
    {selected.status==="scheduled"&&<div className="border-t border-border pt-4">
     <h3 className="text-sm font-semibold mb-2">Move or correct session</h3>
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label className="text-sm">Date
       <input type="date" className={inputClass} value={moveDate}
        onChange={e=>setMoveDate(e.target.value)}/></label>
      <label className="text-sm">Local time ({selected.local_timezone??timezone})
       <input type="time" className={inputClass} value={moveTime}
        onChange={e=>setMoveTime(e.target.value)}/></label>
      <label className="text-sm">Duration
       <input type="number" min={15} max={480} className={inputClass}
        value={moveDuration} onChange={e=>setMoveDuration(Number(e.target.value))}/></label>
     </div>
     <div className="mt-3 flex flex-wrap gap-2">
      <Button disabled={busy} onClick={()=>void moveSession(selected)}>Save new time</Button>
      <Button variant="secondary" disabled={busy}
       onClick={()=>void cancelSession(selected)}>Cancel this session</Button>
     </div></div>}
    <Link className="inline-block text-xs underline text-primary" href="/coaching">
     Complete the session and record coaching evidence
    </Link>
   </div>
  </Card>}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
   <Card padding="sm"><div className="flex flex-wrap justify-between gap-2 items-center">
    <div><h2 className="font-semibold">Weekly recurring slots</h2>
     <p className="text-xs text-muted">Edit the schedule rule without erasing teaching history.</p></div>
    <Button onClick={()=>newSlot()} disabled={buttonDisabled}>New weekly slot</Button></div>
    <div className="mt-3 space-y-2">
     {slots.map(s=><div key={s.id} className="border border-border rounded-lg p-2
      flex flex-wrap items-center justify-between gap-2 text-sm">
      <div><span className="font-medium">{names.get(s.student_id)??"Student"}</span>
       <span className="block text-xs text-muted">{days[s.day_of_week]} {s.start_time.slice(0,5)}
        {" · "}{s.duration_minutes} min{" · "}{workById.get(s.workplace_id??"")??"Personal studio"}
        {!s.active?" · Paused":""}</span></div>
      <Button variant="secondary" onClick={()=>editSlot(s)} disabled={busy}>Edit</Button>
     </div>)}
     {!slots.length&&<p className="text-sm text-muted">No recurring slots yet.</p>}
    </div>
    {slotOpen&&<div className="mt-4 border-t border-border pt-3">
     <h3 className="font-medium text-sm mb-2">{slotEditing?"Edit recurring slot":"Create recurring slot"}</h3>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="text-sm">Student
       <select className={inputClass} value={slotStudent} disabled={!!slotEditing}
        onChange={e=>setSlotStudent(e.target.value)}>
        {students.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="text-sm">Workplace
       <select className={inputClass} value={slotWorkplace}
        onChange={e=>setSlotWorkplace(e.target.value)}>
        {workplaces.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="text-sm">Day of week
       <select className={inputClass} value={slotDay}
        onChange={e=>setSlotDay(Number(e.target.value))}>
        {days.map((d,i)=><option key={i} value={i}>{d}</option>)}</select></label>
      <label className="text-sm">Local start
       <input type="time" className={inputClass} value={slotTime}
        onChange={e=>setSlotTime(e.target.value)}/></label>
      <label className="text-sm">Duration
       <input type="number" min={15} max={480} className={inputClass}
        value={slotDuration} onChange={e=>setSlotDuration(Number(e.target.value))}/></label>
      <label className="text-sm">Lesson rate (currency units; optional)
       <input className={inputClass} inputMode="decimal" value={slotRate}
        onChange={e=>setSlotRate(e.target.value)}/></label>
      <label className="text-sm">Starts
       <input type="date" className={inputClass} value={slotStart}
        onChange={e=>setSlotStart(e.target.value)}/></label>
      <label className="text-sm">Ends (optional)
       <input type="date" className={inputClass} value={slotEnd}
        onChange={e=>setSlotEnd(e.target.value)}/></label>
     </div>
     <div className="mt-3 flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="checkbox" checked={slotHome}
       onChange={e=>setSlotHome(e.target.checked)}/>Home visit</label>
      {slotEditing&&<label className="flex items-center gap-2"><input type="checkbox"
       checked={slotActive} onChange={e=>setSlotActive(e.target.checked)}/>Active</label>}
     </div>
     <div className="mt-3 flex flex-wrap gap-2">
      <Button disabled={busy} onClick={()=>void saveSlot()}>Save recurring slot</Button>
      {slotEditing&&<Button disabled={busy} variant="secondary"
       onClick={()=>void deleteSlot(slotEditing)}>Remove rule</Button>}
      <Button variant="secondary" onClick={()=>setSlotOpen(false)}>Close</Button>
     </div>
    </div>}
   </Card>
   <Card padding="sm"><h2 className="font-semibold">Available make-up credits</h2>
    <p className="text-xs text-muted mb-3">Derived from the original frozen student's cancellation or absence under your studio policy.</p>
    {makeups.length===0&&<p className="text-sm text-muted">No eligible unused make-up credits.</p>}
    <div className="space-y-2">{makeups.map(x=><div key={x.sourceSessionId+":"+x.studentId}
     className="rounded-lg border border-border p-2 flex flex-wrap justify-between gap-2 items-center">
     <div><span className="font-medium text-sm">{x.studentName}</span>
      <span className="block text-xs text-muted">{readableWhen(x.missedAt,timezone)}
       {" · "}{x.durationMinutes} min · {x.status.replaceAll("_"," ")}</span></div>
     <Button variant="secondary" disabled={busy} onClick={()=>{
      setSessionStudent(x.studentId);setSessionDuration(x.durationMinutes);
      setSessionDate(today);setMakeupSource(x.sourceSessionId);setAdHocOpen(true);
      window.scrollTo({top:0,behavior:"smooth"});
     }}>Schedule make-up</Button>
    </div>)}</div>
    <p className="mt-3 text-xs text-muted">
     Manage make-up expiry, cancellation windows and billing policy in{" "}
     <Link className="text-primary underline" href="/studio">Studio settings</Link>.
    </p>
   </Card>
  </div>
 </div>;
}
