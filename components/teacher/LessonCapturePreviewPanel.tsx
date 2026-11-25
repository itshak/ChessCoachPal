"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {useLocale,useTranslations} from "next-intl";
import { workplaceLocalToUtc } from "@/lib/coaching-time";
import {CompletedArchivedRecoveryPanel,type CompletedRecoveryPhase} from "@/components/teacher/CompletedArchivedRecoveryPanel";

type Workplace = { id:string; name:string; timezone:string };
type Candidate = { id:string; name:string; archived?:boolean };
type Resolution = {
  input:string; status:"resolved"|"ambiguous"|"not_found"|"archived"; archived?:boolean|null;
  studentId:string|null; name:string|null; candidates:Candidate[];
};
type RecoveryPreview={
 canCommit:boolean;issues:Array<{code:string;message:string;studentId?:string}>;
 workplace:{id:string;name:string}|null;
 capacity:null|{requestedReactivations:number;remaining:number|null;blocked:boolean};
 reactivations:Array<{studentId:string;name:string;expectedUpdatedAt:string;
  previousWorkplaceIds:string[];creditPolicy:string;
  creditNotice:null|{packagesWithUnusedUnits:number;expiredBeforeLesson:number;
   scopedToAnotherWorkplace:number}}>;
 proposedCommit:null|{workplaceId:string;studentIds:string[];title:string;
  startsAt:string;durationMinutes:number;lessonNote:string;
  reactivations:Array<{studentId:string;expectedUpdatedAt:string}>};
 review:{writesPerformed:boolean;attendance:string;credits:string;reactivationCount:number};
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
  archivedRecovery?:{reviewHistory:{learners:Array<{studentId:string;name:string;path:string}>}}|null;
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
  review:{ captureState:"awaiting_confirmation"|"learner_review_required"|"other_review_required"; unresolvedInputs:number; duplicateReference:boolean; creates:string;instructorMinutes:number|null; attendance:string; writesPerformed:boolean; timeSource:"explicit"|"weekly_slot";slotIds:string[];localDate:string|null;timezone:string|null };
};

const field = "w-full min-w-0 max-w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button = "rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";

/**
 * The website and the assistant share a single read-only preview service.
 * This panel never assumes a nickname, guesses a local time or marks attendance.
 */
export function LessonCapturePreviewPanel({initialWorkplaceId=null,initialWorkplaces}:{initialWorkplaceId?:string|null;initialWorkplaces?:Workplace[]}={}) {
  const t=useTranslations("lessonCapture"),locale=useLocale();
  const toUserError=useLocalizedApiError();
  const [workplaces,setWorkplaces] = useState<Workplace[]>(initialWorkplaces??[]);
  const [workplaceId,setWorkplaceId] = useState(initialWorkplaceId??"");
  const [names,setNames] = useState("");
  const namesRef=useRef<HTMLTextAreaElement>(null);
  const learnerChoicesRef=useRef<HTMLUListElement>(null);
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
  const [studentChoices,setStudentChoices]=useState<Record<number,string>>({});
  const previewGeneration=useRef(0);
  const [completedPhase,setCompletedPhase]=useState<CompletedRecoveryPhase>("idle");
  const completedPhaseRef=useRef<CompletedRecoveryPhase>("idle");
  const completedLocked=completedPhase!=="idle";
  const completedGeneration=previewGeneration.current;
  const [recoveryKind,setRecoveryKind]=useState<"scheduled"|"completed">("scheduled");
  const [recoveryPreview,setRecoveryPreview] = useState<RecoveryPreview|null>(null);
  const [recoveryReason,setRecoveryReason] = useState("");
  const [recoveryApproved,setRecoveryApproved] = useState(false);
  const [recoveryUnconfirmed,setRecoveryUnconfirmed]=useState(false);
  const recoveryLocked=completedLocked||recoveryUnconfirmed;
  const recoveryKeyRef = useRef<{signature:string;requestId:string}|null>(null);
  const [approved,setApproved] = useState(false);
  const [atomicApproved,setAtomicApproved] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [receipt,setReceipt] = useState("");
  const receiptRef=useRef<HTMLParagraphElement>(null);
  const focusCompletedReceipt=useRef(false);
  useEffect(()=>{
    if(receipt&&focusCompletedReceipt.current){
      focusCompletedReceipt.current=false;receiptRef.current?.focus();
    }
  },[receipt]);
  const [pendingLink,setPendingLink] = useState<ChapterLinkState|null>(null);
  const [linkReview,setLinkReview] = useState<ChapterLinkPreview|null>(null);
  const [linkApproved,setLinkApproved] = useState(false);
  const [linkedReceipt,setLinkedReceipt] = useState("");
  const atomicKeyRef = useRef<{signature:string;requestId:string;evidenceRequestId:string}|null>(null);
  const linkKeyRef = useRef<string|null>(null);
  const requestRef = useRef<{signature:string;requestId:string}|null>(null);

  useEffect(() => {
    if(initialWorkplaces)return;
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
  }, [t,initialWorkplaces]);

  const invalidate = () => {previewGeneration.current++;setRecoveryKind("scheduled");setStudentChoices({});setPreview(null);setApproved(false);setAtomicApproved(false);setReceipt("");
    setRecoveryPreview(null);setRecoveryApproved(false);recoveryKeyRef.current=null;
    atomicKeyRef.current=null;
    setPendingLink(null);setLinkReview(null);setLinkApproved(false);setLinkedReceipt("");
    linkKeyRef.current=null;};

  function exitArchiveReview(chooseAnother:boolean){
    if(busy||recoveryLocked)return;
    invalidate();setError("");setRecoveryReason("");
    if(chooseAnother)namesRef.current?.focus();
    else{focusCompletedReceipt.current=true;setReceipt(t("recoveryKept"));}
  }

  function check(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(completedPhaseRef.current!=="idle"||recoveryUnconfirmed)return;
    setStudentChoices({});
    void requestPreview({});
  }

  async function requestPreview(choices:Record<number,string>) {
    if(completedPhaseRef.current!=="idle"||recoveryUnconfirmed)return;
    const generation=++previewGeneration.current;
    setRecoveryKind("scheduled");
    setError("");setReceipt("");setPreview(null);setApproved(false);setAtomicApproved(false);atomicKeyRef.current=null;
    setRecoveryPreview(null);setRecoveryApproved(false);recoveryKeyRef.current=null;
    const workplace=workplaces.find(item=>item.id===workplaceId);
    if(!workplace){setError(t("chooseWorkplace"));return;}
    const studentNames=names.split(/\r?\n/).map(n=>n.trim()).filter(Boolean);
    let timing:{startsAt:string;durationMinutes:number}|{localDate:string};
    if(timingMode==="explicit"){
      try {timing={startsAt:workplaceLocalToUtc(localStart,workplace.timezone),
        durationMinutes:duration};}
      catch(e){setError(toUserError(e, t("invalidLocalTime")));return;}
    }else{
      if(!localDate){setError(t("chooseDate"));return;}
      timing={localDate};
    }
    setBusy(true);
    try {
      const response=await fetch("/api/coaching/lesson-capture/preview",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({names:studentNames,workplaceId,title:title.trim(),
          studentChoices:Object.entries(choices).filter(([,studentId])=>studentId)
            .map(([index,studentId])=>({index:Number(index),studentId})),
          ...timing,lessonNote,
          ...(useSavedStudy||studyId.trim()||studyName.trim()?{chapterSelection:{
            ...(useSavedStudy?{}:studyId.trim()?{studyId:studyId.trim()}:{studyName:studyName.trim()}),
            chapterNumber:Number(chapterNumber),
            ...(expectedPlayers.trim()?{expectedPlayers:expectedPlayers.trim()}:{}),
          }}:{})}),cache:"no-store",
      });
      const result=await response.json() as Preview&{error?:string};
      if(generation!==previewGeneration.current)return;
      if(!response.ok)throw new Error(result.error??t("previewUnavailable"));
      setPreview(result);
      requestRef.current=null;
    }catch(e){setError(toUserError(e, t("previewFailed")));}
    finally{setBusy(false);}
  }

  async function reviewArchivedRecovery(){
    if(!preview||!workplaceId||timingMode!=="explicit"||recoveryUnconfirmed)return;
    const w=workplaces.find(w=>w.id===workplaceId);
    if(!w)return;
    const ids=preview.resolutions.map(r=>r.studentId);
    if(ids.some(id=>id===null))return;
    const generation=previewGeneration.current;
    let startsAt:string;
    try{startsAt=workplaceLocalToUtc(localStart,w.timezone);}
    catch(e){setError(toUserError(e,t("invalidLocalTime")));return;}
    setBusy(true);setError("");setRecoveryPreview(null);setRecoveryApproved(false);
    try{
      const response=await fetch("/api/coaching/lesson-capture/recovery/preview",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workplaceId,studentIds:ids,title:title.trim(),
          startsAt,durationMinutes:duration,lessonNote}),cache:"no-store",
      });
      const body=await response.json() as RecoveryPreview&{error?:string};
      if(generation!==previewGeneration.current)return;
      if(!response.ok)throw new Error(body.error??t("recoveryDenied"));
      setRecoveryPreview(body);recoveryKeyRef.current=null;
    }catch(e){setError(toUserError(e,t("recoveryDenied")));}
    finally{setBusy(false);}
  }

  async function confirmArchivedRecovery(){
    if(!recoveryPreview?.canCommit||!recoveryPreview.proposedCommit||
      !recoveryApproved||recoveryReason.trim().length<8)return;
    const payload={...recoveryPreview.proposedCommit,reason:recoveryReason.trim(),
      confirmed:true as const};
    const signature=JSON.stringify(payload);
    if(recoveryKeyRef.current?.signature!==signature)
      recoveryKeyRef.current={signature,requestId:crypto.randomUUID()};
    setBusy(true);setError("");setRecoveryUnconfirmed(true);
    try{
      const response=await fetch("/api/coaching/lesson-capture/recovery/commit",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...payload,requestId:recoveryKeyRef.current.requestId}),
        cache:"no-store",
      });
      const body=await response.json() as {id?:string;reactivatedCount?:number;
        replayed?:boolean;error?:string;code?:string};
      if(!response.ok){
        if(response.status>=500||!body.code)throw new Error(t("recoveryUnconfirmed"));
        setRecoveryUnconfirmed(false);
        setError(toUserError(body,t("recoveryDenied")));
        return;
      }
      if(!body.id)throw new Error(t("recoveryUnconfirmed"));
      setRecoveryUnconfirmed(false);
      setReceipt(t("recoveryReceipt",{id:body.id,count:body.reactivatedCount??0})+
        (body.replayed?" "+t("safeReplay"):""));
      setPreview(null);setRecoveryPreview(null);setRecoveryApproved(false);
      setRecoveryReason("");recoveryKeyRef.current=null;
      // Do not imply the optional chapter has been linked or mastery marked.
    }catch{setError(t("recoveryUnconfirmed"));}
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
        body:JSON.stringify({
          action:payload.studentIds.length===1?"sessions.create":"sessions.createAdHoc",
          workplaceId:payload.workplaceId,
          ...(payload.studentIds.length===1?{studentId:payload.studentIds[0]}:
            {studentIds:payload.studentIds}),
          title:payload.title,startsAt:payload.startsAt,
          durationMinutes:payload.durationMinutes,lessonNote:payload.lessonNote,
          requestId:requestRef.current.requestId,
        }),cache:"no-store",
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
    }catch(e){setError(toUserError(e, t("lessonCreateFailed")));}
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
        throw new Error(toUserError(body, t("atomicUnavailable")));
      setReceipt(t("atomicReceipt",{id:body.session.id,count:body.evidence?.participantCoverages??0})+
        (body.replayed?" "+t("safeReplay"):""));
      setPendingLink(null);setLinkReview(null);setLinkApproved(false);
      setPreview(null);setApproved(false);setAtomicApproved(false);
      atomicKeyRef.current=null;
    }catch(e){setError(toUserError(e, t("atomicFailed")));}
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
      if(!response.ok)throw new Error(toUserError(data, t("chapterUnavailable")));
      setLinkReview(data);
    }catch(e){setError(toUserError(e, t("chapterReviewFailed")));}
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
      if(!response.ok)throw new Error(toUserError(data, t("chapterAssignUnavailable")));
      setLinkedReceipt(t("chapterAssigned",{count:data.participantCoverages??0}));
      setPendingLink(null);setLinkReview(null);setLinkApproved(false);
      linkKeyRef.current=null;
    }catch(e){setError(toUserError(e, t("chapterAssignFailed")));}
    finally{setBusy(false);}
  }

  const reviewedRecoveryWorkplace=workplaces.find(w=>w.id===workplaceId);
  const exactRecoveryLearners=preview?.resolutions.flatMap(r=>r.studentId&&r.name?
    [{id:r.studentId,name:r.name,archived:r.archived===true}]:[])??[];
  const canChooseCompleted=Boolean(reviewedRecoveryWorkplace&&timingMode==="explicit"&&
    preview?.resolutions.length===exactRecoveryLearners.length&&exactRecoveryLearners.length>0&&
    new Set(exactRecoveryLearners.map(x=>x.id)).size===exactRecoveryLearners.length);

  return <section className="rounded-xl border border-border bg-surface p-5 space-y-4" aria-label={t("aria")}>
    <div>
      <h2 className="font-semibold text-lg">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">
        {t("intro")}
      </p>
    </div>
    <form onSubmit={check}>
      <fieldset disabled={busy||recoveryLocked} className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <label className="block min-w-0 text-sm">{t("names")}
        <textarea ref={namesRef} className={field} rows={3} required value={names}
          onChange={e=>{setNames(e.target.value);invalidate();}} />
      </label>
      <label className="block min-w-0 text-sm">{t("workplace")}
        <select className={field} required value={workplaceId}
          onChange={e=>{setWorkplaceId(e.target.value);invalidate();}}>
          <option value="">{t("selectWorkplace")}</option>
          {workplaces.map(w=><option key={w.id} value={w.id}>{w.name} ({w.timezone})</option>)}
        </select>
      </label>
      <label className="block min-w-0 text-sm">{t("lessonTitle")}
        <input className={field} value={title} required maxLength={160}
          onChange={e=>{setTitle(e.target.value);invalidate();}} />
      </label>
      <label className="block min-w-0 text-sm">{t("timeMode")}
        <select className={field} value={timingMode} onChange={e=>{
          setTimingMode(e.target.value as "explicit"|"weekly");invalidate();}}>
          <option value="explicit">{t("explicit")}</option>
          <option value="weekly">{t("weekly")}</option>
        </select>
      </label>
      {timingMode==="explicit"?<>
        <label className="block min-w-0 text-sm">{t("startTime")}
          <input className={field} type="datetime-local" required value={localStart}
            onChange={e=>{setLocalStart(e.target.value);invalidate();}} />
        </label>
        <label className="block min-w-0 text-sm">{t("duration")}
          <input className={field} type="number" min={15} max={480} required value={duration}
            onChange={e=>{setDuration(Number(e.target.value));invalidate();}} />
        </label>
      </>:<label className="block min-w-0 text-sm">{t("lessonDate")}
        <input className={field} type="date" required value={localDate}
          onChange={e=>{setLocalDate(e.target.value);invalidate();}} />
      </label>}
      <label className="block min-w-0 text-sm">{t("sharedNote")}
        <input className={field} value={lessonNote} maxLength={10000}
          onChange={e=>{setLessonNote(e.target.value);invalidate();}} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useSavedStudy}
          onChange={e=>{setUseSavedStudy(e.target.checked);setStudyId("");setStudyName("");invalidate();}} />
        {t("resolveSaved")}
      </label>
      <label className="block min-w-0 text-sm">{t("studyTitle")}
        <input className={field} value={studyName} maxLength={160}
          disabled={useSavedStudy||Boolean(studyId.trim())}
          placeholder={t("studyTitleHint")}
          onChange={e=>{setStudyName(e.target.value);invalidate();}} />
      </label>
      <label className="block min-w-0 text-sm">{t("studyId")}
        <input dir="ltr" className={field} value={studyId} minLength={8} maxLength={8}
          disabled={useSavedStudy||Boolean(studyName.trim())}
          placeholder={t("studyIdHint")} pattern="[A-Za-z0-9]{8}"
          onChange={e=>{setStudyId(e.target.value);invalidate();}} />
      </label>
      {(useSavedStudy||studyId.trim()||studyName.trim())&&<>
        <label className="block min-w-0 text-sm">{t("chapterNumber")}
          <input className={field} type="number" min={1} max={64} required
            value={chapterNumber} onChange={e=>{setChapterNumber(e.target.value);invalidate();}} />
        </label>
        <label className="block min-w-0 text-sm">{t("players")}
          <input className={field} value={expectedPlayers} maxLength={120}
            onChange={e=>{setExpectedPlayers(e.target.value);invalidate();}} />
        </label>
      </>}
      <div><button className={button} type="submit" disabled={busy||recoveryLocked}>{t("previewOnly")}</button></div>
      </fieldset>
    </form>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    {receipt&&<p ref={receiptRef} role="status" tabIndex={-1}>{receipt}</p>}
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
      <section aria-label={t("currentCaptureReview")} className="space-y-2 rounded-lg border border-border p-3">
        <h4 className="font-semibold">{t("currentCaptureReview")}</h4>
        <p className="text-sm">{t("captureNotSaved")}</p>
        <p className="text-sm">{t(preview.review.captureState,{count:preview.review.unresolvedInputs})}</p>
        {preview.review.duplicateReference&&<p className="text-sm">{t("captureDuplicateReference")}</p>}
        {preview.review.captureState==="learner_review_required"&&
          <button type="button" className="underline text-sm" disabled={busy||recoveryLocked}
            onClick={()=>{
              const unresolved=learnerChoicesRef.current?.querySelector<HTMLSelectElement>(
                'li[data-unresolved="true"] select');
              if(unresolved)unresolved.focus();else namesRef.current?.focus();
            }}>{t("resolveCaptureLearners")}</button>}
      </section>
      <ul ref={learnerChoicesRef} className="list-disc ps-5 text-sm">
        {preview.resolutions.map((r,i)=><li key={i} data-unresolved={r.status==="ambiguous"}>
          <bdi dir="auto">{r.input}</bdi>: {r.status==="resolved"||r.status==="archived"?
             <><bdi dir="auto">{r.name}</bdi>{" ("}<bdi dir="ltr">{r.studentId}</bdi>{")"}
               {r.status==="archived"?" — "+t("archivedStudent"):""}</>:
             t(r.status==="ambiguous"?"ambiguous":"notFound")}
          {r.candidates.length>0&&<label className="block text-sm">
            {t("chooseExactLearner",{name:r.input,position:i+1})}
            <select className={field} disabled={busy||recoveryLocked} value={r.candidates.some(c=>c.id===studentChoices[i])?studentChoices[i]:""}
              onChange={e=>{const studentId=e.target.value;setStudentChoices(old=>({...old,[i]:studentId}));}}>
              <option value="">{t("leaveLearnerUnselected")}</option>
              {r.candidates.map(c=><option value={c.id} key={c.id}>{t("learnerIdentityOption",{
                name:c.name,status:c.archived?t("archivedStudent"):t("activeStudent"),id:c.id,
              })}</option>)}
            </select>
          </label>}
        </li>)}
      </ul>
      {preview.resolutions.some(r=>r.candidates.length>0)&&<button type="button" className={button}
        disabled={busy||recoveryLocked||preview.resolutions.some((r,i)=>r.candidates.length>0&&
          !r.candidates.some(c=>c.id===studentChoices[i]))}
        onClick={()=>void requestPreview(studentChoices)}>{t("verifySelectedLearners")}</button>}
      {preview.issues.map((issue,i)=><p key={i} role="alert" className="text-sm text-amber-500">
        {issue.code}: {issue.message}{issue.candidates?.length?
          " — "+issue.candidates.map(c=>c.name+" ["+c.id+"]").join(", "):""}
      </p>)}

      {preview.issues.some(i=>i.code==="ARCHIVED_STUDENT_CONFIRMATION_REQUIRED")&&<>
        <div className="space-y-3 rounded-lg border border-amber-400/60 p-3">
          <h4 className="font-semibold">{t("recoveryTitle")}</h4>
          <p className="text-sm">{t("recoveryIntro")}</p>
          {preview.archivedRecovery&&<div className="flex flex-wrap items-center gap-3">
            <button type="button" className="underline text-sm" disabled={busy||recoveryLocked}
              onClick={()=>exitArchiveReview(false)}>{t("recoveryKeep")}</button>
            <button type="button" className="underline text-sm" disabled={busy||recoveryLocked}
              onClick={()=>exitArchiveReview(true)}>{t("recoveryChooseAnother")}</button>
            {!busy&&!recoveryLocked&&preview.archivedRecovery.reviewHistory.learners.map(learner=>
              <a key={learner.studentId} href={learner.path} className="underline text-sm">
                {t("recoveryReviewHistory",{name:learner.name})}
              </a>)}
          </div>}
          {canChooseCompleted&&<fieldset className="space-y-1">
            <legend className="text-sm font-semibold">{t("completedRecoveryMode")}</legend>
            {(["scheduled","completed"] as const).map(kind=><label key={kind} className="flex items-center gap-2 text-sm">
              <input type="radio" name="archived-recovery-kind" checked={recoveryKind===kind} disabled={busy||recoveryLocked} onChange={()=>{
                if(completedPhaseRef.current!=="idle"||recoveryUnconfirmed)return;
                setRecoveryKind(kind);setRecoveryPreview(null);setRecoveryApproved(false);recoveryKeyRef.current=null;
              }}/>
              {t(kind==="scheduled"?"scheduledRecoveryChoice":"completedRecoveryChoice")}
            </label>)}
          </fieldset>}
          {recoveryKind==="completed"&&canChooseCompleted&&reviewedRecoveryWorkplace&&
            <CompletedArchivedRecoveryPanel workplace={reviewedRecoveryWorkplace} learners={exactRecoveryLearners}
              title={title.trim()} localStart={localStart} durationMinutes={duration}
              onPhaseChange={phase=>{
               if(completedGeneration!==previewGeneration.current)return;
               completedPhaseRef.current=phase;setCompletedPhase(phase);
              }}
              onCommitted={id=>{
               if(completedGeneration!==previewGeneration.current)return;
               focusCompletedReceipt.current=true;
               setReceipt(t("completedRecoveryReceipt",{id}));setPreview(null);setRecoveryKind("scheduled");
              }}/>}
          {recoveryKind==="scheduled"&&<>
          {timingMode!=="explicit"?
            <p role="alert" className="text-sm text-amber-500">{t("recoveryExplicitTime")}</p>:
            <button className={button} type="button"
              disabled={busy||recoveryLocked||preview.resolutions.some(r=>!r.studentId)}
              onClick={()=>void reviewArchivedRecovery()}>{t("reviewRecovery")}</button>}
          {recoveryPreview&&<>
            {recoveryPreview.capacity&&<p className="text-sm">
              {recoveryPreview.capacity.remaining===null?t("recoveryCapacityUnlimited",{
                requested:recoveryPreview.capacity.requestedReactivations,
              }):t("recoveryCapacitySummary",{
                requested:recoveryPreview.capacity.requestedReactivations,
                remaining:recoveryPreview.capacity.remaining,
              })}
            </p>}
            {recoveryPreview.issues.map((item,i)=>
              <p key={i} role="alert" className="text-sm text-amber-500">
                {item.code==="CAPACITY_EXCEEDED"?t("recoveryCapacityBlocked"):
                  toUserError({code:item.code,error:item.message},item.message)}
              </p>)}
            <ul className="list-disc ps-5 text-sm">
              {recoveryPreview.reactivations.map(r=><li key={r.studentId}>
                <bdi dir="auto">{r.name}</bdi> (<bdi dir="ltr">{r.studentId}</bdi>)
                {" — "}{t("archivedStudent")}
                {r.creditNotice&&r.creditNotice.packagesWithUnusedUnits>0&&
                  <p className="text-sm">{t("recoveryCreditNotice",{
                    packages:r.creditNotice.packagesWithUnusedUnits,
                    expired:r.creditNotice.expiredBeforeLesson,
                    otherWorkplace:r.creditNotice.scopedToAnotherWorkplace,
                  })}</p>}
              </li>)}
            </ul>
            <p className="text-sm">{t("recoveryCredits")}</p>
            {recoveryPreview.canCommit&&recoveryPreview.proposedCommit&&<>
              <p className="text-sm">{t("proposedSession",{
                minutes:recoveryPreview.proposedCommit.durationMinutes,
                learners:recoveryPreview.proposedCommit.studentIds.length,
                start:new Date(recoveryPreview.proposedCommit.startsAt).toLocaleString(
                  locale==="en"?"en-GB":locale,{
                    timeZone:workplaces.find(w=>w.id===workplaceId)?.timezone??"UTC",
                    dateStyle:"medium",timeStyle:"short"}),
                zone:workplaces.find(w=>w.id===workplaceId)?.timezone??"UTC",
              })}</p>
              <label className="block text-sm">{t("recoveryReason")}
                <textarea className={field} rows={2} minLength={8} maxLength={1000}
                  value={recoveryReason} disabled={busy||recoveryUnconfirmed} onChange={e=>{
                    setRecoveryReason(e.target.value);setRecoveryApproved(false);
                    recoveryKeyRef.current=null;
                  }} />
              </label>
              <label className="flex gap-2 items-start text-sm">
                <input type="checkbox" checked={recoveryApproved} disabled={busy||recoveryUnconfirmed}
                  onChange={e=>setRecoveryApproved(e.target.checked)} />
                {t("recoveryApprove")}
              </label>
              <button className={button} type="button"
                disabled={busy||!recoveryApproved||recoveryReason.trim().length<8}
                onClick={()=>void confirmArchivedRecovery()}>{t(recoveryUnconfirmed?"recoveryRetry":"recoveryCommit")}</button>
            </>}
          </>}
          </>}
        </div>
      </>}
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
