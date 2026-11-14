"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { workplaceLocalToUtc } from "@/lib/coaching-time";

type Workplace = { id:string; name:string; timezone:string };
type Candidate = { id:string; name:string };
type Resolution = {
  input:string; status:"resolved"|"ambiguous"|"not_found";
  studentId:string|null; name:string|null; candidates:Candidate[];
};
type ChapterLinkPreview={
 canCommit:boolean;issues:string[];selectedStudentIds:string[];
 studentCoverageCount:number;uniqueWorkplaceLessonCount:number;
 proposedCommit:null|{
  sessionId:string;studyId:string;chapterId:string;
  stage:"assigned";note:string;expectedVerifiedAt:string;expectedRosterHash:string;
 };
};
type ChapterLinkState={sessionId:string;chapter:NonNullable<Preview["selectedChapter"]>};
type Preview = {
  canCommit:boolean; resolutions:Resolution[];
  issues:Array<{ code:string; message:string; input?:string; candidates?:Candidate[] }>;
  workplace:Workplace|null;
  proposedSession:{
    workplaceId:string;studentIds:string[];title:string;startsAt:string;
    durationMinutes:number;lessonNote:string;
  }|null;
  selectedChapter:null|{studyId:string;chapterId:string;chapterNumber:number;
    studyName:string;chapterName:string;white:string|null;black:string|null;
    verifiedAt:string;chapterUrl:string;attached:false};
  review:{ creates:string;instructorMinutes:number|null; attendance:string; writesPerformed:boolean; timeSource:"explicit"|"weekly_slot";slotIds:string[];localDate:string|null;timezone:string|null };
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
  const [timingMode,setTimingMode] = useState<"explicit"|"weekly">("explicit");
  const [localStart,setLocalStart] = useState("");
  const [localDate,setLocalDate] = useState("");
  const [duration,setDuration] = useState(60);
  const [lessonNote,setLessonNote] = useState("");
  const [studyId,setStudyId] = useState("");
  const [studyName,setStudyName] = useState("");
  const [chapterNumber,setChapterNumber] = useState("");
  const [expectedPlayers,setExpectedPlayers] = useState("");
  const [preview,setPreview] = useState<Preview|null>(null);
  const [approved,setApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [receipt,setReceipt] = useState("");
  const [pendingLink,setPendingLink] = useState<ChapterLinkState|null>(null);
  const [linkReview,setLinkReview] = useState<ChapterLinkPreview|null>(null);
  const [linkApproved,setLinkApproved] = useState(false);
  const [linkedReceipt,setLinkedReceipt] = useState("");
  const linkKeyRef = useRef<string|null>(null);
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

  const invalidate = () => {setPreview(null);setApproved(false);setReceipt("");
    setPendingLink(null);setLinkReview(null);setLinkApproved(false);setLinkedReceipt("");
    linkKeyRef.current=null;};

  async function check(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");setReceipt("");setPreview(null);setApproved(false);
    const workplace=workplaces.find(item=>item.id===workplaceId);
    if(!workplace){setError("Choose a workplace and its time zone");return;}
    const studentNames=names.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    let timing:{startsAt:string;durationMinutes:number}|{localDate:string};
    if(timingMode==="explicit"){
      try {timing={startsAt:workplaceLocalToUtc(localStart,workplace.timezone),
        durationMinutes:duration};}
      catch(e){setError(e instanceof Error?e.message:"Invalid local date or time");return;}
    }else{
      if(!localDate){setError("Choose a real date for weekly schedule inference");return;}
      timing={localDate};
    }
    setBusy(true);
    try {
      const response=await fetch("/api/coaching/lesson-capture/preview",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({names:studentNames,workplaceId,title:title.trim(),
          ...timing,lessonNote,
          ...(studyId.trim()||studyName.trim()?{chapterSelection:{
            ...(studyId.trim()?{studyId:studyId.trim()}:{studyName:studyName.trim()}),
            chapterNumber:Number(chapterNumber),
            ...(expectedPlayers.trim()?{expectedPlayers:expectedPlayers.trim()}:{}),
          }}:{})}),cache:"no-store",
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
      const sessionId=result.data?.id;
      if(!sessionId)throw new Error("Session write returned no confirmed ID; verify session history before retry");
      setReceipt("One session created: "+sessionId+". Attendance remains unmarked.");
      setPendingLink(preview.selectedChapter?{sessionId,chapter:preview.selectedChapter}:null);
      setLinkReview(null);setLinkApproved(false);setLinkedReceipt("");
      linkKeyRef.current=null;
      setPreview(null);setApproved(false);
      requestRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:"Lesson creation failed");}
    finally{setBusy(false);}
  }


  async function reviewChapterAssignment(){
    if(!pendingLink)return;
    setError("");setLinkReview(null);setLinkApproved(false);setBusy(true);
    try{
      const response=await fetch("/api/coaching/chapter-evidence",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"preview",sessionId:pendingLink.sessionId,
          studyId:pendingLink.chapter.studyId,chapterId:pendingLink.chapter.chapterId,
          stage:"assigned",note:"Chapter assigned; no assumption of teaching or mastery",
        }),cache:"no-store",
      });
      const data=await response.json() as ChapterLinkPreview&{error?:string};
      if(!response.ok)throw new Error(data.error??"Chapter evidence preview unavailable");
      setLinkReview(data);
    }catch(e){setError(e instanceof Error?e.message:"Could not review chapter");}
    finally{setBusy(false);}
  }
  async function commitChapterAssignment(){
    if(!linkReview?.canCommit||!linkReview.proposedCommit||!linkApproved)return;
    if(!linkKeyRef.current)linkKeyRef.current=crypto.randomUUID();
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/coaching/chapter-evidence",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"commit",...linkReview.proposedCommit,
          requestId:linkKeyRef.current,confirmed:true,
        }),cache:"no-store",
      });
      const data=await response.json() as {
        participantCoverages?:number;replayed?:boolean;error?:string;
      };
      if(!response.ok)throw new Error(data.error??"Could not assign exact chapter");
      setLinkedReceipt("Verified chapter assigned to "+data.participantCoverages+
        " learners. Attendance and mastery are unchanged.");
      setPendingLink(null);setLinkReview(null);setLinkApproved(false);
      linkKeyRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:"Chapter assignment failed");}
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
      <label className="block text-sm">How to determine lesson time
        <select className={field} value={timingMode} onChange={e=>{
          setTimingMode(e.target.value as "explicit"|"weekly");invalidate();}}>
          <option value="explicit">I know the exact start and duration</option>
          <option value="weekly">Use a unique matching weekly slot (date only)</option>
        </select>
      </label>
      {timingMode==="explicit"?<>
        <label className="block text-sm">Start time in workplace time zone
          <input className={field} type="datetime-local" required value={localStart}
            onChange={e=>{setLocalStart(e.target.value);invalidate();}} />
        </label>
        <label className="block text-sm">Instructor minutes (15–480)
          <input className={field} type="number" min={15} max={480} required value={duration}
            onChange={e=>{setDuration(Number(e.target.value));invalidate();}} />
        </label>
      </>:<label className="block text-sm">Lesson date in workplace time zone
        <input className={field} type="date" required value={localDate}
          onChange={e=>{setLocalDate(e.target.value);invalidate();}} />
      </label>}
      <label className="block text-sm">Shared note (optional)
        <input className={field} value={lessonNote} maxLength={10000}
          onChange={e=>{setLessonNote(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">Lichess study title (optional, exact cached name)
        <input className={field} value={studyName} maxLength={160}
          disabled={Boolean(studyId.trim())}
          placeholder="e.g. Classic Games 2"
          onChange={e=>{setStudyName(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">Lichess study ID (alternative to title)
        <input className={field} value={studyId} minLength={8} maxLength={8}
          disabled={Boolean(studyName.trim())}
          placeholder="8 characters from /study/" pattern="[A-Za-z0-9]{8}"
          onChange={e=>{setStudyId(e.target.value);invalidate();}} />
      </label>
      {(studyId.trim()||studyName.trim())&&<>
        <label className="block text-sm">Chapter number in that study (1–64)
          <input className={field} type="number" min={1} max={64} required
            value={chapterNumber} onChange={e=>{setChapterNumber(e.target.value);invalidate();}} />
        </label>
        <label className="block text-sm">Expected PGN players (optional, for identity check)
          <input className={field} value={expectedPlayers} maxLength={120}
            onChange={e=>{setExpectedPlayers(e.target.value);invalidate();}} />
        </label>
      </>}
      <div><button className={button} type="submit" disabled={busy}>Preview only</button></div>
    </form>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    {receipt&&<p role="status">{receipt}</p>}
    {linkedReceipt&&<p role="status">{linkedReceipt}</p>}
    {pendingLink&&<div className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">Optional second approval: assign selected chapter</h3>
      <p className="text-sm">Session {pendingLink.sessionId} exists. Chapter
        {" "+pendingLink.chapter.studyName+" #"+pendingLink.chapter.chapterNumber}
        {" ("+pendingLink.chapter.chapterId+")"} is not attached yet.
        This separate action records an assignment for the frozen roster,
        never attendance, lesson completion or mastery.</p>
      <button type="button" className={button} disabled={busy}
        onClick={()=>void reviewChapterAssignment()}>Review chapter assignment</button>
      {linkReview&&<>
        <p className="text-sm">Eligible learners: {linkReview.studentCoverageCount}.
          One workplace lesson. {linkReview.canCommit?"Ready for teacher approval.":"Cannot assign: "+linkReview.issues.join(", ")}</p>
        {linkReview.canCommit&&<>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={linkApproved}
              onChange={e=>setLinkApproved(e.target.checked)} />
            I approve assigning this exact indexed chapter to all frozen learners.
          </label>
          <button type="button" className={button} disabled={busy||!linkApproved}
            onClick={()=>void commitChapterAssignment()}>Assign reviewed chapter</button>
        </>}
      </>}
    </div>}
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
      {preview.selectedChapter&&<div className="rounded-lg border border-border p-3 text-sm">
        <p className="font-semibold">Verified indexed chapter — not yet linked</p>
        <p>{preview.selectedChapter.studyName} · #{preview.selectedChapter.chapterNumber} ·
          {" "+preview.selectedChapter.chapterName}</p>
        <p>{preview.selectedChapter.white??"Unknown white"} – {preview.selectedChapter.black??"Unknown black"}</p>
        <p>Source: authorized cached Lichess metadata ({preview.selectedChapter.verifiedAt}). 
          Session material and student mastery are not recorded during this preview.</p>
        <a href={preview.selectedChapter.chapterUrl} target="_blank" rel="noopener noreferrer"
          className="underline">Open verified Lichess chapter</a>
      </div>}
      {preview.canCommit&&preview.proposedSession&&<>
        <p className="text-sm">One {preview.proposedSession.durationMinutes}-minute teacher session,
          {preview.proposedSession.studentIds.length} learners, starting at
          {" "+new Date(preview.proposedSession.startsAt).toLocaleString("en-GB",{
            timeZone:preview.workplace?.timezone??"UTC",dateStyle:"medium",timeStyle:"short"})}
          {" ("+(preview.workplace?.timezone??"UTC")+")"}.
          {preview.review.timeSource==="weekly_slot"?" Time inferred from matching active weekly slots.":" Explicit start time."}
          {" "}Attendance: unmarked. Comprehension: unknown. No changes have been saved yet.</p>
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
