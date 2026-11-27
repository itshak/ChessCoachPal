"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useMemo,useState,useRef,useEffect} from "react";
import {calendarCopy,calendarDates,calendarHref,calendarRange,calendarDetailHash,calendarDetailId,type CalendarView} from "./calendar-view";
import "./calendar-layout.css";
import {useLocale,useTranslations} from "next-intl";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useToast} from "@/components/ui/toast";
import type {CanonicalCalendarRow} from "@/lib/server/canonical-calendar-read";
import {toLocalDateString,formatLessonTime,zonedTimeToUtc} from "@/lib/schedule";

type Student={id:string;name:string};
type Workplace={id:string;name:string;localToday:string};
type Event={id:string;title:string;startsAt:string;localDate:string};
type AttendanceRow={
 studentId:string;status:string;note:string;noticeAt:string|null;
 cancelReason:string;updatedAt:string|null;
};
type NoteRow={
 id:string;student_id:string|null;body:string;private_body?:string;
 shared_with_contacts:boolean;updated_at:string;emailed_at:string|null;
};
type EditorTab="attendance"|"notes"|"schedule";
type DetailTab="overview"|EditorTab;
type Decision="present"|"late"|"absent"|"excused"|"student_cancelled"|"teacher_cancelled";
const DECISIONS:Record<Decision,string>={
 present:"Present",late:"Arrived late",absent:"Absent / no-show",
 excused:"Excused",student_cancelled:"Student cancelled",
 teacher_cancelled:"Teacher cancelled",
};
const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
async function jsonResponse(res:Response){
 const data=await res.json().catch(()=>null);
 if(!res.ok)throw Object.assign(new Error(
  data&&typeof data.error==="string"?data.error:"Request failed ("+res.status+")"),
  {code:typeof data?.code==="string"?data.code:undefined});
 return data;
}

/** Current-schema week board: every actual teaching card is a canonical
 * teaching_sessions UUID. Attendance and notes always address a frozen
 * participant, and all writes use the exact website/MCP domain operations.
 */
export function CanonicalScheduleBoard({
 weekStart,rangeEnd,anchorDate,view,calendarStatus,nowIso,today,timezone,personalToday,selectedWorkplaceId,workplaceTimezones,workplaceNames,sessions,events,students,workplaces,durationOptions,
}:{
 weekStart:string;rangeEnd:string;anchorDate:string;view:CalendarView;calendarStatus:"ready"|"partial"|"unavailable";nowIso:string;today:string;timezone:string;personalToday:string;selectedWorkplaceId:string|null;
 workplaceTimezones:Readonly<Record<string,string>>;workplaceNames:Readonly<Record<string,string>>;
 sessions:CanonicalCalendarRow[];events:Event[];
 students:Student[];workplaces:Workplace[];durationOptions:number[];
}){
 const router=useRouter(),{showToast}=useToast();
 const t=useTranslations("calendar");
 const toUserError=useLocalizedApiError();
 const uiLocale=useLocale();
 const words=calendarCopy(uiLocale);
 const range=calendarRange(anchorDate,view);
 const origin=useRef<{scroll:number;focus:HTMLElement|null}|null>(null);
 const detailRef=useRef<HTMLDivElement>(null);
 const lastDetailId=useRef<string|null>(null);
 const ownsDetailEntry=useRef(false);
 const readSequence=useRef(0);
 const writePending=useRef(false);
 const [open,setOpen]=useState<CanonicalCalendarRow|null>(null);
 const [detailMissing,setDetailMissing]=useState(false);
 const [tab,setTab]=useState<DetailTab>("overview");
 const [moveDate,setMoveDate]=useState(today);
 const [moveTime,setMoveTime]=useState("16:00");
 const [moveDuration,setMoveDuration]=useState(60);
 const [moveHomeVisit,setMoveHomeVisit]=useState(false);
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
 const [shareWithContacts,setShareWithContacts]=useState(false);
 const [emailContacts,setEmailContacts]=useState(false);
 const [busy,setBusy]=useState(false);
 const [addOpen,setAddOpen]=useState(false);
 const [addStudent,setAddStudent]=useState("");
 const [addWorkplace,setAddWorkplace]=useState(selectedWorkplaceId??"");
 const [addDateEdited,setAddDateEdited]=useState(false);
 const [addDate,setAddDate]=useState(today);
 const [addTime,setAddTime]=useState("16:00");
 const [addDuration,setAddDuration]=useState(60);
 const [addHomeVisit,setAddHomeVisit]=useState(false);
 const days=useMemo(()=>calendarDates(weekStart,rangeEnd),[weekStart,rangeEnd]);
 const openId=open?.id;
 useEffect(()=>{
  if(openId){
   if(window.matchMedia("(max-width:799px)").matches)window.scrollTo(0,0);
   else if(window.matchMedia("(max-width:1279px)").matches)detailRef.current?.scrollIntoView({block:"nearest"});
   detailRef.current?.focus({preventScroll:true});
  }
 },[openId]);
 function restoreList(){
  readSequence.current+=1;
  setOpen(null);setDetailMissing(false);if(!writePending.current)setBusy(false);setNotes([]);setPrivateBody("");setBody("");setRegister([]);
  const previous=origin.current;origin.current=null;
  if(previous)requestAnimationFrame(()=>{window.scrollTo(0,previous.scroll);previous.focus?.focus({preventScroll:true});});
 }
 function closeDetail(){
  const hasDetail=calendarDetailId(window.location.hash);
  if(hasDetail){
   const wasPushed=ownsDetailEntry.current;
   if(wasPushed){window.history.back();return;}
   ownsDetailEntry.current=false;lastDetailId.current=null;
   const url=new URL(window.location.href);url.hash="";
   window.history.replaceState(null,"",url);
  }
  restoreList();
 }
 // Browser history carries only a visible canonical UUID, never a private note
 // or draft. Reload/Forward opens the read-only overview; Notes always requires
 // a fresh, explicit click. Unknown/out-of-context IDs cannot select a fallback.
 useEffect(()=>{
  function sync(){
   const id=calendarDetailId(window.location.hash);
   if(id===lastDetailId.current)return;
   const previousId=lastDetailId.current;
   lastDetailId.current=id;ownsDetailEntry.current=Boolean(id&&window.history.state?.ccpCalendarDetail===true);
   readSequence.current+=1;
   setNotes([]);setPrivateBody("");setBody("");setRegister([]);
   if(id){
    const session=sessions.find(row=>row.id===id);
    setOpen(session??null);setDetailMissing(!session);setTab("overview");if(!writePending.current)setBusy(false);
   }else if(previousId){
    setOpen(null);setDetailMissing(false);if(!writePending.current)setBusy(false);
    const previous=origin.current;origin.current=null;
    if(previous)requestAnimationFrame(()=>{window.scrollTo(0,previous.scroll);previous.focus?.focus({preventScroll:true});});
   }
  }
  const frame=requestAnimationFrame(sync);
  window.addEventListener("popstate",sync);
  window.addEventListener("hashchange",sync);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener("popstate",sync);window.removeEventListener("hashchange",sync)};
 },[sessions]);
 function rememberOrigin(){
  if(!open)origin.current={scroll:window.scrollY,focus:document.activeElement instanceof HTMLElement?document.activeElement:null};
 }
 function showDetail(session:CanonicalCalendarRow,section:DetailTab){
  const currentDetail=calendarDetailId(window.location.hash);
  if((currentDetail||window.matchMedia("(max-width:799px)").matches)&&currentDetail!==session.id){
   const hash=calendarDetailHash(session.id);
   if(currentDetail)window.history.replaceState({ccpCalendarDetail:ownsDetailEntry.current},"",hash);
   else{window.history.pushState({ccpCalendarDetail:true},"",hash);ownsDetailEntry.current=true;}
   lastDetailId.current=session.id;
  }
  setOpen(session);setDetailMissing(false);setTab(section);
 }
 function selectSession(session:CanonicalCalendarRow){
  rememberOrigin();readSequence.current+=1;
  setNotes([]);setPrivateBody("");setBody("");setRegister([]);
  showDetail(session,"overview");
 }
 const byDay=useMemo(()=>{
  const daysMap=new Map<string,CanonicalCalendarRow[]>();
  for(const session of sessions){
   const date=toLocalDateString(new Date(session.starts_at),session.local_timezone||workplaceTimezones[session.workplace_id]||timezone);
   const arr=daysMap.get(date)??[];arr.push(session);daysMap.set(date,arr);
  }
  for(const arr of daysMap.values())arr.sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  return daysMap;
 },[sessions,timezone,workplaceTimezones]);

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
  setShareWithContacts(item?.shared_with_contacts??false);
  setEmailContacts(false);
 }
 async function openSession(session:CanonicalCalendarRow,section:EditorTab){
  rememberOrigin();
  const sequence=++readSequence.current;
  setBusy(true);
  try{
   const path="/api/coaching/sessions/"+session.id;
   // Private notes are fetched only in response to an explicit teacher
   // click on the notes editor, never in the initial roster/calendar payload.
   const endpoint=section==="notes"?
    path+"/notes?includePrivate=true&confirmed=true":path+"/attendance";
   const rows=section==="schedule"?[]:
    await jsonResponse(await fetch(endpoint,{cache:"no-store"}));
   if(sequence!==readSequence.current)return;
   if(!Array.isArray(rows))throw new Error(t("invalidRegister"));
   if(section!=="notes"){setNotes([]);setBody("");setPrivateBody("");}
   showDetail(session,section);
   if(section==="schedule"){
    const zone=session.local_timezone||workplaceTimezones[session.workplace_id]||timezone;
    setMoveDate(toLocalDateString(new Date(session.starts_at),zone));
    setMoveTime(new Intl.DateTimeFormat("en-GB",{timeZone:zone,
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(session.starts_at)));
    setMoveDuration(session.duration_minutes);
    setMoveHomeVisit(session.is_home_visit);
    return;
   }
   const first=session.participants[0]?.studentId??"";
   if(section==="notes"){
    setNotes(rows as NoteRow[]);loadNote(first,rows as NoteRow[]);
   }else{
    setRegister(rows as AttendanceRow[]);loadDecision(first,rows as AttendanceRow[]);
   }
  }catch(e){if(sequence===readSequence.current)showToast(toUserError(e, t("saveError")),"error")}
  finally{if(sequence===readSequence.current)setBusy(false)}
 }
 async function saveAttendance(){
  if(!open||!selectedStudent)return;
  if(draftStatus==="student_cancelled"&&!noticeAt){
   showToast(t("studentNoticeRequired"),"error");return;
  }
  const selectionSequence=readSequence.current;
  writePending.current=true;setBusy(true);
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
   if(selectionSequence===readSequence.current){setRegister(fresh);loadDecision(selectedStudent,fresh);}
   showToast(result.emailQueued?t("attendanceSavedEmailQueued"):"Attendance saved");
   router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }
 async function saveNotes(){
  if(!open||!selectedStudent)return;
  const selectionSequence=readSequence.current;
  writePending.current=true;setBusy(true);
  try{
   const result=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/notes",{
     method:"PUT",headers:{"Content-Type":"application/json"},
     body:JSON.stringify({
      studentId:selectedStudent,body,privateBody,
      sharedWithContacts:shareWithContacts,sendEmail:emailContacts,
      confirmedEmail:emailContacts,
      expectedUpdatedAt:chosenNote?.updated_at??null,
      idempotencyKey:crypto.randomUUID(),
     }),
    }));
   const fresh=await jsonResponse(await fetch(
    "/api/coaching/sessions/"+open.id+"/notes?includePrivate=true&confirmed=true",
    {cache:"no-store"}));
   if(selectionSequence===readSequence.current){setNotes(fresh);loadNote(selectedStudent,fresh);}
   showToast(result.emailQueued?t("notesSavedEmailQueued"):t("notesSaved"));
   router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }

 async function saveSchedule(){
  if(!open)return;
  let startsAt:string;
  try{
   startsAt=zonedTimeToUtc(moveDate,moveTime,open.local_timezone||workplaceTimezones[open.workplace_id]||timezone,"reject").toISOString();
  }catch{showToast(t("invalidLocalTime"),"error");return;}
  const selectionSequence=readSequence.current;
  writePending.current=true;setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/sessions/"+open.id+"/lifecycle",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({startsAt,durationMinutes:moveDuration,
      isHomeVisit:moveHomeVisit,
      expectedUpdatedAt:open.updated_at,idempotencyKey:crypto.randomUUID()}),
   }));
   if(selectionSequence===readSequence.current)closeDetail();showToast(t("rescheduled"));router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }
 async function cancelTeachingSession(){
  if(!open)return;
  if(!window.confirm(t("cancelSessionConfirm")))return;
  const selectionSequence=readSequence.current;
  writePending.current=true;setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/sessions/"+open.id+"/lifecycle",{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({status:"cancelled",
      expectedUpdatedAt:open.updated_at,idempotencyKey:crypto.randomUUID()}),
   }));
   if(selectionSequence===readSequence.current)closeDetail();showToast(t("sessionCancelled"));router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }
 async function bulkAttendance(){
  if(!open||!register.length)return;
  if(bulkDecision==="teacher_cancelled"&&notifyFamily&&
    !window.confirm(t("confirmFamilyCancellation")))return;
  const selectionSequence=readSequence.current;
  writePending.current=true;setBusy(true);
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
   if(selectionSequence===readSequence.current){setRegister(fresh);loadDecision(selectedStudent,fresh);}
   showToast(t("allAttendanceUpdated"));router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }
 async function addPrivateSession(){
  if(!addStudent)return showToast(t("chooseStudent"),"error");
  writePending.current=true;setBusy(true);
  try{
   await jsonResponse(await fetch("/api/coaching/calendar/private-sessions",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     studentId:addStudent,workplaceId:addWorkplace||null,
     date:addDate,time:addTime,durationMinutes:addDuration,
     isHomeVisit:addHomeVisit,idempotencyKey:crypto.randomUUID(),
    }),
   }));
   setAddOpen(false);showToast(t("privateSessionScheduled"));
   router.refresh();
  }catch(e){showToast(toUserError(e, t("saveError")),"error")}
  finally{writePending.current=false;setBusy(false)}
 }
 return <div className="space-y-5 ccp-calendar" data-detail-open={!!open} data-view={view}>
  <div className="ccp-calendar-controls flex flex-wrap gap-3 items-center justify-between">
   <div className="flex flex-wrap gap-3 items-center">
    <Link className="text-primary hover:underline" href={calendarHref(range.previous,view)}>{t("previous")}</Link>
    <span className="font-medium"><bdi>{weekStart} – {rangeEnd}</bdi></span>
    <Link className="text-primary hover:underline" href={calendarHref(range.next,view)}>{t("next")}</Link>
    <Link className="text-primary hover:underline" href={calendarHref(today,view)}>{t("today")}</Link>
   </div>
   <nav aria-label={words.view} className="flex flex-wrap gap-2">
    {(["agenda","week","month","day"] as const).map(mode=><Link key={mode}
      data-view-choice={mode} aria-current={view===mode?"page":undefined} className={"rounded px-3 py-2 border "+(view===mode?"border-primary text-primary":"border-border")}
      href={calendarHref(anchorDate,mode)}>{words[mode]}</Link>)}
   </nav>
   <form method="get" action="/schedule" className="flex flex-wrap gap-2 items-center">
    {view!=="auto"&&<input type="hidden" name="view" value={view}/>}
    <label className="flex flex-wrap gap-2 items-center">{words.date}
     <input className="rounded border border-border px-2 py-1" name="week" type="date" min="1900-01-01" max="9998-12-31" defaultValue={anchorDate} required/>
    </label>
    <button className="text-primary underline" type="submit">{t("date")}</button>
   </form>
   <button className="rounded-lg border border-primary px-3 py-2 text-sm text-primary hover:bg-primary/10"
    onClick={()=>{
      if(!addOpen){
       setAddWorkplace(selectedWorkplaceId??"");setAddDate(today);setAddDateEdited(false);
      }
      setAddOpen(!addOpen);
    }}>+ {t("privateSessionButton")}</button>
  </div>
  {addOpen&&<div className="ccp-calendar-controls rounded-xl border border-border bg-surface p-4 space-y-3">
   <h3 className="font-medium">{t("individualLesson")}</h3>
   <div className="grid sm:grid-cols-3 gap-3">
    <label className="text-sm">{t("student")}
     <select className={field} value={addStudent} onChange={e=>setAddStudent(e.target.value)}>
      <option value="">{t("chooseStudent")}</option>
      {students.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
     </select>
    </label>
    <label className="text-sm">{t("workplace")}
     <select className={field} value={addWorkplace} onChange={e=>{
      const id=e.target.value;setAddWorkplace(id);
      if(!addDateEdited)setAddDate(workplaces.find(w=>w.id===id)?.localToday??personalToday);
     }}>
      <option value="">{t("personalCoaching")}</option>
      {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
     </select>
    </label>
    <label className="text-sm">{t("duration")}
     <select className={field} value={addDuration} onChange={e=>setAddDuration(Number(e.target.value))}>
      {[...new Set([...durationOptions,30,45,60,90].filter(x=>x>=15&&x<=480))]
       .sort((a,b)=>a-b).map(d=><option key={d} value={d}>{t("minutes",{count:d})}</option>)}
     </select>
    </label>
    <label className="text-sm">{t("date")}
     <input className={field} type="date" value={addDate} onChange={e=>{setAddDate(e.target.value);setAddDateEdited(true)}}/>
    </label>
    <label className="text-sm">{t("localTime")}
     <input className={field} type="time" value={addTime} onChange={e=>setAddTime(e.target.value)}/>
    </label>
    <label className="text-sm flex gap-2 items-end pb-2">
     <input type="checkbox" checked={addHomeVisit} onChange={e=>setAddHomeVisit(e.target.checked)}/>
     {t("homeVisit")}
    </label>
   </div>
   <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground text-sm"
    disabled={busy} onClick={addPrivateSession}>{t("createSession")}</button>
  </div>}
  {detailMissing&&<p role="alert">{t("lessonLinkUnavailable")}</p>}
  {calendarStatus!=="ready"&&<p role="alert">{calendarStatus==="partial"?words.partial:words.unavailable}</p>}
  <div className="ccp-calendar-workspace">
  <div className="ccp-calendar-list" data-view={view}>
   {days.map(date=><div key={date} data-calendar-date={date} data-empty={!byDay.get(date)?.length&&!events.some(e=>e.localDate===date)} className={
    "ccp-calendar-day min-w-0 border-b border-border p-2 "+
     (date===today?"border-primary/60 bg-primary/5":"border-border bg-surface")
   }>
    <Link href={calendarHref(date,"day")} className="block font-semibold mb-2 hover:underline">
     {new Intl.DateTimeFormat(uiLocale,{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"}).format(new Date(date+"T12:00:00Z"))}
    </Link>
    <span className="ccp-calendar-mobile-count">{(byDay.get(date)?.length??0)+events.filter(e=>e.localDate===date).length}</span>
    {events.filter(e=>e.localDate===date).map(e=><Link key={e.id} href={"/events/"+e.id}
      className="block rounded-lg border border-accent/40 bg-accent/10 p-2 text-xs mb-2">
      <b>{t("event")}</b> {e.title}
    </Link>)}
    {(byDay.get(date)??[]).map(session=><div key={session.id}
      data-calendar-session={session.id} className="ccp-calendar-record border-b border-border p-2 mb-2 space-y-1 min-w-0">
      <button className="block text-start font-medium hover:underline w-full [overflow-wrap:anywhere]" disabled={busy} onClick={()=>selectSession(session)} aria-pressed={open?.id===session.id}>
       <bdi>{formatLessonTime(session.starts_at,session.local_timezone||workplaceTimezones[session.workplace_id]||timezone)}</bdi>{" · "}<bdi dir="auto">{session.title}</bdi>
      </button>
      <div className="text-foreground [overflow-wrap:anywhere]">{session.participants.map(p=>p.name).join(", ")}</div>
      <div className="text-muted">{t("minuteShort",{count:session.duration_minutes})} · {session.status==="cancelled"?t("cancelled"):session.status==="completed"?t("completed"):session.status==="scheduled"?t("scheduled"):words.unknownStatus}</div>
      <div className="ccp-calendar-row-actions flex flex-wrap gap-2 text-sm">
       <button id={"lesson-attendance-"+session.id} disabled={busy} className="text-primary hover:underline"
        onClick={()=>openSession(session,"attendance")}>{t("attendance")}</button>
       <button id={"lesson-notes-"+session.id} disabled={busy} className="text-primary hover:underline"
        onClick={()=>openSession(session,"notes")}>{t("notes")}</button>
       {session.status==="scheduled"&&<button disabled={busy}
        className="text-primary hover:underline"
        onClick={()=>openSession(session,"schedule")}>{t("moveCancel")}</button>}
      </div>
     </div>)}
   </div>)}
  {calendarStatus==="ready"&&!sessions.length&&!events.length&&<p className="p-3" role="status">{words.empty}</p>}
  </div>
  {open&&<div ref={detailRef} tabIndex={-1} role="dialog" aria-label={t("teachingSessionDetails")}
    className="ccp-calendar-detail min-w-0 border border-border bg-surface p-4 space-y-4">
   <div className="flex justify-between gap-2">
    <div>
     <h2 className="font-semibold [overflow-wrap:anywhere]"><bdi dir="auto">{open.title}</bdi></h2>
     <p className="text-sm text-muted">{new Intl.DateTimeFormat(uiLocale,{timeZone:open.local_timezone||workplaceTimezones[open.workplace_id]||timezone,dateStyle:"full"}).format(new Date(open.starts_at))} · {formatLessonTime(open.starts_at,open.local_timezone||workplaceTimezones[open.workplace_id]||timezone)}</p>
    </div>
    <button className="text-primary hover:underline text-sm" disabled={busy} onClick={closeDetail}>{t("close")}</button>
   </div>
   <div className="flex flex-wrap gap-3 border-b border-border">
    <button disabled={busy} aria-pressed={tab==="overview"} className={"pb-2 "+(tab==="overview"?"border-b-2 border-primary text-primary":"text-muted")}
      onClick={()=>selectSession(sessions.find(row=>row.id===open.id)??open)}>{words.overview}</button>
    {(["attendance","notes","schedule"] as const).map(x=><button key={x} disabled={busy} aria-pressed={tab===x}
      className={"pb-2 "+(tab===x?"border-b-2 border-primary text-primary":"text-muted")}
      onClick={()=>openSession(open,x)}>{t(x)}</button>)}
   </div>
   {busy&&<p role="status">{words.loading}</p>}
   {tab!=="schedule"&&tab!=="overview"&&<label className="block text-sm">{t("frozenParticipant")}
    <select className={field} value={selectedStudent} onChange={e=>{
     if(tab==="notes")loadNote(e.target.value,notes);
     else loadDecision(e.target.value,register);
    }}>
     {open.participants.map(p=><option key={p.studentId} value={p.studentId}>{p.name}</option>)}
    </select>
   </label>}
   {tab==="overview"?<div className="space-y-5">
    <div className="flex flex-wrap gap-x-4 gap-y-1">
     <p className="font-semibold">{open.status==="scheduled"?t("scheduled"):open.status==="completed"?t("completed"):open.status==="cancelled"?t("cancelled"):words.unknownStatus}</p>
     <p>{t("minutes",{count:open.duration_minutes})}</p>
    </div>
    <div>
     <p className="font-medium"><bdi dir="auto">{workplaceNames[open.workplace_id]??words.workplaceUnavailable}</bdi></p>
     <p className="text-muted"><bdi>{open.local_timezone||workplaceTimezones[open.workplace_id]||timezone}</bdi></p>
     {open.is_home_visit&&<p>{t("homeVisit")}</p>}
    </div>
    <section className="space-y-2">
     <h3 className="font-semibold">{words.participants} <span className="text-muted">{open.participants.length}</span></h3>
     <ul className="divide-y divide-border">
      {open.participants.map(p=><li key={p.studentId} className="flex flex-wrap gap-2 justify-between py-3">
       <Link className="font-medium text-primary hover:underline" href={"/students/"+p.studentId}><bdi dir="auto">{p.name}</bdi></Link>
       <span className="text-muted">{p.attendanceStatus===null||p.attendanceStatus==="unmarked"?t("unmarked"):
        Object.prototype.hasOwnProperty.call(DECISIONS,p.attendanceStatus)?t(p.attendanceStatus as Decision):words.unknownStatus}</span>
      </li>)}
     </ul>
    </section>
    {open.status==="scheduled"&&Date.parse(open.starts_at)>=Date.parse(nowIso)&&<Link className="text-primary underline" href={"/dashboard?prepareSession="+open.id+"#lesson-preparation"}>{words.prepare}</Link>}
   </div>:tab==="attendance"?<div className="space-y-3">
    <label className="block text-sm">{t("decision")}
     <select className={field} value={draftStatus??""}
      onChange={e=>{setDraftStatus((e.target.value||null) as Decision|null);setNotifyFamily(false)}}>
      <option value="">{t("unmarked")}</option>
      {Object.entries(DECISIONS).map(([v])=><option key={v} value={v}>{t(v as keyof typeof DECISIONS)}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("teacherAttendanceNote")}
     <textarea className={field} rows={2} maxLength={5000} value={attendanceNote}
      onChange={e=>setAttendanceNote(e.target.value)}/>
    </label>
    {(draftStatus==="student_cancelled"||draftStatus==="teacher_cancelled")&&<label className="block text-sm">
     {t("cancellationReason")}
     <textarea className={field} rows={2} maxLength={1000} value={cancelReason}
      onChange={e=>setCancelReason(e.target.value)}/>
    </label>}
    {draftStatus==="student_cancelled"&&<label className="block text-sm">
     {t("verifiedNoticeTime")}
     <input type="datetime-local" className={field} value={noticeAt?
      new Date(new Date(noticeAt).getTime()-
       new Date(noticeAt).getTimezoneOffset()*60_000).toISOString().slice(0,16):""}
      onChange={e=>setNoticeAt(e.target.value?new Date(e.target.value).toISOString():"")}/>
    </label>}
    {draftStatus==="teacher_cancelled"&&<div>
     <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={notifyFamily} aria-describedby="cancel-contact-email-hint"
       onChange={e=>setNotifyFamily(e.target.checked)}/>
      {t("queueFamilyCancellation")}
     </label>
     <p id="cancel-contact-email-hint" className="mt-1 text-xs text-muted">{t("ambiguousContactEmailHint")}</p>
    </div>}
    <button disabled={busy} onClick={saveAttendance}
     className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
     {busy?t("saving"):t("saveAttendance")}
    </button>
    {register.length>1&&<div className="mt-4 border-t border-border pt-3 flex flex-wrap items-end gap-3">
     <label className="text-sm">{t("entireRoster")}
      <select className={field} value={bulkDecision} onChange={e=>
       setBulkDecision(e.target.value as typeof bulkDecision)}>
       <option value="present">{t("present")}</option><option value="absent">{t("absentShort")}</option>
       <option value="teacher_cancelled">{t("teacher_cancelled")}</option>
      </select></label>
     <button disabled={busy} onClick={bulkAttendance}
      className="rounded-lg border border-primary px-3 py-2 text-primary text-sm">
      {t("applyToAll",{count:register.length})}
     </button>
    </div>}
   </div>:tab==="notes"?<div className="space-y-3">
    <label className="block text-sm">{t("familyNote")}
     <textarea className={field} rows={3} maxLength={10000} value={body}
      onChange={e=>setBody(e.target.value)}/>
    </label>
    <label className="block text-sm">{t("privateNote")}
     <textarea className={field} rows={3} maxLength={10000} value={privateBody}
      onChange={e=>setPrivateBody(e.target.value)}/>
    </label>
    <label className="flex gap-2 items-center text-sm">
     <input type="checkbox" checked={shareWithContacts}
      onChange={e=>{setShareWithContacts(e.target.checked);if(!e.target.checked)setEmailContacts(false)}}/>
     {t("shareFamilyNote")}
    </label>
    {shareWithContacts&&<div>
     <label className="flex gap-2 items-center text-sm">
      <input type="checkbox" checked={emailContacts} aria-describedby="note-contact-email-hint"
       onChange={e=>setEmailContacts(e.target.checked)}/>
      {t("queueFamilyNoteEmail")}
     </label>
     <p id="note-contact-email-hint" className="mt-1 text-xs text-muted">{t("ambiguousContactEmailHint")}</p>
    </div>}
    <button disabled={busy} onClick={saveNotes}
     className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm">
     {busy?t("saving"):t("saveNotes")}
    </button>
   </div>:<div className="space-y-3">
    <p className="text-xs text-muted">
     {t("rescheduleHint")}
    </p>
    <div className="grid sm:grid-cols-3 gap-3">
     <label className="text-sm">{t("date")}
      <input type="date" className={field} value={moveDate}
       onChange={e=>setMoveDate(e.target.value)}/></label>
     <label className="text-sm">{t("localTimeZone",{zone:open.local_timezone||workplaceTimezones[open.workplace_id]||timezone})}
      <input type="time" className={field} value={moveTime}
       onChange={e=>setMoveTime(e.target.value)}/></label>
     <label className="text-sm">{t("duration")}
      <input type="number" className={field} min={15} max={480}
       value={moveDuration} onChange={e=>setMoveDuration(Number(e.target.value))}/></label>
    </div>
    <label className="flex items-center gap-2 text-sm">
     <input type="checkbox" checked={moveHomeVisit}
      onChange={e=>setMoveHomeVisit(e.target.checked)}/>
     {t("homeVisit")}
    </label>
    <div className="flex flex-wrap gap-3">
     <button disabled={busy||open.status!=="scheduled"} onClick={saveSchedule}
      className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
      {t("saveSessionChanges")}
     </button>
     <button disabled={busy||open.status!=="scheduled"} onClick={cancelTeachingSession}
      className="rounded-lg border border-warning px-4 py-2 text-sm text-warning">
      {t("cancelTeachingSession")}
     </button>
    </div>
   </div>}
  </div>}
 </div>
 </div>;
}
