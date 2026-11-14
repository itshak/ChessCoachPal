"use client";
import {useState} from "react";
type Chapter={study_id:string;chapter_id:string;chapter_number:number;
 study_name:string;chapter_name:string;white_player:string|null;black_player:string|null;
 verified_at:string;stale:boolean;chapterUrl:string;};
type Preview={canCommit:boolean;issues:string[];selectedStudentIds:string[];
 studentCoverageCount:number;uniqueWorkplaceLessonCount:number;inferredMastery:boolean;
 proposedCommit:Record<string,unknown>|null;warning:string;};
const field="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground";
const button="rounded-lg bg-primary px-3 py-2 text-white font-medium disabled:opacity-50";
export function StudyChapterEvidencePanel(){
 const [studyId,setStudyId]=useState("");
 const [query,setQuery]=useState("");
 const [ordinal,setOrdinal]=useState("");
 const [chapters,setChapters]=useState<Chapter[]>([]);
 const [chapterId,setChapterId]=useState("");
 const [sessionId,setSessionId]=useState("");
 const [stage,setStage]=useState<"assigned"|"taught">("assigned");
 const [note,setNote]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const invalid=()=>{setPreview(null);setApproved(false);setNotice("");};
 async function sync(){
  setBusy(true);setError("");invalid();
  try{
   const res=await fetch("/api/lichess/chapter-index",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({studyId,confirmedExternal:true}),
   });
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"Could not authorize chapter index");
   setNotice("Indexed "+data.chapterCount+" actual Lichess chapters without storing private PGN.");
   await search();
  }catch(e){setError(e instanceof Error?e.message:"Provider sync failed");}
  finally{setBusy(false);}
 }
 async function search(){
  setError("");invalid();
  try{
   const params=new URLSearchParams();
   if(studyId)params.set("studyId",studyId);
   if(query.trim())params.set("query",query.trim());
   if(ordinal.trim())params.set("chapterNumber",ordinal.trim());
   const res=await fetch("/api/lichess/chapter-index?"+params.toString(),{cache:"no-store"});
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Indexed chapter lookup failed");
   setChapters(body.matches as Chapter[]);setChapterId("");
   if(body.truncated)setNotice("More chapters match. Refine the search before choosing a chapter.");
  }catch(e){setError(e instanceof Error?e.message:"Chapter search failed");}
 }
 async function inspect(){
  setBusy(true);setError("");invalid();
  try{
   const res=await fetch("/api/coaching/chapter-evidence",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"preview",sessionId,studyId,chapterId,stage,note}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Unable to preview teaching evidence");
   setPreview(body as Preview);
  }catch(e){setError(e instanceof Error?e.message:"Preview failed");}
  finally{setBusy(false);}
 }
 async function commit(){
  if(!preview?.canCommit||!preview.proposedCommit||!approved)return;
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/coaching/chapter-evidence",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"commit",...preview.proposedCommit,
      confirmed:true,requestId:crypto.randomUUID()}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Teaching evidence not committed");
   setNotice("Recorded "+body.participantCoverages+
    " explicit student coverages for one canonical lesson. No mastery assumed.");
   setPreview(null);setApproved(false);
  }catch(e){setError(e instanceof Error?e.message:"Commit failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="Study chapter evidence" className="rounded-xl border border-border bg-surface p-4 space-y-4">
  <div><h2 className="text-lg font-semibold">Verified Lichess chapters → coaching lesson</h2>
   <p className="text-sm text-muted">Connect your teacher Lichess study:read account above. Sync an exact study ID,
    then search chapter names, players, or chapter numbers (such as game 32). The preview shows all frozen learners.
    Reading or linking a chapter never asserts understanding.</p>
  </div>
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-sm">Lichess study ID (8 characters)
    <input className={field} value={studyId} maxLength={8} placeholder="abc123XY"
     onChange={e=>{setStudyId(e.target.value);invalid();}} /></label>
   <label className="text-sm">Name, White/Black player, event
    <input className={field} value={query} onChange={e=>{setQuery(e.target.value);invalid();}} /></label>
   <label className="text-sm">Chapter ordinal (optional)
    <input className={field} type="number" min={1} max={64} value={ordinal}
     onChange={e=>{setOrdinal(e.target.value);invalid();}} /></label>
  </div>
  <div className="flex gap-2 flex-wrap">
   <button type="button" className={button} disabled={busy||!/^[A-Za-z0-9]{8}$/.test(studyId)}
    onClick={()=>void sync()}>Sync verified study metadata</button>
   <button type="button" className={button} disabled={busy} onClick={()=>void search()}>
    Search cached chapters</button>
  </div>
  {chapters.length>0&&<label className="block text-sm">Exact indexed chapter
   <select className={field} value={chapterId} onChange={e=>{setChapterId(e.target.value);invalid();}}>
    <option value="">Select verified chapter</option>
    {chapters.map(x=><option key={x.study_id+":"+x.chapter_id} value={x.chapter_id}>
     #{x.chapter_number} {x.chapter_name} {x.white_player??""} – {x.black_player??""}
     {x.stale?" (stale: re-sync)":" "}
    </option>)}
   </select>
  </label>}
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-sm">Canonical lesson/session ID
    <input className={field} value={sessionId} placeholder="Lesson UUID"
     onChange={e=>{setSessionId(e.target.value);invalid();}} /></label>
   <label className="text-sm">Record what happened
    <select className={field} value={stage} onChange={e=>{setStage(e.target.value as "assigned"|"taught");invalid();}}>
     <option value="assigned">Assigned / shared (does not prove teaching)</option>
     <option value="taught">Taught (completed lesson only)</option>
    </select>
   </label>
   <label className="text-sm">Teacher note (optional)
    <input className={field} value={note} maxLength={2000}
     onChange={e=>{setNote(e.target.value);invalid();}} /></label>
  </div>
  <button type="button" className={button} disabled={busy||!chapterId||!sessionId}
   onClick={()=>void inspect()}>Preview frozen-roster material evidence</button>
  {preview&&<div className="border-t border-border pt-3 text-sm space-y-3">
   <p>Lesson: {preview.uniqueWorkplaceLessonCount} instructor session, {preview.studentCoverageCount} student coverages.</p>
   <p>Frozen student IDs: {preview.selectedStudentIds.join(", ")}</p>
   <p>{preview.warning}</p>
   {preview.issues.map(x=><p key={x} role="alert" className="text-error">{x}</p>)}
   {preview.canCommit&&<><label className="flex gap-2 items-start">
     <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
     I verified the Lichess chapter, lesson, roster, and the assigned/taught statement.
    </label><button type="button" className={button} disabled={!approved||busy}
      onClick={()=>void commit()}>Confirm one atomic evidence record per learner</button></>}
  </div>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
