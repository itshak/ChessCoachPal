"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { workplaceLocalToUtc } from "@/lib/coaching-time";

type Workplace = { id:string; name:string; timezone:string };
type Candidate = { id:string; name:string };
type Resolution = {
  input:string; status:"resolved"|"ambiguous"|"not_found";
  studentId:string|null; name:string|null; candidates:Candidate[];
};
type Preview = {
  canCommit:boolean; resolutions:Resolution[];
  issues:Array<{ code:string; message:string; input?:string; candidates?:Candidate[] }>;
  workplace:Workplace|null;
  proposedSession:{
    workplaceId:string;studentIds:string[];title:string;startsAt:string;
    durationMinutes:number;lessonNote:string;
  }|null;
  review:{ creates:string;instructorMinutes:number; attendance:string; writesPerformed:boolean };
};

const field = "w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button = "rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";

/**
 * The website and the assistant share a single read-only preview service.
 * This panel never assumes a nickname, guesses a local time or marks attendance.
 */
export function LessonCapturePreviewPanel() {
  const [workplaces,setWorkplaces] = useState<Workplace[]>([]);
  const [workplaceId,setWorkplaceId] = useState("");
  const [names,setNames] = useState("");
  const [title,setTitle] = useState("");
  const [localStart,setLocalStart] = useState("");
  const [duration,setDuration] = useState(60);
  const [lessonNote,setLessonNote] = useState("");
  const [preview,setPreview] = useState<Preview|null>(null);
  const [approved,setApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [receipt,setReceipt] = useState("");
  const requestRef = useRef<{signature:string;requestId:string}|null>(null);

  useEffect(() => {
    let active=true;
    void fetch("/api/agent/v1",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"workplaces.list"}),cache:"no-store",
    }).then(async response => {
      const result=await response.json() as {data?:Workplace[]};
      if(!response.ok || !result.data) throw new Error("Could not load workplaces");
      if(active)setWorkplaces(result.data);
    }).catch(() => {if(active)setError("Unable to load workplace list");});
    return () => {active=false;};
  }, []);

  const invalidate = () => {setPreview(null);setApproved(false);setReceipt("");};

  async function check(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");setReceipt("");setPreview(null);setApproved(false);
    const workplace=workplaces.find(item=>item.id===workplaceId);
    if(!workplace){setError("Choose a workplace and its time zone");return;}
    let startsAt:string;
    try {startsAt=workplaceLocalToUtc(localStart,workplace.timezone);}
    catch(e){setError(e instanceof Error?e.message:"Invalid local date or time");return;}
    const studentNames=names.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    setBusy(true);
    try {
      const response=await fetch("/api/coaching/lesson-capture/preview",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({names:studentNames,workplaceId,title:title.trim(),
          startsAt,durationMinutes:duration,lessonNote}),cache:"no-store",
      });
      const result=await response.json() as Preview&{error?:string};
      if(!response.ok)throw new Error(result.error??"Unable to preview lesson");
      setPreview(result);
      requestRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:"Preview failed");}
    finally{setBusy(false);}
  }

  async function confirm() {
    if(!preview?.canCommit || !preview.proposedSession || !approved)return;
    const payload=preview.proposedSession;
    const signature=JSON.stringify(payload);
    if(requestRef.current?.signature!==signature)
      requestRef.current={signature,requestId:crypto.randomUUID()};
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/agent/v1",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"sessions.createAdHoc",...payload,
          requestId:requestRef.current.requestId}),cache:"no-store",
      });
      const result=await response.json() as {ok?:boolean;error?:{message?:string;code?:string};data?:{id?:string}};
      if(!response.ok || !result.ok)
        throw new Error(result.error?.message??result.error?.code??"Lesson creation failed");
      setReceipt("One session created. Attendance remains unmarked; review the session to complete it.");
      setPreview(null);setApproved(false);
      requestRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:"Lesson creation failed");}
    finally{setBusy(false);}
  }

  return <section className="rounded-xl border border-border bg-surface p-5 space-y-4" aria-label="Multi-student lesson capture">
    <div>
      <h2 className="font-semibold text-lg">Capture a lesson from student names</h2>
      <p className="text-sm text-muted-foreground">
        Enter one name or Hebrew/English alias per line. Preview exact identities before
        creating a single frozen-roster lesson. No attendance or mastery is assumed.
      </p>
    </div>
    <form onSubmit={check} className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm">Student names, one per line (2–50)
        <textarea className={field} rows={3} required value={names}
          onChange={e=>{setNames(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">Workplace / time zone
        <select className={field} required value={workplaceId}
          onChange={e=>{setWorkplaceId(e.target.value);invalidate();}}>
          <option value="">Select workplace</option>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name} ({w.timezone})</option>)}
        </select>
      </label>
      <label className="block text-sm">Lesson title
        <input className={field} value={title} required maxLength={160}
          onChange={e=>{setTitle(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">Start time in workplace time zone
        <input className={field} type="datetime-local" required value={localStart}
          onChange={e=>{setLocalStart(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">Instructor minutes (15–480)
        <input className={field} type="number" min={15} max={480} required value={duration}
          onChange={e=>{setDuration(Number(e.target.value));invalidate();}} />
      </label>
      <label className="block text-sm">Shared note (optional)
        <input className={field} value={lessonNote} maxLength={10000}
          onChange={e=>{setLessonNote(e.target.value);invalidate();}} />
      </label>
      <div><button className={button} type="submit" disabled={busy}>Preview only</button></div>
    </form>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    {receipt&&<p role="status">{receipt}</p>}
    {preview&&<div className="space-y-3 border-t border-border pt-4" aria-live="polite">
      <h3 className="font-semibold">Identity and enrollment review</h3>
      <ul className="list-disc pl-5 text-sm">
        {preview.resolutions.map((r,i)=><li key={i}>
          {r.input}: {r.status==="resolved"?r.name+" ("+r.studentId+")":r.status}
          {r.candidates.length>0&&" — "+r.candidates.map(c=>c.name+" ["+c.id+"]").join(", ")}
        </li>)}
      </ul>
      {preview.issues.map((issue,i)=><p key={i} role="alert" className="text-sm text-amber-500">
        {issue.code}: {issue.message}{issue.candidates?.length?
          " — "+issue.candidates.map(c=>c.name+" ["+c.id+"]").join(", "):""}
      </p>)}
      {preview.canCommit&&preview.proposedSession&&<>
        <p className="text-sm">One {preview.proposedSession.durationMinutes}-minute teacher session,
          {preview.proposedSession.studentIds.length} learners. Attendance: unmarked.
          Comprehension: unknown. No changes have been saved yet.</p>
        <label className="flex gap-2 items-start text-sm">
          <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
          I checked every learner, the workplace, date and time and approve creating this session.
        </label>
        <button className={button} type="button" disabled={!approved||busy} onClick={()=>void confirm()}>
          Confirm and create one lesson
        </button>
      </>}
    </div>}
  </section>;
}
