"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {useLocale,useTranslations} from "next-intl";

type Student = { id:string;name:string };
type Session = { id:string;title:string;starts_at:string;student_id:string|null };
type Category = { id:string;name:string;description:string;sort_order:number };
type Observation = { id:string;student_id:string;session_id:string|null;category_id:string;
  observation:string;observed_at:string;source:"teacher"|"agent";verified_at:string|null };
type MaterialOption={id:string;title:string;kind:string;source_url:string|null};
type MaterialLink={id:string;student_id:string|null;session_id:string|null;material_id:string;
 revision:number;learning_materials:MaterialOption|MaterialOption[]|null};
type MaterialLinkPage={links:MaterialLink[];total:number;nextOffset:number|null};
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
  const t=useTranslations("chessLearning"),locale=useLocale();
  const [students,setStudents]=useState<Student[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [studentId,setStudentId]=useState(fixedStudentId??"");
  const [sessionId,setSessionId]=useState("");
  const [categoryId,setCategoryId]=useState("");
  const [observations,setObservations]=useState<Observation[]>([]);
  const [links,setLinks]=useState<MaterialLink[]>([]);
  const [materials,setMaterials]=useState<MaterialOption[]>([]);
  const [materialId,setMaterialId]=useState("");
  const [newCategory,setNewCategory]=useState("");
  const [editCategory,setEditCategory]=useState("");
  const [observation,setObservation]=useState("");
  const [target,setTarget]=useState<"student"|"session">("student");
  const [editObservationId,setEditObservationId]=useState("");
  const [editObservationText,setEditObservationText]=useState("");
  const [editLinkId,setEditLinkId]=useState("");
  const [editMaterialId,setEditMaterialId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  const refreshCategories=useCallback(async()=>{
    const rows=await command<Category[]>("chess.categories.list");
    setCategories(rows);
    setCategoryId(old=>rows.some(item=>item.id===old)?old:(rows[0]?.id??""));
  },[]);

  const refreshHistory=useCallback(async()=>{
    if (!studentId) {setObservations([]);setLinks([]);return;}
    const [notes,linked]=await Promise.all([
      command<Observation[]>("chess.observations.list",{studentId,...(sessionId?{sessionId}:{})}),
      command<MaterialLinkPage>("materials.links.list",{studentId,...(sessionId?{sessionId}:{})}),
    ]);
    setObservations(notes);setLinks(linked.links);
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
    if (!studentId) {setObservations([]);setLinks([]);return;}
    void Promise.all([
      command<Observation[]>("chess.observations.list",{studentId,...(sessionId?{sessionId}:{})}),
      command<MaterialLinkPage>("materials.links.list",{studentId,...(sessionId?{sessionId}:{})}),
    ]).then(([notes,linked])=>{
      if(active){setObservations(notes);setLinks(linked.links);}
    }).catch(e=>{if(active){setObservations([]);setLinks([]);setError(String(e));}});
    return ()=>{active=false;};
  },[studentId,sessionId]);

  const refreshMaterials=useCallback(async()=>{
    const response=await fetch("/api/training/materials?limit=100",{cache:"no-store"});
    if(!response.ok)throw new Error(t("loadMaterialsError"));
    const value=await response.json() as {materials:MaterialOption[]};
    setMaterials(value.materials);
    setMaterialId(old=>value.materials.some(m=>m.id===old)?old:value.materials[0]?.id??"");
  },[t]);
  useEffect(()=>{void refreshMaterials().catch(e=>setError(String(e)));},[refreshMaterials]);

  useEffect(()=>{
    setEditCategory(categories.find(item=>item.id===categoryId)?.name??"");
  },[categories,categoryId]);

  async function run(work:()=>Promise<void>,message:string){
    setBusy(true);setError("");setNotice("");
    try {await work();await Promise.all([refreshHistory(),refreshCategories()]);setNotice(message);}
    catch(e){setError(e instanceof Error?e.message:t("operationFailed"));}
    finally {setBusy(false);}
  }

  async function addCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      const row=await command<Category>("chess.categories.create",{name:newCategory.trim()});
      setNewCategory("");setCategoryId(row.id);
    },t("skillAdded"));
  }
  async function saveCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.categories.update",{categoryId,name:editCategory.trim()});
    },t("skillUpdated"));
  }
  async function addObservation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.observations.create",{
        studentId,categoryId,observation:observation.trim(),
        ...(sessionId?{sessionId}:{}),
      });
      setObservation("");
    },t("observationSaved"));
  }
  async function approve(id:string) {
    await run(async()=>{await command("chess.observations.approve",{observationId:id});},
      t("suggestionApproved"));
  }
  async function saveObservation(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    await run(async()=>{
      await command("chess.observations.update",{
        observationId:editObservationId,observation:editObservationText.trim(),
      });
      setEditObservationId("");
    },t("observationCorrected"));
  }
  async function addLink(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!materialId)return;
    if(!window.confirm(t("attachConfirm")))return;
    await run(async()=>{
      await command("materials.links.create",{
        materialId,...(target==="session"?{sessionId}:{studentId}),
        requestId:crypto.randomUUID(),confirmed:true,
      });
    },t("materialAttached"));
  }
  async function saveLink(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const old=links.find(x=>x.id===editLinkId);
    if(!old||!editMaterialId)return;
    await run(async()=>{
      await command("materials.links.update",{
        linkId:old.id,materialId:editMaterialId,expectedRevision:old.revision,confirmed:true,
      });
      setEditLinkId("");
    },t("associationCorrected"));
  }
  async function unlink(link:MaterialLink){
    await run(async()=>{
      const preview=await command<{evidencePreserved:boolean;explanation:string}>(
        "materials.links.unlinkImpact",{linkId:link.id});
      if(!preview.evidencePreserved||
         !window.confirm(t("unlinkConfirm")))return;
      await command("materials.links.unlink",{
        linkId:link.id,expectedRevision:link.revision,confirmed:true,
      });
    },t("unlinkSuccess"));
  }
  const selectedMaterial=(link:MaterialLink)=>{
    const value=link.learning_materials;
    return Array.isArray(value)?value[0]??null:value;
  };

  return (
    <section aria-label={t("title")} className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </header>
      {error&&<p role="alert" className="text-error">{error}</p>}
      {notice&&<p role="status" className="text-success">{notice}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <label>{t("learner")}
          <select aria-label={t("learner")} className={inputClass} value={studentId}
            disabled={!!fixedStudentId} onChange={e=>{setStudentId(e.target.value);setSessionId("");}}>
            {!studentId&&<option value="">{t("chooseStudent")}</option>}
            {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            {fixedStudentId&&!students.some(s=>s.id===fixedStudentId)&&
              <option value={fixedStudentId}>{t("thisStudent")}</option>}
          </select>
        </label>
        <label>{t("relatedLesson")}
          <select aria-label={t("relatedLessonAria")} className={inputClass} value={sessionId}
            onChange={e=>setSessionId(e.target.value)}>
            <option value="">{t("allObservations")}</option>
            {sessions.map(s=><option value={s.id} key={s.id}>
              {s.title} · {new Date(s.starts_at).toLocaleDateString(locale)}
            </option>)}
          </select>
        </label>
      </div>
      {!studentId&&<p className="text-muted">{t("firstStudent")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={boxClass}>
          <h3 className="font-semibold">{t("categories")}</h3>
          <p className="text-sm text-muted">{t("categoriesHint")}</p>
          <label>{t("skillArea")}
            <select aria-label={t("skillAreaAria")} className={inputClass} value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <form className="flex gap-2" onSubmit={saveCategory}>
            <input aria-label={t("renameSkill")} className={inputClass} value={editCategory}
              maxLength={80} required onChange={e=>setEditCategory(e.target.value)}/>
            <button className={actionClass} disabled={busy||!categoryId}>{t("rename")}</button>
          </form>
          <form className="flex gap-2" onSubmit={addCategory}>
            <input aria-label={t("newSkill")} className={inputClass} placeholder={t("skillExample")}
              value={newCategory} maxLength={80} required onChange={e=>setNewCategory(e.target.value)}/>
            <button className={actionClass} disabled={busy}>{t("addSkill")}</button>
          </form>
        </div>
        <div className={boxClass}>
          <h3 className="font-semibold">{t("observationTitle")}</h3>
          <form className="space-y-3" onSubmit={addObservation}>
            <label>{t("observation")}
              <textarea aria-label={t("observation")} className={inputClass}
                placeholder={t("observationPlaceholder")}
                value={observation} maxLength={5000} required rows={3}
                onChange={e=>setObservation(e.target.value)}/>
            </label>
            <button className={actionClass} disabled={busy||!studentId||!categoryId}>
              {t("saveVerified")}
            </button>
          </form>
        </div>
      </div>
      <div className={boxClass}>
        <h3 className="font-semibold">{t("history")}</h3>
        {observations.length===0?<p className="text-sm text-muted">{t("noHistory")}</p>:
          <ul className="space-y-3">{observations.map(note=><li key={note.id} className="border-t border-border pt-3">
            <p className="font-medium"><bdi dir="auto">{categories.find(c=>c.id===note.category_id)?.name??t("fallbackSkill")}</bdi> · {new Date(note.observed_at).toLocaleDateString(locale)}</p>
            <p className="text-sm whitespace-pre-wrap" dir="auto">{note.observation}</p>
            <p className="text-xs text-muted">{note.source==="agent"?t("aiProposed"):t("teacherAuthored")} ·
              {note.verified_at?t("verified"):t("unverified")}</p>
            <div className="flex gap-2 mt-2">
              {note.source==="agent"&&!note.verified_at&&
                <button type="button" className={actionClass} disabled={busy} onClick={()=>void approve(note.id)}>{t("approve")}</button>}
              <button type="button" className="underline text-sm" onClick={()=>{
                setEditObservationId(note.id);setEditObservationText(note.observation);
              }}>{t("editObservation")}</button>
            </div>
            {editObservationId===note.id&&<form className="space-y-2 mt-2" onSubmit={saveObservation}>
              <textarea aria-label={t("editObservationAria")} className={inputClass} maxLength={5000}
                value={editObservationText} required onChange={e=>setEditObservationText(e.target.value)}/>
              <button className={actionClass} disabled={busy}>{t("saveCorrection")}</button>
              <button type="button" className="px-3" onClick={()=>setEditObservationId("")}>{t("cancel")}</button>
            </form>}
          </li>)}</ul>}
      </div>
      <div className={boxClass}>
        <h3 className="font-semibold">{t("materials")}</h3>
        <p className="text-sm text-muted">{t("materialsHint")}</p>
        <button type="button" className="underline text-sm" disabled={busy}
          onClick={()=>void refreshMaterials().catch(e=>setError(String(e)))}>
          {t("refreshMaterials")}
        </button>
        <form className="grid gap-2 md:grid-cols-2" onSubmit={addLink}>
          <label>{t("material")}
            <select aria-label={t("material")} className={inputClass} value={materialId}
              onChange={e=>setMaterialId(e.target.value)} required>
              {!materials.length&&<option value="">{t("materialEmpty")}</option>}
              {materials.map(m=><option key={m.id} value={m.id}>{m.title} · {m.kind}</option>)}
            </select>
          </label>
          <label>{t("attachTo")}
            <select aria-label={t("attachTo")} className={inputClass} value={target}
              onChange={e=>setTarget(e.target.value as "student"|"session")}>
              <option value="student">{t("student")}</option>
              {sessionId&&<option value="session">{t("selectedLesson")}</option>}
            </select>
          </label>
          <div><button className={actionClass}
            disabled={busy||!materialId||!studentId||(target==="session"&&!sessionId)}>
            {t("attachMaterial")}
          </button></div>
        </form>
        {links.length===0?<p className="text-sm text-muted">{t("noLinks")}</p>:
          <ul className="space-y-3">{links.map(link=>{
            const material=selectedMaterial(link);
            return <li key={link.id} className="border-t border-border pt-3">
              <p className="font-medium"><bdi dir="auto">{material?.title??t("unknownMaterial")}</bdi></p>
              {material?.source_url&&<a className="text-primary underline break-all"
                href={material.source_url} target="_blank" rel="noopener noreferrer">{t("openSource")}</a>}
              <p className="text-xs text-muted">{material?.kind??t("materialFallback")} ·
               {link.session_id?t("lesson"):t("student")} ·
               {t("revision",{number:link.revision})}</p>
              <div className="flex gap-3">
                <button type="button" className="text-sm underline" onClick={()=>{
                  setEditLinkId(link.id);setEditMaterialId(link.material_id);
                }}>{t("reassign")}</button>
                <button type="button" className="text-sm underline" disabled={busy}
                  onClick={()=>void unlink(link)}>{t("unlink")}</button>
              </div>
              {editLinkId===link.id&&<form className="space-y-2 mt-2" onSubmit={saveLink}>
                <select aria-label={t("replacement")} className={inputClass}
                  value={editMaterialId} onChange={e=>setEditMaterialId(e.target.value)}>
                  {materials.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
                <button className={actionClass} disabled={busy||!editMaterialId}>{t("saveAssociation")}</button>
                <button type="button" className="px-3" onClick={()=>setEditLinkId("")}>{t("cancel")}</button>
              </form>}
            </li>;
          })}</ul>}
      </div>
    </section>
  );
}
