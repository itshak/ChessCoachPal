"use client";
import {useState} from "react";
import {useTranslations} from "next-intl";
type Chapter={study_id:string;chapter_id:string;chapter_number:number;
 study_name:string;chapter_name:string;white_player:string|null;black_player:string|null;
 verified_at:string;stale:boolean;chapterUrl:string;};
type Preview={canCommit:boolean;issues:string[];selectedStudentIds:string[];
 studentCoverageCount:number;uniqueWorkplaceLessonCount:number;inferredMastery:boolean;
 proposedCommit:Record<string,unknown>|null;warning:string;};
const field="w-full min-w-0 max-w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground";
const button="rounded-lg bg-primary px-3 py-2 text-white font-medium disabled:opacity-50";
export function StudyChapterEvidencePanel(){
 const t=useTranslations("chapterEvidence");
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
   if(!res.ok)throw new Error(data.error??t("syncDenied"));
   setNotice(t("syncReceipt",{count:data.chapterCount}));
   await search();
  }catch(e){setError(e instanceof Error?e.message:t("syncError"));}
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
   if(!res.ok)throw new Error(body.error??t("searchError"));
   setChapters(body.matches as Chapter[]);setChapterId("");
   if(body.truncated)setNotice(t("truncated"));
  }catch(e){setError(e instanceof Error?e.message:t("searchFailed"));}
 }
 async function inspect(){
  setBusy(true);setError("");invalid();
  try{
   const res=await fetch("/api/coaching/chapter-evidence",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"preview",sessionId,studyId,chapterId,stage,note}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??t("previewError"));
   setPreview(body as Preview);
  }catch(e){setError(e instanceof Error?e.message:t("previewFailed"));}
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
   if(!res.ok)throw new Error(body.error??t("commitDenied"));
   setNotice(t("commitReceipt",{count:body.participantCoverages}));
   setPreview(null);setApproved(false);
  }catch(e){setError(e instanceof Error?e.message:t("commitFailed"));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-4 space-y-4">
  <div><h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("description")}</p>
  </div>
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-sm">{t("studyId")}
    <input className={field} value={studyId} maxLength={8} placeholder="abc123XY"
     onChange={e=>{setStudyId(e.target.value);invalid();}} /></label>
   <label className="text-sm">{t("searchBy")}
    <input className={field} value={query} onChange={e=>{setQuery(e.target.value);invalid();}} /></label>
   <label className="text-sm">{t("ordinal")}
    <input className={field} type="number" min={1} max={64} value={ordinal}
     onChange={e=>{setOrdinal(e.target.value);invalid();}} /></label>
  </div>
  <div className="flex gap-2 flex-wrap">
   <button type="button" className={button} disabled={busy||!/^[A-Za-z0-9]{8}$/.test(studyId)}
    onClick={()=>void sync()}>{t("sync")}</button>
   <button type="button" className={button} disabled={busy} onClick={()=>void search()}>
    {t("search")}</button>
  </div>
  {chapters.length>0&&<label className="block text-sm">{t("exactChapter")}
   <select className={field} value={chapterId} onChange={e=>{setChapterId(e.target.value);invalid();}}>
    <option value="">{t("selectChapter")}</option>
    {chapters.map(x=><option key={x.study_id+":"+x.chapter_id} value={x.chapter_id}>
     #{x.chapter_number} {x.chapter_name} {x.white_player??""} – {x.black_player??""}
     {x.stale?t("stale"):" "}
    </option>)}
   </select>
  </label>}
  <div className="grid gap-3 md:grid-cols-3">
   <label className="text-sm">{t("sessionId")}
    <input className={field} value={sessionId} placeholder={t("sessionPlaceholder")}
     onChange={e=>{setSessionId(e.target.value);invalid();}} /></label>
   <label className="text-sm">{t("stage")}
    <select className={field} value={stage} onChange={e=>{setStage(e.target.value as "assigned"|"taught");invalid();}}>
     <option value="assigned">{t("assigned")}</option>
     <option value="taught">{t("taught")}</option>
    </select>
   </label>
   <label className="text-sm">{t("note")}
    <input className={field} value={note} maxLength={2000}
     onChange={e=>{setNote(e.target.value);invalid();}} /></label>
  </div>
  <button type="button" className={button} disabled={busy||!chapterId||!sessionId}
   onClick={()=>void inspect()}>{t("preview")}</button>
  {preview&&<div className="border-t border-border pt-3 text-sm space-y-3">
   <p>{t("lessonCounts",{lessons:preview.uniqueWorkplaceLessonCount,students:preview.studentCoverageCount})}</p>
   <p>{t("frozenIds")} <bdi dir="ltr">{preview.selectedStudentIds.join(", ")}</bdi></p>
   <p>{preview.warning}</p>
   {preview.issues.map(x=><p key={x} role="alert" className="text-error">{x}</p>)}
   {preview.canCommit&&<><label className="flex gap-2 items-start">
     <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
     {t("approval")}
    </label><button type="button" className={button} disabled={!approved||busy}
      onClick={()=>void commit()}>{t("confirm")}</button></>}
  </div>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
