"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Student = { id:string;name:string };
type Session = { id:string;title:string;starts_at:string;student_id:string|null };
type Category = { id:string;name:string;description:string;sort_order:number };
type Observation = { id:string;student_id:string;session_id:string|null;category_id:string;
  observation:string;observed_at:string;source:"teacher"|"agent";verified_at:string|null };
type Resource = { id:string;student_id:string|null;session_id:string|null;label:string;
  url:string;resource_type:"lichess_study"|"external";provider_study_id:string|null;
  provider_chapter_id:string|null };
type Envelope<T> = {ok?:boolean;data?:T;error?:{code:string;message?:string}};

const inputClass="w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const actionClass="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
const boxClass="rounded-xl border border-border bg-surface p-4 space-y-3";

async function command<T>(action:string,body:Record<string,unknown>={}):Promise<T> {
  const response=await fetch("/api/agent/v1",{
    method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",
    body:JSON.stringify({action,...body}),
  });
  const value=await response.json() as Envelope<T>;
  if (!response.ok || !value.ok) throw new Error(value.error?.message??value.error?.code??"Learning request failed");
  return value.data as T;
}

/**
 * Shared student and lesson learning panel. The teacher explicitly approves
 * suggestions; MCP is only allowed to propose, never to call approve/update.
 */
export function ChessLearningPanel({fixedStudentId}:{fixedStudentId?:string}) {
  const [students,setStudents]=useState<Student[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [studentId,setStudentId]=useState(fixedStudentId??"");
  const [sessionId,setSessionId]=useState("");
  const [categoryId,setCategoryId]=useState("");
  const [observations,setObservations]=useState<Observation[]>([]);
  const [resources,setResources]=useState<Resource[]>([]);
  const [newCategory,setNewCategory]=useState("");
  const [editCategory,setEditCategory]=useState("");
  const [observation,setObservation]=useState("");
  const [linkLabel,setLinkLabel]=useState("");
  const [linkUrl,setLinkUrl]=useState("");
  const [linkKind,setLinkKind]=useState<"lichess_study"|"external">("lichess_study");
  const [target,setTarget]=useState<"student"|"session">("student");
  const [editObservationId,setEditObservationId]=useState("");
  const [editObservationText,setEditObservationText]=useState("");
  const [editResourceId,setEditResourceId]=useState("");
  const [editResourceLabel,setEditResourceLabel]=useState("");
  const [editResourceUrl,setEditResourceUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const refreshCategories=useCallback(async()=>{
    const rows=await command<Category[]>("chess.categories.list");
    setCategories(rows);
    setCategoryId(old=>rows.some(item=>item.id===old)?old:(rows[0]?.id??""));
  },[]);

  const refreshHistory=useCallback(async()=>{
    if (!studentId) {setObservations([]);setResources([]);return;}
    const [notes,links]=await Promise.all([
      command<Observation[]>("chess.observations.list",{studentId,...(sessionId?{sessionId}:{})}),
      command<Resource[]>("chess.resources.list",{studentId,...(sessionId?{sessionId}:{})}),
    ]);
    setObservations(notes);setResources(links);
  },[studentId,sessionId]);

  useEffect(()=>{
    let active=true;
    void Promise.all([
      command<Student[]>("students.search",{query:""}),
      command<Session[]>("sessions.list"),
      command<Category[]>("chess.categories.list"),
    ]).then(([people,lessons,skills])=>{
      if (!active)return;
      setStudents(people);setSessions(lessons);setCategories(skills);
      setStudentId(old=>fixedStudentId??(old||people[0]?.id||""));
      setCategoryId(old=>old||skills[0]?.id||"");
    }).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[fixedStudentId]);

  useEffect(()=>{
    let active=true;
    if (!studentId) {setObservations([]);setResources([]);return;}
    void Promise.all([
      command<Observation[]>("chess.observations.list",{studentId,...(sessionId?{sessionId}:{})}),
      command<Resource[]>("chess.resources.list",{studentId,...(sessionId?{sessionId}:{})}),
    ]).then(([notes,links])=>{
      if(active){setObservations(notes);setResources(links);}
    }).catch(e=>{if(active){setObservations([]);setResources([]);setError(String(e));}});
    return ()=>{active=false;};
  },[studentId,sessionId]);

  useEffect(()=>{
    setEditCategory(categories.find(item=>item.id===categoryId)?.name??"");
  },[categories,categoryId]);

  async function run(work:()=>Promise<void>,message:string){
    setBusy(true);setError("");setNotice("");
    try {await work();await Promise.all([refreshHistory(),refreshCategories()]);setNotice(message);}
    catch(e){setError(e instanceof Error?e.message:"Learning operation failed");}
    finally {setBusy(false);}
  }

  async function addCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      const row=await command<Category>("chess.categories.create",{name:newCategory.trim()});
      setNewCategory("");setCategoryId(row.id);
    },"Chess skill added.");
  }
  async function saveCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.categories.update",{categoryId,name:editCategory.trim()});
    },"Chess skill updated.");
  }
  async function addObservation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.observations.create",{
        studentId,categoryId,observation:observation.trim(),
        ...(sessionId?{sessionId}:{}),
      });
      setObservation("");
    },"Verified teacher observation saved.");
  }
  async function approve(id:string) {
    await run(async()=>{await command("chess.observations.approve",{observationId:id});},
      "AI suggestion explicitly approved by teacher.");
  }
  async function saveObservation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.observations.update",{
        observationId:editObservationId,observation:editObservationText.trim(),
      });
      setEditObservationId("");
    },"Observation corrected.");
  }
  async function addResource(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.resources.link",{
        ...(target==="session"?{sessionId}:{studentId}),
        label:linkLabel.trim(),url:linkUrl.trim(),resourceType:linkKind,
      });
      setLinkLabel("");setLinkUrl("");
    },"Learning resource saved; external availability is not required.");
  }
  async function saveResource(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.resources.update",{
        resourceId:editResourceId,label:editResourceLabel.trim(),url:editResourceUrl.trim(),
      });
      setEditResourceId("");
    },"Learning link corrected.");
  }

  return (
    <section aria-label="Chess learning" className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">Chess learning</h2>
        <p className="text-sm text-muted">Skills, teacher-approved observations, and selected HTTPS studies. AI suggestions remain unverified until you approve them.</p>
      </header>
      {error&&<p role="alert" className="text-error">{error}</p>}
      {notice&&<p role="status" className="text-success">{notice}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <label>Chess learner
          <select aria-label="Chess learner" className={inputClass} value={studentId}
            disabled={!!fixedStudentId} onChange={e=>{setStudentId(e.target.value);setSessionId("");}}>
            {!studentId&&<option value="">Choose student</option>}
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            {fixedStudentId&&!students.some(s=>s.id===fixedStudentId)&&
              <option value={fixedStudentId}>This student</option>}
          </select>
        </label>
        <label>Related coaching lesson (optional)
          <select aria-label="Related coaching lesson" className={inputClass} value={sessionId}
            onChange={e=>setSessionId(e.target.value)}>
            <option value="">All student observations</option>
            {sessions.map(s=><option value={s.id} key={s.id}>
              {s.title} · {new Date(s.starts_at).toLocaleDateString()}
            </option>)}
          </select>
        </label>
      </div>
      {!studentId&&<p className="text-muted">Create a student before recording chess learning.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={boxClass}>
          <h3 className="font-semibold">Chess skill categories</h3>
          <p className="text-sm text-muted">Six starter categories are provided for each new teacher. You can add or rename your own.</p>
          <label>Skill area
            <select aria-label="Chess skill area" className={inputClass} value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <form className="flex gap-2" onSubmit={saveCategory}>
            <input aria-label="Rename chess skill" className={inputClass} value={editCategory}
              maxLength={80} required onChange={e=>setEditCategory(e.target.value)}/>
            <button className={actionClass} disabled={busy||!categoryId}>Rename</button>
          </form>
          <form className="flex gap-2" onSubmit={addCategory}>
            <input aria-label="New chess skill" className={inputClass} placeholder="e.g. Pawn structures"
              value={newCategory} maxLength={80} required onChange={e=>setNewCategory(e.target.value)}/>
            <button className={actionClass} disabled={busy}>Add skill</button>
          </form>
        </div>
        <div className={boxClass}>
          <h3 className="font-semibold">Record a teacher observation</h3>
          <form className="space-y-3" onSubmit={addObservation}>
            <label>Chess observation
              <textarea aria-label="Chess observation" className={inputClass}
                placeholder="The student understands the opposition but needs to practice triangulation."
                value={observation} maxLength={5000} required rows={3}
                onChange={e=>setObservation(e.target.value)}/>
            </label>
            <button className={actionClass} disabled={busy||!studentId||!categoryId}>
              Save verified observation
            </button>
          </form>
        </div>
      </div>
      <div className={boxClass}>
        <h3 className="font-semibold">Observation history</h3>
        {observations.length===0?<p className="text-sm text-muted">No observations recorded for this view yet.</p>:
          <ul className="space-y-3">{observations.map(note=><li key={note.id} className="border-t border-border pt-3">
            <p className="font-medium">{categories.find(c=>c.id===note.category_id)?.name??"Chess skill"} · {new Date(note.observed_at).toLocaleDateString()}</p>
            <p className="text-sm">{note.observation}</p>
            <p className="text-xs text-muted">{note.source==="agent"?"AI proposed":"Teacher authored"} · {note.verified_at?"Verified":"Unverified suggestion"}</p>
            <div className="flex gap-2 mt-2">
              {note.source==="agent"&&!note.verified_at&&
                <button type="button" className={actionClass} disabled={busy} onClick={()=>void approve(note.id)}>Approve suggestion</button>}
              <button type="button" className="underline text-sm" onClick={()=>{
                setEditObservationId(note.id);setEditObservationText(note.observation);
              }}>Edit observation</button>
            </div>
            {editObservationId===note.id&&<form className="space-y-2 mt-2" onSubmit={saveObservation}>
              <textarea aria-label="Edit chess observation" className={inputClass} maxLength={5000}
                value={editObservationText} required onChange={e=>setEditObservationText(e.target.value)}/>
              <button className={actionClass} disabled={busy}>Save correction</button>
              <button type="button" className="px-3" onClick={()=>setEditObservationId("")}>Cancel</button>
            </form>}
          </li>)}</ul>}
      </div>
      <div className={boxClass}>
        <h3 className="font-semibold">Selected studies and learning links</h3>
        <p className="text-sm text-muted">Only the link is stored; the external study may be unavailable without affecting your notes.</p>
        <form className="grid gap-2 md:grid-cols-2" onSubmit={addResource}>
          <label>Resource label
            <input aria-label="Resource label" className={inputClass} value={linkLabel} maxLength={160} required onChange={e=>setLinkLabel(e.target.value)}/>
          </label>
          <label>HTTPS learning URL
            <input aria-label="HTTPS learning URL" className={inputClass} type="url" value={linkUrl} maxLength={2048} required
              placeholder="https://lichess.org/study/Ab12Cd34" onChange={e=>setLinkUrl(e.target.value)}/>
          </label>
          <label>Link type
            <select aria-label="Link type" className={inputClass} value={linkKind}
              onChange={e=>setLinkKind(e.target.value as "lichess_study"|"external")}>
              <option value="lichess_study">Lichess Study</option>
              <option value="external">Other HTTPS resource</option>
            </select>
          </label>
          <label>Attach link to
            <select aria-label="Attach link to" className={inputClass} value={target}
              onChange={e=>setTarget(e.target.value as "student"|"session")}>
              <option value="student">Student</option>
              {sessionId&&<option value="session">Selected coaching lesson</option>}
            </select>
          </label>
          <div><button className={actionClass} disabled={busy||!studentId||(target==="session"&&!sessionId)}>Save learning link</button></div>
        </form>
        {resources.length===0?<p className="text-sm text-muted">No saved links for this view.</p>:
          <ul className="space-y-3">{resources.map(link=><li key={link.id} className="border-t border-border pt-3">
            <a className="text-primary underline break-all" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a>
            <p className="text-xs text-muted">{link.resource_type==="lichess_study"?"Lichess Study":"External HTTPS resource"} · {link.session_id?"Lesson":"Student"} {link.provider_study_id?"· Study "+link.provider_study_id:""}</p>
            <button type="button" className="text-sm underline" onClick={()=>{
              setEditResourceId(link.id);setEditResourceLabel(link.label);setEditResourceUrl(link.url);
            }}>Edit link</button>
            {editResourceId===link.id&&<form className="space-y-2 mt-2" onSubmit={saveResource}>
              <input aria-label="Edit resource label" className={inputClass} value={editResourceLabel}
                maxLength={160} required onChange={e=>setEditResourceLabel(e.target.value)}/>
              <input aria-label="Edit resource URL" className={inputClass} type="url" value={editResourceUrl}
                maxLength={2048} required onChange={e=>setEditResourceUrl(e.target.value)}/>
              <button className={actionClass} disabled={busy}>Save link correction</button>
              <button type="button" className="px-3" onClick={()=>setEditResourceId("")}>Cancel</button>
            </form>}
          </li>)}</ul>}
      </div>
    </section>
  );
}
