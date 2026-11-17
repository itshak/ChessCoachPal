"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";

type Student={id:string;name:string};
type Material={id:string;title:string;kind:string};
type Attempt={id:string;outcome:"in_progress"|"submitted"|"completed";note:string;recorded_at:string};
type Review={id:string;verdict:"reviewed"|"needs_work";feedback:string;reviewed_at:string};
type Assignment={
  id:string;student_id:string;instructions:string;due_on:string|null;created_at:string;
  learning_materials:Material|null;assignment_attempts:Attempt[];assignment_reviews:Review[];
};
const input="w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";

export function TrainingHomeworkPanel({fixedStudentId}:{fixedStudentId?:string}){
  const t=useTranslations("homework"),locale=useLocale();
  const formatOutcome=(value:Attempt["outcome"])=>t(value==="in_progress"?"inProgress":value);
  const formatReview=(value:Review["verdict"])=>t(value==="needs_work"?"needsWork":"reviewed");
  const kindLabel=(kind:string)=> {
    switch(kind) {
      case "game":return t("game");
      case "puzzle":return t("puzzle");
      case "drill":return t("drill");
      case "study_chapter":return t("study_chapter");
      case "external_link":return t("external_link");
      default:return kind;
    }
  };
  const [students,setStudents]=useState<Student[]>([]);
  const [materials,setMaterials]=useState<Material[]>([]);
  const [studentId,setStudentId]=useState(fixedStudentId??"");
  const [materialId,setMaterialId]=useState("");
  const [instructions,setInstructions]=useState("");
  const [dueOn,setDueOn]=useState("");
  const [assignments,setAssignments]=useState<Assignment[]>([]);
  const [total,setTotal]=useState(0);
  const [selected,setSelected]=useState("");
  const [outcome,setOutcome]=useState<Attempt["outcome"]>("completed");
  const [attemptNote,setAttemptNote]=useState("");
  const [verdict,setVerdict]=useState<Review["verdict"]>("reviewed");
  const [feedback,setFeedback]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const load=useCallback(async()=>{
    if(!studentId){setAssignments([]);setTotal(0);return;}
    const response=await fetch("/api/training/assignments?"+
      new URLSearchParams({studentId,limit:"100"}),{cache:"no-store"});
    if(!response.ok)throw new Error(t("readError"));
    const data=await response.json() as {assignments:Assignment[];total:number};
    setAssignments(data.assignments);setTotal(data.total);
  },[studentId,t]);
  useEffect(()=>{let active=true;
    void Promise.all([
      fetch("/api/students?limit=1000").then(async r=>{
        if(!r.ok)throw Error(t("studentsError"));
        const body=await r.json();return body.students as Student[];
      }),
      fetch("/api/training/materials?limit=100").then(async r=>{
        if(!r.ok)throw Error(t("materialsError"));
        const body=await r.json();return body.materials as Material[];
      }),
    ]).then(([studentRows,materialRows])=>{
      if(!active)return;
      setStudents(studentRows);setMaterials(materialRows);
      if(!fixedStudentId&&!studentId&&studentRows.length)setStudentId(studentRows[0].id);
      if(materialRows.length)setMaterialId(materialRows[0].id);
    }).catch(()=>{if(active)setError(t("optionsError"));});
    return()=>{active=false};
  },[fixedStudentId,studentId,t]);
  useEffect(()=>{let active=true;void load().catch(()=>{if(active)setError(t("readError"));});
    return()=>{active=false};},[load,t]);
  async function submit(url:string,method:"POST"|"PATCH",body:unknown,successText:string){
    setBusy(true);setError("");setSuccess("");
    try {
      const response=await fetch(url,{
        method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("updateFailed"));
      await load();setSuccess(successText);return true;
    }catch(err){setError(err instanceof Error?err.message:t("updateFailed"));return false;}
    finally{setBusy(false);}
  }
  async function assign(e:FormEvent){
    e.preventDefault();
    if(!studentId||!materialId)return;
    const ok=await submit("/api/training/assignments","POST",{
      studentIds:[studentId],materialId,instructions,dueOn:dueOn||null,
      requestId:crypto.randomUUID(),confirmed:true,
    },t("created"));
    if(ok){setInstructions("");setDueOn("");}
  }
  async function attempt(e:FormEvent){
    e.preventDefault();if(!selected)return;
    const ok=await submit("/api/training/assignments","PATCH",{
      action:"attempt",assignmentId:selected,outcome,note:attemptNote,
      requestId:crypto.randomUUID(),confirmed:true,
    },t("attemptSaved"));
    if(ok)setAttemptNote("");
  }
  async function review(e:FormEvent){
    e.preventDefault();if(!selected)return;
    const ok=await submit("/api/training/assignments","PATCH",{
      action:"review",assignmentId:selected,attemptId:null,verdict,feedback,
      requestId:crypto.randomUUID(),confirmed:true,
    },t("reviewSaved"));
    if(ok)setFeedback("");
  }
  return <section className="space-y-4" aria-label={t("aria")}>
    <div>
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>
    </div>
    {!fixedStudentId&&<label className="block text-sm max-w-md">{t("student")}
      <select className={input} value={studentId} onChange={e=>{setStudentId(e.target.value);setSelected("");}}>
        <option value="">{t("chooseStudent")}</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>}
    <form onSubmit={assign} className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="font-semibold">{t("assignMaterial")}</h3>
      <label className="block text-sm">{t("learningMaterial")}
        <select className={input} value={materialId} onChange={e=>setMaterialId(e.target.value)} required>
          <option value="">{t("selectMaterial")}</option>
          {materials.map(m=><option key={m.id} value={m.id}>{m.title} ({kindLabel(m.kind)})</option>)}
        </select>
      </label>
      <label className="block text-sm">{t("instructions")}
        <textarea className={input} rows={2} value={instructions} maxLength={5000} onChange={e=>setInstructions(e.target.value)}/>
      </label>
      <label className="block text-sm max-w-sm">{t("dueDate")}
        <input className={input} type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)}/>
      </label>
      <button type="submit" className={button} disabled={busy||!studentId||!materialId}>{t("createAssignment")}</button>
    </form>
    <div className="space-y-2">
      <h3 className="font-semibold">{t("assignments")} <span className="text-sm text-muted">({total})</span></h3>
      {assignments.length===0&&<p className="text-sm text-muted">{t("noHomework")}</p>}
      {assignments.map(a=>{
        const lastAttempt=[...(a.assignment_attempts||[])].sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at))[0];
        const lastReview=[...(a.assignment_reviews||[])].sort((x,y)=>y.reviewed_at.localeCompare(x.reviewed_at))[0];
        return <div key={a.id} className="rounded-lg border border-border p-3 space-y-1">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="activeAssignment" value={a.id} checked={selected===a.id} onChange={()=>setSelected(a.id)}/>
            <strong><bdi dir="auto">{a.learning_materials?.title||t("materialUnavailable")}</bdi></strong>
          </label>
          <p className="text-xs text-muted">{t("typeDue",{
              kind:a.learning_materials?.kind?kindLabel(a.learning_materials.kind):t("unknown"),
              date:a.due_on?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeZone:"UTC"})
                .format(new Date(a.due_on+"T12:00:00Z")):t("noDate")
            })}</p>
          {a.instructions&&<p className="text-sm whitespace-pre-wrap" dir="auto">{a.instructions}</p>}
          <p className="text-sm">{t("latest",{
              outcome:lastAttempt?formatOutcome(lastAttempt.outcome):t("notRecorded"),
              review:lastReview?formatReview(lastReview.verdict):t("notReviewed")
            })}</p>
          {lastReview?.feedback&&<p className="text-sm whitespace-pre-wrap" dir="auto">{t("feedbackLine",{text:lastReview.feedback})}</p>}
        </div>;
      })}
    </div>
    {selected&&<div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={attempt} className="rounded-xl border border-border p-3 space-y-2">
        <h3 className="font-semibold">{t("recordAttempt")}</h3>
        <select className={input} aria-label={t("outcomeAria")} value={outcome} onChange={e=>setOutcome(e.target.value as Attempt["outcome"])}>
          <option value="in_progress">{t("inProgress")}</option><option value="submitted">{t("submitted")}</option><option value="completed">{t("completed")}</option>
        </select>
        <textarea className={input} aria-label={t("attemptNoteAria")} rows={2} maxLength={5000} value={attemptNote} onChange={e=>setAttemptNote(e.target.value)} placeholder={t("attemptPlaceholder")}/>
        <button className={button} disabled={busy}>{t("recordProgress")}</button>
      </form>
      <form onSubmit={review} className="rounded-xl border border-border p-3 space-y-2">
        <h3 className="font-semibold">{t("coachReview")}</h3>
        <select className={input} aria-label={t("verdictAria")} value={verdict} onChange={e=>setVerdict(e.target.value as Review["verdict"])}>
          <option value="reviewed">{t("reviewed")}</option><option value="needs_work">{t("needsWork")}</option>
        </select>
        <textarea className={input} aria-label={t("feedbackAria")} rows={2} maxLength={5000} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder={t("feedbackPlaceholder")}/>
        <button className={button} disabled={busy}>{t("saveReview")}</button>
      </form>
    </div>}
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {success&&<p role="status" className="text-sm text-emerald-600">{success}</p>}
  </section>;
}
