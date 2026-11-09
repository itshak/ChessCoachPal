"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";

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
    if(!response.ok)throw new Error("Unable to read homework");
    const data=await response.json() as {assignments:Assignment[];total:number};
    setAssignments(data.assignments);setTotal(data.total);
  },[studentId]);
  useEffect(()=>{let active=true;
    void Promise.all([
      fetch("/api/students?limit=1000").then(async r=>{
        if(!r.ok)throw Error("Students unavailable");
        const body=await r.json();return body.students as Student[];
      }),
      fetch("/api/training/materials?limit=100").then(async r=>{
        if(!r.ok)throw Error("Materials unavailable");
        const body=await r.json();return body.materials as Material[];
      }),
    ]).then(([studentRows,materialRows])=>{
      if(!active)return;
      setStudents(studentRows);setMaterials(materialRows);
      if(!fixedStudentId&&!studentId&&studentRows.length)setStudentId(studentRows[0].id);
      if(materialRows.length)setMaterialId(materialRows[0].id);
    }).catch(()=>{if(active)setError("Unable to load homework options");});
    return()=>{active=false};
  },[fixedStudentId,studentId]);
  useEffect(()=>{let active=true;void load().catch(()=>{if(active)setError("Unable to read homework");});
    return()=>{active=false};},[load]);
  async function submit(url:string,method:"POST"|"PATCH",body:unknown,successText:string){
    setBusy(true);setError("");setSuccess("");
    try {
      const response=await fetch(url,{
        method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Homework update failed");
      await load();setSuccess(successText);return true;
    }catch(err){setError(err instanceof Error?err.message:"Homework update failed");return false;}
    finally{setBusy(false);}
  }
  async function assign(e:FormEvent){
    e.preventDefault();
    if(!studentId||!materialId)return;
    const ok=await submit("/api/training/assignments","POST",{
      studentIds:[studentId],materialId,instructions,dueOn:dueOn||null,
      requestId:crypto.randomUUID(),confirmed:true,
    },"Assignment created.");
    if(ok){setInstructions("");setDueOn("");}
  }
  async function attempt(e:FormEvent){
    e.preventDefault();if(!selected)return;
    const ok=await submit("/api/training/assignments","PATCH",{
      action:"attempt",assignmentId:selected,outcome,note:attemptNote,
      requestId:crypto.randomUUID(),confirmed:true,
    },"Homework progress recorded. This does not imply mastery.");
    if(ok)setAttemptNote("");
  }
  async function review(e:FormEvent){
    e.preventDefault();if(!selected)return;
    const ok=await submit("/api/training/assignments","PATCH",{
      action:"review",assignmentId:selected,attemptId:null,verdict,feedback,
      requestId:crypto.randomUUID(),confirmed:true,
    },"Teacher review saved independently of any skill assessment.");
    if(ok)setFeedback("");
  }
  return <section className="space-y-4" aria-label="Student chess homework">
    <div>
      <h2 className="text-2xl font-semibold">Homework and training follow-up</h2>
      <p className="text-sm text-muted">Assign a saved material to a learner, record completion evidence and review it. Completion never automatically means mastery.</p>
    </div>
    {!fixedStudentId&&<label className="block text-sm max-w-md">Student
      <select className={input} value={studentId} onChange={e=>{setStudentId(e.target.value);setSelected("");}}>
        <option value="">Choose student</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>}
    <form onSubmit={assign} className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="font-semibold">Assign material</h3>
      <label className="block text-sm">Learning material
        <select className={input} value={materialId} onChange={e=>setMaterialId(e.target.value)} required>
          <option value="">Select material</option>
          {materials.map(m=><option key={m.id} value={m.id}>{m.title} ({m.kind.replaceAll("_"," ")})</option>)}
        </select>
      </label>
      <label className="block text-sm">Instructions
        <textarea className={input} rows={2} value={instructions} maxLength={5000} onChange={e=>setInstructions(e.target.value)}/>
      </label>
      <label className="block text-sm max-w-sm">Due date (optional)
        <input className={input} type="date" value={dueOn} onChange={e=>setDueOn(e.target.value)}/>
      </label>
      <button type="submit" className={button} disabled={busy||!studentId||!materialId}>Create assignment</button>
    </form>
    <div className="space-y-2">
      <h3 className="font-semibold">Student assignments <span className="text-sm text-muted">({total})</span></h3>
      {assignments.length===0&&<p className="text-sm text-muted">No recorded homework for this student.</p>}
      {assignments.map(a=>{
        const lastAttempt=[...(a.assignment_attempts||[])].sort((x,y)=>y.recorded_at.localeCompare(x.recorded_at))[0];
        const lastReview=[...(a.assignment_reviews||[])].sort((x,y)=>y.reviewed_at.localeCompare(x.reviewed_at))[0];
        return <div key={a.id} className="rounded-lg border border-border p-3 space-y-1">
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="activeAssignment" value={a.id} checked={selected===a.id} onChange={()=>setSelected(a.id)}/>
            <strong>{a.learning_materials?.title||"Material unavailable"}</strong>
          </label>
          <p className="text-xs text-muted">Type: {a.learning_materials?.kind||"unknown"} · Due: {a.due_on||"No date"}</p>
          {a.instructions&&<p className="text-sm">{a.instructions}</p>}
          <p className="text-sm">Latest attempt: {lastAttempt?.outcome.replaceAll("_"," ")||"Not recorded"} · Teacher review: {lastReview?.verdict.replaceAll("_"," ")||"Not reviewed"}</p>
          {lastReview?.feedback&&<p className="text-sm">Feedback: {lastReview.feedback}</p>}
        </div>;
      })}
    </div>
    {selected&&<div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={attempt} className="rounded-xl border border-border p-3 space-y-2">
        <h3 className="font-semibold">Record an attempt</h3>
        <select className={input} aria-label="Homework outcome" value={outcome} onChange={e=>setOutcome(e.target.value as Attempt["outcome"])}>
          <option value="in_progress">In progress</option><option value="submitted">Submitted</option><option value="completed">Completed</option>
        </select>
        <textarea className={input} aria-label="Attempt note" rows={2} maxLength={5000} value={attemptNote} onChange={e=>setAttemptNote(e.target.value)} placeholder="Evidence/what was completed"/>
        <button className={button} disabled={busy}>Record progress</button>
      </form>
      <form onSubmit={review} className="rounded-xl border border-border p-3 space-y-2">
        <h3 className="font-semibold">Coach review</h3>
        <select className={input} aria-label="Review verdict" value={verdict} onChange={e=>setVerdict(e.target.value as Review["verdict"])}>
          <option value="reviewed">Reviewed</option><option value="needs_work">Needs more work</option>
        </select>
        <textarea className={input} aria-label="Review feedback" rows={2} maxLength={5000} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Teacher feedback"/>
        <button className={button} disabled={busy}>Save review</button>
      </form>
    </div>}
    {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
    {success&&<p role="status" className="text-sm text-emerald-600">{success}</p>}
  </section>;
}
