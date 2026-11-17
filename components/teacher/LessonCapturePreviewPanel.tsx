"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {useLocale,useTranslations} from "next-intl";
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
  proposedAtomicCommit:null|{
    workplaceId:string;studentIds:string[];title:string;startsAt:string;
    durationMinutes:number;lessonNote:string;studyId:string;chapterId:string;
    expectedVerifiedAt:string;expectedRosterHash:string;note:string;
  };
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
  const t=useTranslations("lessonCapture"),locale=useLocale();
  const [workplaces,setWorkplaces] = useState<Workplace[]>([]);
  const [workplaceId,setWorkplaceId] = useState("");
  const [names,setNames] = useState("");
  const [title,setTitle] = useState("");
  const [timingMode,setTimingMode] = useState<"explicit"|"weekly">("explicit");
  const [localStart,setLocalStart] = useState("");
  const [localDate,setLocalDate] = useState("");
  const [duration,setDuration] = useState(60);
  const [lessonNote,setLessonNote] = useState("");
  const [useSavedStudy,setUseSavedStudy] = useState(false);
  const [studyId,setStudyId] = useState("");
  const [studyName,setStudyName] = useState("");
  const [chapterNumber,setChapterNumber] = useState("");
  const [expectedPlayers,setExpectedPlayers] = useState("");
  const [preview,setPreview] = useState<Preview|null>(null);
  const [approved,setApproved] = useState(false);
  const [atomicApproved,setAtomicApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [receipt,setReceipt] = useState("");
  const [pendingLink,setPendingLink] = useState<ChapterLinkState|null>(null);
  const [linkReview,setLinkReview] = useState<ChapterLinkPreview|null>(null);
  const [linkApproved,setLinkApproved] = useState(false);
  const [linkedReceipt,setLinkedReceipt] = useState("");
  const atomicKeyRef = useRef<{signature:string;requestId:string;evidenceRequestId:string}|null>(null);
  const linkKeyRef = useRef<string|null>(null);
  const requestRef = useRef<{signature:string;requestId:string}|null>(null);

  useEffect(() => {
    let active=true;
    void fetch("/api/agent/v1",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({action:"workplaces.list"}),cache:"no-store",
    }).then(async response => {
      const result=await response.json() as {data?:Workplace[]};
      if(!response.ok || !result.data) throw new Error(t("loadWorkplaces"));
      if(active)setWorkplaces(result.data);
    }).catch(() => {if(active)setError(t("loadWorkplacesFailed"));});
    return () => {active=false;};
  }, [t]);

  const invalidate = () => {setPreview(null);setApproved(false);setAtomicApproved(false);setReceipt("");
    atomicKeyRef.current=null;
    setPendingLink(null);setLinkReview(null);setLinkApproved(false);setLinkedReceipt("");
    linkKeyRef.current=null;};

  async function check(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");setReceipt("");setPreview(null);setApproved(false);setAtomicApproved(false);atomicKeyRef.current=null;
    const workplace=workplaces.find(item=>item.id===workplaceId);
    if(!workplace){setError(t("chooseWorkplace"));return;}
    const studentNames=names.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    let timing:{startsAt:string;durationMinutes:number}|{localDate:string};
    if(timingMode==="explicit"){
      try {timing={startsAt:workplaceLocalToUtc(localStart,workplace.timezone),
        durationMinutes:duration};}
      catch(e){setError(e instanceof Error?e.message:t("invalidLocalTime"));return;}
    }else{
      if(!localDate){setError(t("chooseDate"));return;}
      timing={localDate};
    }
    setBusy(true);
    try {
      const response=await fetch("/api/coaching/lesson-capture/preview",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({names:studentNames,workplaceId,title:title.trim(),
          ...timing,lessonNote,
          ...(useSavedStudy||studyId.trim()||studyName.trim()?{chapterSelection:{
            ...(useSavedStudy?{}:studyId.trim()?{studyId:studyId.trim()}:{studyName:studyName.trim()}),
            chapterNumber:Number(chapterNumber),
            ...(expectedPlayers.trim()?{expectedPlayers:expectedPlayers.trim()}:{}),
          }}:{})}),cache:"no-store",
      });
      const result=await response.json() as Preview&{error?:string};
      if(!response.ok)throw new Error(result.error??t("previewUnavailable"));
      setPreview(result);
      requestRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:t("previewFailed"));}
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
        throw new Error(result.error?.message??result.error?.code??t("lessonCreateFailed"));
      const sessionId=result.data?.id;
      if(!sessionId)throw new Error(t("noSessionId"));
      setReceipt(t("createdReceipt",{id:sessionId}));
      setPendingLink(preview.selectedChapter?{sessionId,chapter:preview.selectedChapter}:null);
      setLinkReview(null);setLinkApproved(false);setLinkedReceipt("");
      linkKeyRef.current=null;
      setPreview(null);setApproved(false);
      requestRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:t("lessonCreateFailed"));}
    finally{setBusy(false);}
  }


  async function confirmAtomic(){
    if(!preview?.canCommit||!preview.proposedAtomicCommit||!approved||!atomicApproved)return;
    const payload=preview.proposedAtomicCommit;
    const signature=JSON.stringify(payload);
    if(atomicKeyRef.current?.signature!==signature){
      atomicKeyRef.current={signature,requestId:crypto.randomUUID(),
        evidenceRequestId:crypto.randomUUID()};
    }
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/coaching/lesson-capture/commit",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...payload,requestId:atomicKeyRef.current.requestId,
          evidenceRequestId:atomicKeyRef.current.evidenceRequestId,confirmed:true}),
        cache:"no-store",
      });
      const body=await response.json() as {error?:string;replayed?:boolean;
        oneTransaction?:boolean;session?:{id:string};
        evidence?:{participantCoverages:number;inferredMastery:boolean}};
      if(!response.ok||!body.oneTransaction||!body.session?.id)
        throw new Error(body.error??t("atomicUnavailable"));
      setReceipt(t("atomicReceipt",{id:body.session.id,count:body.evidence?.participantCoverages??0})+
        (body.replayed?" "+t("safeReplay"):""));
      setPendingLink(null);setLinkReview(null);setLinkApproved(false);
      setPreview(null);setApproved(false);setAtomicApproved(false);
      atomicKeyRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:t("atomicFailed"));}
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
      if(!response.ok)throw new Error(data.error??t("chapterUnavailable"));
      setLinkReview(data);
    }catch(e){setError(e instanceof Error?e.message:t("chapterReviewFailed"));}
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
      if(!response.ok)throw new Error(data.error??t("chapterAssignUnavailable"));
      setLinkedReceipt(t("chapterAssigned",{count:data.participantCoverages??0}));
      setPendingLink(null);setLinkReview(null);setLinkApproved(false);
      linkKeyRef.current=null;
    }catch(e){setError(e instanceof Error?e.message:t("chapterAssignFailed"));}
    finally{setBusy(false);}
  }

  return <section className="rounded-xl border border-border bg-surface p-5 space-y-4" aria-label={t("aria")}>
    <div>
      <h2 className="font-semibold text-lg">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("intro")}
      </p>
    </div>
    <form onSubmit={check} className="grid gap-3 md:grid-cols-2">
      <label className="block text-sm">{t("names")}
        <textarea className={field} rows={3} required value={names}
          onChange={e=>{setNames(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">{t("workplace")}
        <select className={field} required value={workplaceId}
          onChange={e=>{setWorkplaceId(e.target.value);invalidate();}}>
          <option value="">{t("selectWorkplace")}</option>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name} ({w.timezone})</option>)}
        </select>
      </label>
      <label className="block text-sm">{t("lessonTitle")}
        <input className={field} value={title} required maxLength={160}
          onChange={e=>{setTitle(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">{t("timeMode")}
        <select className={field} value={timingMode} onChange={e=>{
          setTimingMode(e.target.value as "explicit"|"weekly");invalidate();}}>
          <option value="explicit">{t("explicit")}</option>
          <option value="weekly">{t("weekly")}</option>
        </select>
      </label>
      {timingMode==="explicit"?<>
        <label className="block text-sm">{t("startTime")}
          <input className={field} type="datetime-local" required value={localStart}
            onChange={e=>{setLocalStart(e.target.value);invalidate();}} />
        </label>
        <label className="block text-sm">{t("duration")}
          <input className={field} type="number" min={15} max={480} required value={duration}
            onChange={e=>{setDuration(Number(e.target.value));invalidate();}} />
        </label>
      </>:<label className="block text-sm">{t("lessonDate")}
        <input className={field} type="date" required value={localDate}
          onChange={e=>{setLocalDate(e.target.value);invalidate();}} />
      </label>}
      <label className="block text-sm">{t("sharedNote")}
        <input className={field} value={lessonNote} maxLength={10000}
          onChange={e=>{setLessonNote(e.target.value);invalidate();}} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useSavedStudy}
          onChange={e=>{setUseSavedStudy(e.target.checked);setStudyId("");setStudyName("");invalidate();}} />
        {t("resolveSaved")}
      </label>
      <label className="block text-sm">{t("studyTitle")}
        <input className={field} value={studyName} maxLength={160}
          disabled={useSavedStudy||Boolean(studyId.trim())}
          placeholder={t("studyTitleHint")}
          onChange={e=>{setStudyName(e.target.value);invalidate();}} />
      </label>
      <label className="block text-sm">{t("studyId")}
        <input dir="ltr" className={field} value={studyId} minLength={8} maxLength={8}
          disabled={useSavedStudy||Boolean(studyName.trim())}
          placeholder={t("studyIdHint")} pattern="[A-Za-z0-9]{8}"
          onChange={e=>{setStudyId(e.target.value);invalidate();}} />
      </label>
      {(useSavedStudy||studyId.trim()||studyName.trim())&&<>
        <label className="block text-sm">{t("chapterNumber")}
          <input className={field} type="number" min={1} max={64} required
            value={chapterNumber} onChange={e=>{setChapterNumber(e.target.value);invalidate();}} />
        </label>
        <label className="block text-sm">{t("players")}
          <input className={field} value={expectedPlayers} maxLength={120}
            onChange={e=>{setExpectedPlayers(e.target.value);invalidate();}} />
        </label>
      </>}
      <div><button className={button} type="submit" disabled={busy}>{t("previewOnly")}</button></div>
    </form>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    {receipt&&<p role="status">{receipt}</p>}
    {linkedReceipt&&<p role="status">{linkedReceipt}</p>}
    {pendingLink&&<div className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">{t("pendingTitle")}</h3>
      <p className="text-sm" dir="auto">{t("pendingInfo",{
          session:pendingLink.sessionId,studyName:pendingLink.chapter.studyName,
          number:pendingLink.chapter.chapterNumber,chapterId:pendingLink.chapter.chapterId
        })}</p>
      <button type="button" className={button} disabled={busy}
        onClick={()=>void reviewChapterAssignment()}>{t("reviewChapter")}</button>
      {linkReview&&<>
        <p className="text-sm">{t("eligible",{count:linkReview.studentCoverageCount})}{" "}
          {linkReview.canCommit?t("ready"):t("cannotAssign",{issues:linkReview.issues.join(", ")})}</p>
        {linkReview.canCommit&&<>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={linkApproved}
              onChange={e=>setLinkApproved(e.target.checked)} />
            {t("approveChapter")}
          </label>
          <button type="button" className={button} disabled={busy||!linkApproved}
            onClick={()=>void commitChapterAssignment()}>{t("assignChapter")}</button>
        </>}
      </>}
    </div>}
    {preview&&<div className="space-y-3 border-t border-border pt-4" aria-live="polite">
      <h3 className="font-semibold">{t("reviewTitle")}</h3>
      <ul className="list-disc ps-5 text-sm">
        {preview.resolutions.map((r,i)=><li key={i}>
          <bdi dir="auto">{r.input}</bdi>: {r.status==="resolved"?
             <><bdi dir="auto">{r.name}</bdi>{" ("}<bdi dir="ltr">{r.studentId}</bdi>{")"}</>:
             t(r.status==="ambiguous"?"ambiguous":"notFound")}
          {r.candidates.length>0&&" — "+r.candidates.map(c=>c.name+" ["+c.id+"]").join(", ")}
        </li>)}
      </ul>
      {preview.issues.map((issue,i)=><p key={i} role="alert" className="text-sm text-amber-500">
        {issue.code}: {issue.message}{issue.candidates?.length?
          " — "+issue.candidates.map(c=>c.name+" ["+c.id+"]").join(", "):""}
      </p>)}
      {preview.selectedChapter&&<div className="rounded-lg border border-border p-3 text-sm">
        <p className="font-semibold">{t("verifiedChapter")}</p>
        <p><bdi dir="auto">{preview.selectedChapter.studyName}</bdi> ·
          #{preview.selectedChapter.chapterNumber} ·
          <bdi dir="auto">{preview.selectedChapter.chapterName}</bdi></p>
        <p><bdi dir="auto">{preview.selectedChapter.white??t("unknownWhite")}</bdi>
          {" – "}<bdi dir="auto">{preview.selectedChapter.black??t("unknownBlack")}</bdi></p>
        <p>{t("cachedMetadata",{time:preview.selectedChapter.verifiedAt})}</p>
        <a href={preview.selectedChapter.chapterUrl} target="_blank" rel="noopener noreferrer"
          className="underline">{t("openChapter")}</a>
      </div>}
      {preview.canCommit&&preview.proposedSession&&<>
        <p className="text-sm">{t("proposedSession",{
          minutes:preview.proposedSession.durationMinutes,
          learners:preview.proposedSession.studentIds.length,
          start:new Date(preview.proposedSession.startsAt).toLocaleString(
            locale==="en"?"en-GB":locale,{
            timeZone:preview.workplace?.timezone??"UTC",dateStyle:"medium",timeStyle:"short"}),
          zone:preview.workplace?.timezone??"UTC"
        })}{" "}{preview.review.timeSource==="weekly_slot"?t("timeInferred"):t("timeExplicit")}{" "}
        {t("noWrites")}</p>
        <label className="flex gap-2 items-start text-sm">
          <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
          {t("approveSession")}
        </label>
        <button className={button} type="button" disabled={!approved||busy} onClick={()=>void confirm()}>
          {t("confirmLesson")}
        </button>
        {preview.proposedAtomicCommit&&<>
          <label className="flex gap-2 items-start text-sm">
            <input type="checkbox" checked={atomicApproved}
              onChange={e=>setAtomicApproved(e.target.checked)} />
            {t("approveAtomic")}
          </label>
          <button className={button} type="button"
            disabled={!approved||!atomicApproved||busy}
            onClick={()=>void confirmAtomic()}>
          {t("confirmAtomic")}
          </button>
        </>}
      </>}
    </div>}
  </section>;
}
