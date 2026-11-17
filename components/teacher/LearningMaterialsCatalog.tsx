"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {useTranslations} from "next-intl";

type MaterialKind="game"|"puzzle"|"drill"|"study_chapter"|"external_link";
type Material={
  id:string;kind:MaterialKind;title:string;description:string;source_url:string|null;revision:number;archived_at:string|null;
  chess_games:{pgn:string;white_player:string;black_player:string;result:string}|null;
  chess_puzzles:{fen:string;solution:string|null;themes:string[]}|null;
  chess_drills:{instructions:string;mode:string;repetitions:number|null}|null;
  chess_study_chapters:{provider:string;study_id:string;chapter_id:string|null}|null;
};
const field="w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";
const kinds:MaterialKind[]=["game","puzzle","drill","study_chapter","external_link"];
export function LearningMaterialsCatalog(){
  const t=useTranslations("materialCatalog");
  const labels:Record<MaterialKind,string>={
    game:t("kindGame"),puzzle:t("kindPuzzle"),drill:t("kindDrill"),
    study_chapter:t("kindChapter"),external_link:t("kindExternal")
  };
  const [items,setItems]=useState<Material[]>([]);
  const [editing,setEditing]=useState<{id:string;revision:number}|null>(null);
  const [relationSource,setRelationSource]=useState<Material|null>(null);
  const [targetMaterialId,setTargetMaterialId]=useState("");
  const [relationType,setRelationType]=useState<"extracted_from"|"derived_from"|"prerequisite">("derived_from");
  const [relationAction,setRelationAction]=useState<"link"|"unlink">("link");
  const [relations,setRelations]=useState<Array<{from_material_id:string;to_material_id:string;relation_type:string}>>([]);
  const [total,setTotal]=useState(0);
  const [kind,setKind]=useState<MaterialKind>("game");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [pgn,setPgn]=useState("");
  const [white,setWhite]=useState("");
  const [black,setBlack]=useState("");
  const [result,setResult]=useState<"1-0"|"0-1"|"1/2-1/2"|"*">("*");
  const [fen,setFen]=useState("");
  const [solution,setSolution]=useState("");
  const [themes,setThemes]=useState("");
  const [instructions,setInstructions]=useState("");
  const [mode,setMode]=useState<"calculation"|"repetition"|"endgame"|"opening"|"other">("other");
  const [repetitions,setRepetitions]=useState("");
  const [provider,setProvider]=useState<"lichess"|"other">("lichess");
  const [studyId,setStudyId]=useState("");
  const [chapterId,setChapterId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState<MaterialKind|"">("");
  const [showArchived,setShowArchived]=useState(false);
  const [archivePreview,setArchivePreview]=useState<{
    materialId:string;title:string;revision:number;archived:boolean;
    assignmentCount:number;relationshipCount:number;canArchive:boolean;
  }|null>(null);
  const load=useCallback(async()=>{
    const params=new URLSearchParams({limit:"100",includeArchived:showArchived?"true":"false"});
    if(filter)params.set("kind",filter);
    if(search.trim())params.set("query",search.trim());
    const response=await fetch("/api/training/materials?"+params,{cache:"no-store"});
    if(!response.ok)throw new Error(t("loadFailed"));
    const data=await response.json() as {materials:Material[];total:number};
    setItems(data.materials);setTotal(data.total);
  },[filter,search,showArchived,t]);
  useEffect(()=>{let active=true;
    void load().catch(()=>{if(active)setError(t("loadError"));});
    return()=>{active=false};
  },[load,t]);
  function beginEdit(material:Material){
    setEditing({id:material.id,revision:material.revision});
    setKind(material.kind);setTitle(material.title);setDescription(material.description);
    setSourceUrl(material.source_url??"");
    setPgn(material.chess_games?.pgn??"");
    setWhite(material.chess_games?.white_player??"");
    setBlack(material.chess_games?.black_player??"");
    setResult((material.chess_games?.result??"*") as typeof result);
    setFen(material.chess_puzzles?.fen??"");
    setSolution(material.chess_puzzles?.solution??"");
    setThemes(material.chess_puzzles?.themes.join(", ")??"");
    setInstructions(material.chess_drills?.instructions??"");
    setMode((material.chess_drills?.mode??"other") as typeof mode);
    setRepetitions(material.chess_drills?.repetitions?.toString()??"");
    setProvider((material.chess_study_chapters?.provider??"lichess") as typeof provider);
    setStudyId(material.chess_study_chapters?.study_id??"");
    setChapterId(material.chess_study_chapters?.chapter_id??"");
    setStatus("");setError("");
  }
  async function previewMaterialArchive(material:Material){
    setArchivePreview(null);setError("");setStatus("");
    try{
      const response=await fetch("/api/training/materials/lifecycle?"+
        new URLSearchParams({materialId:material.id}),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("inspectError"));
      setArchivePreview(data);
    }catch(e){setError(e instanceof Error?e.message:t("archiveUnavailable"));}
  }
  async function changeMaterialLifecycle(materialId:string,revision:number,action:"archive"|"restore"){
    setBusy(true);setError("");setStatus("");
    try{
      const response=await fetch("/api/training/materials/lifecycle",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({materialId,expectedRevision:revision,action,
          requestId:crypto.randomUUID(),confirmed:true}),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("lifecycleError"));
      setStatus(action==="archive"?t("archived"):t("restored"));
      setArchivePreview(null);await load();
    }catch(e){setError(e instanceof Error?e.message:t("lifecycleFailed"));}
    finally{setBusy(false);}
  }
  async function selectRelationshipSource(material:Material){
    setRelationSource(material);setTargetMaterialId("");setError("");setStatus("");
    try{
      const response=await fetch("/api/training/materials/relations?"+
        new URLSearchParams({materialId:material.id}),{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("fetchRelations"));
      setRelations(data.relations??[]);
    }catch(e){setError(e instanceof Error?e.message:t("fetchRelations"));}
  }
  async function changeRelation(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!relationSource)return;
    setBusy(true);setError("");setStatus("");
    try{
      const response=await fetch("/api/training/materials/relations",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          fromMaterialId:relationSource.id,toMaterialId:targetMaterialId,
          relationType,action:relationAction,expectedRevision:relationSource.revision,
          requestId:crypto.randomUUID(),confirmed:true,
        }),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("changeRelation"));
      setStatus(relationAction==="link"?t("relationLinked"):t("relationUnlinked"));
      setRelationSource(null);setRelations([]);setTargetMaterialId("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:t("relationFailed"));}
    finally{setBusy(false);}
  }
  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setStatus("");
    const details:Record<string,unknown>=kind==="game"
      ?{pgn,whitePlayer:white,blackPlayer:black,result}
      :kind==="puzzle"?{fen,solution:solution||null,themes:themes.split(",").map(x=>x.trim()).filter(Boolean)}
      :kind==="drill"?{instructions,mode,repetitions:repetitions?Number(repetitions):null}
      :kind==="study_chapter"?{provider,studyId,chapterId:chapterId||null}
      :{};
    const payload={
      kind,title:title.trim(),description,sourceUrl:sourceUrl.trim()||null,details,
      requestId:crypto.randomUUID(),
      ...(editing?{materialId:editing.id,expectedRevision:editing.revision,confirmed:true}:{}),
    };
    try {
      const response=await fetch("/api/training/materials",{
        method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||t("createError"));
      setStatus(editing?t("corrected"):t("saved"));
      setEditing(null);
      setTitle("");setDescription("");setPgn("");setFen("");setInstructions("");
      setSourceUrl("");setStudyId("");setChapterId("");setThemes("");setSolution("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:t("saveFailed"));}
    finally{setBusy(false);}
  }
  return <section className="space-y-4" aria-label={t("aria")}>
    <div>
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>
    </div>
    {archivePreview&&<div className="rounded-xl border border-border p-4 space-y-2" aria-label={t("archiveAria")}>
      <h3 className="font-semibold">{t("archivePreview",{name:archivePreview.title})}</h3>
      <p className="text-sm text-muted">{t("archiveImpact",{
      assignments:archivePreview.assignmentCount,relations:archivePreview.relationshipCount})}</p>
      {!archivePreview.canArchive&&<p role="alert" className="text-sm text-red-500">{t("archiveBlocked")}</p>}
      <div className="flex gap-2">
        <button type="button" className={button} disabled={busy||!archivePreview.canArchive} onClick={()=>{void changeMaterialLifecycle(archivePreview.materialId,archivePreview.revision,"archive");}}>{t("confirmArchive")}</button>
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={()=>setArchivePreview(null)}>{t("cancel")}</button>
      </div>
    </div>}
    {relationSource&&<form onSubmit={changeRelation} className="rounded-xl border border-border p-4 space-y-3" aria-label={t("relationshipsAria")}>
      <h3 className="font-semibold">{t("relationshipsTitle",{name:relationSource.title})}</h3>
      <p className="text-xs text-muted">{t("relationshipsHint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">{t("operation")}
          <select className={field} value={relationAction} onChange={e=>setRelationAction(e.target.value as "link"|"unlink")}>
            <option value="link">{t("link")}</option><option value="unlink">{t("unlink")}</option>
          </select>
        </label>
        <label className="text-sm">{t("relationship")}
          <select className={field} value={relationType} onChange={e=>setRelationType(e.target.value as typeof relationType)}>
            <option value="derived_from">{t("derivedFrom")}</option>
            <option value="extracted_from">{t("extractedFrom")}</option>
            <option value="prerequisite">{t("prerequisite")}</option>
          </select>
        </label>
        <label className="text-sm">{t("targetMaterial")}
          <select className={field} required value={targetMaterialId} onChange={e=>setTargetMaterialId(e.target.value)}>
            <option value="">{t("chooseMaterial")}</option>
            {items.filter(m=>m.id!==relationSource.id).map(m=><option key={m.id} value={m.id}>{labels[m.kind]}: {m.title}</option>)}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={button} disabled={busy||!targetMaterialId}>{relationAction==="link"?t("saveRelationship"):t("removeRelationship")}</button>
        <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={()=>{setRelationSource(null);setRelations([]);}}>{t("cancel")}</button>
      </div>
      <p className="text-xs text-muted">{t("existingRelations",{count:relations.length})}</p>
    </form>}
    <form onSubmit={create} className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-lg font-semibold">{editing?t("correctMaterial"):t("addMaterial")}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{t("materialType")}
          <select className={field} value={kind} disabled={!!editing} onChange={e=>setKind(e.target.value as MaterialKind)}>
            {kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}
          </select>
        </label>
        <label className="text-sm">{t("titleField")}
          <input className={field} value={title} maxLength={160} required onChange={e=>setTitle(e.target.value)}/>
        </label>
      </div>
      <label className="block text-sm">{t("description")}
        <textarea className={field} rows={2} maxLength={4000} value={description} onChange={e=>setDescription(e.target.value)}/>
      </label>
      <label className="block text-sm">{t("sourceUrl")} {kind==="study_chapter"||kind==="external_link"?t("required"):t("optional")}
        <input dir="ltr" className={field} type="url" value={sourceUrl} required={kind==="study_chapter"||kind==="external_link"} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://lichess.org/study/..."/>
      </label>
      {kind==="game"&&<div className="space-y-2">
        <label className="block text-sm">{t("gamePgn")}
          <textarea dir="ltr" className={field} rows={5} value={pgn} required onChange={e=>setPgn(e.target.value)} placeholder={"1. e4 e5 2. Nf3 Nc6 *"}/>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">{t("white")}<input className={field} value={white} maxLength={120} onChange={e=>setWhite(e.target.value)}/></label>
          <label className="text-sm">{t("black")}<input className={field} value={black} maxLength={120} onChange={e=>setBlack(e.target.value)}/></label>
          <label className="text-sm">{t("result")}
            <select className={field} value={result} onChange={e=>setResult(e.target.value as typeof result)}>
              {["*","1-0","0-1","1/2-1/2"].map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">{t("pgnWarning")}</p>
      </div>}
      {kind==="puzzle"&&<div className="space-y-2">
        <label className="block text-sm">{t("puzzleFen")}
          <input dir="ltr" className={field} value={fen} required onChange={e=>setFen(e.target.value)} placeholder="... w KQkq - 0 1"/>
        </label>
        <label className="block text-sm">{t("solution")}
          <textarea dir="ltr" className={field} rows={2} value={solution} onChange={e=>setSolution(e.target.value)}/>
        </label>
        <label className="block text-sm">{t("themes")}
          <input className={field} value={themes} onChange={e=>setThemes(e.target.value)} placeholder={t("themesExample")}/>
        </label>
      </div>}
      {kind==="drill"&&<div className="space-y-2">
        <label className="block text-sm">{t("drillInstructions")}
          <textarea className={field} rows={3} required value={instructions} onChange={e=>setInstructions(e.target.value)}/>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">{t("mode")}
            <select className={field} value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>
              {(["other","calculation","repetition","endgame","opening"] as const).map(v=>
                <option key={v} value={v}>{t(v==="other"?"modeOther":v==="calculation"?"modeCalculation":
                  v==="repetition"?"modeRepetition":v==="endgame"?"modeEndgame":"modeOpening")}</option>)}
            </select>
          </label>
          <label className="text-sm">{t("repetitions")}
            <input className={field} type="number" min={1} max={10000} value={repetitions} onChange={e=>setRepetitions(e.target.value)}/>
          </label>
        </div>
      </div>}
      {kind==="study_chapter"&&<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-sm">{t("provider")}
          <select className={field} value={provider} onChange={e=>setProvider(e.target.value as typeof provider)}>
            <option value="lichess">Lichess</option><option value="other">{t("providerOther")}</option>
          </select>
        </label>
        <label className="text-sm">{t("studyId")}
          <input dir="ltr" className={field} maxLength={128} value={studyId} required onChange={e=>setStudyId(e.target.value)}/>
        </label>
        <label className="text-sm">{t("chapterId")}
          <input dir="ltr" className={field} maxLength={128} value={chapterId} onChange={e=>setChapterId(e.target.value)}/>
        </label>
      </div>}
      <div className="flex gap-2">
        <button className={button} type="submit" disabled={busy}>{busy?t("saving"):editing?t("saveCorrection"):t("saveMaterial")}</button>
        {editing&&<button className="rounded-lg border border-border px-4 py-2 text-sm" type="button" onClick={()=>{
          setEditing(null);setTitle("");setDescription("");setPgn("");setFen("");
          setInstructions("");setSourceUrl("");setStudyId("");setChapterId("");
          setThemes("");setSolution("");setStatus("");setError("");
        }}>{t("cancelCorrection")}</button>}
      </div>
      {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
      {status&&<p role="status" className="text-sm text-emerald-600">{status}</p>}
    </form>
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <input className={field+" sm:max-w-xs"} aria-label={t("searchAria")} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("searchHint")}/>
        <select className={field+" sm:max-w-xs"} aria-label={t("filterAria")} value={filter} onChange={e=>setFilter(e.target.value as MaterialKind|"")}>
          <option value="">{t("allTypes")}</option>{kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/>{t("includeArchived")}
      </label>
      <p className="text-sm text-muted">{t("showing",{shown:items.length,total})}</p>
      {items.map(material=><div key={material.id} className="rounded-lg border border-border p-3 space-y-1">
        <strong className="text-sm"><bdi dir="auto">{material.title}</bdi></strong>
        <span className="ms-2 text-xs text-muted">{labels[material.kind]}</span>
        <button className="ms-3 rounded border border-border px-2 py-1 text-xs" type="button" onClick={()=>beginEdit(material)} aria-label={t("correctAria",{name:material.title})}>{t("correctButton")}</button>
        <button className="ms-2 rounded border border-border px-2 py-1 text-xs" type="button" onClick={()=>{void selectRelationshipSource(material);}} aria-label={t("linkAria",{name:material.title})}>{t("relationsButton")}</button>
        {material.archived_at
          ?<button type="button" className="ms-2 rounded border border-border px-2 py-1 text-xs" onClick={()=>{void changeMaterialLifecycle(material.id,material.revision,"restore");}} aria-label={t("restoreAria",{name:material.title})}>{t("restoreButton")}</button>
          :<button type="button" className="ms-2 rounded border border-border px-2 py-1 text-xs" onClick={()=>{void previewMaterialArchive(material);}} aria-label={t("archiveButtonAria",{name:material.title})}>{t("archiveButton")}</button>}
        {material.description&&<p className="text-sm" dir="auto">{material.description}</p>}
        {material.chess_games&&<p className="text-xs text-muted"><bdi dir="auto">{material.chess_games.white_player}</bdi>
         {" – "}<bdi dir="auto">{material.chess_games.black_player}</bdi>
         {" ("}<bdi dir="ltr">{material.chess_games.result}</bdi>{")"}</p>}
        {material.chess_puzzles&&<p className="text-xs font-mono break-all" dir="ltr">FEN: {material.chess_puzzles.fen}</p>}
        {material.chess_drills&&<p className="text-sm" dir="auto">{material.chess_drills.instructions}</p>}
        {material.chess_study_chapters&&<p className="text-xs text-muted">{t("studyChapterSummary",{
        study:material.chess_study_chapters.study_id,
        chapter:material.chess_study_chapters.chapter_id||t("notSpecified")})}</p>}
        {material.source_url&&<a className="text-sm underline" href={material.source_url} target="_blank" rel="noopener noreferrer">{t("originalSource")}</a>}
      </div>)}
    </div>
  </section>;
}
