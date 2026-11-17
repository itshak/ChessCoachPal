"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";

type Student={id:string;name:string};
type Workplace={id:string;name:string};
type MaterialOption={id:string;title:string;source_url:string|null};
type Group={id:string;name:string;workplace_id:string};
type DefaultStudy={
 id:string;workplace_id:string;group_id:string|null;label:string;url:string;
 notes:string;updated_at:string;archived_at:string|null;
};
type DefaultHistory={id:string;default_id:string;action:string;
 before_value:Record<string,unknown>|null;after_value:Record<string,unknown>;created_at:string};
type MaterialEntry={
 id:string;student_id:string;workplace_id:string|null;stage:"assigned"|"taught"|"completed";
 occurred_on:string;note:string;updated_at:string;session_id:string|null;
 learning_materials:MaterialOption|null;students:{name:string}|null;
};
type MaterialAggregate={evidenceClaims:number;studentCount:number;sessionCount:number;
 uniqueSessionMaterialStageCount:number;stages:{assigned:number;taught:number;completed:number};
 materials:Array<{materialId:string;label:string|null;stages:{assigned:number;taught:number;completed:number};
  studentCount:number;sessionCount:number}>};
type MaterialResult={entries:MaterialEntry[];total:number;nextOffset:number|null;
 pageSummary:{entries:number;studentCount:number;uniqueSessionMaterialCount:number};
 summaryScope:string;truthBasis:string};
const input="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground w-full";
const button="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";
async function json(url:string,init?:RequestInit){
 const resp=await fetch(url,{cache:"no-store",...init});
 const result=await resp.json();
 if(!resp.ok)throw new Error(result?.error||"Material history unavailable");
 return result;
}
export function MaterialHistoryPanel({fixedStudentId}:{fixedStudentId?:string}){
 const t=useTranslations("materialHistory"),locale=useLocale();
  const toUserError=useLocalizedApiError();
 const stageLabel=(s:"assigned"|"taught"|"completed")=>
   t(s==="assigned"?"statusAssigned":s==="taught"?"statusTaught":"statusCompleted");
 const [students,setStudents]=useState<Student[]>([]);
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [groups,setGroups]=useState<Group[]>([]);
 const [groupId,setGroupId]=useState("");
 const [defaults,setDefaults]=useState<DefaultStudy[]>([]);
 const [defaultHistory,setDefaultHistory]=useState<DefaultHistory[]>([]);
 const [studyLabel,setStudyLabel]=useState("");
 const [studyUrl,setStudyUrl]=useState("");
 const [studyNotes,setStudyNotes]=useState("");
 const [editDefaultId,setEditDefaultId]=useState("");
 const [editDefaultLabel,setEditDefaultLabel]=useState("");
 const [editDefaultUrl,setEditDefaultUrl]=useState("");
 const [editDefaultNotes,setEditDefaultNotes]=useState("");
 const [studentId,setStudentId]=useState(fixedStudentId||"");
 const [workplaceId,setWorkplaceId]=useState("");
 const [materials,setMaterials]=useState<MaterialOption[]>([]);
 const [materialId,setMaterialId]=useState("");
 const [stage,setStage]=useState<"assigned"|"taught"|"completed">("taught");
 const [occurredOn,setOccurredOn]=useState(new Date().toISOString().slice(0,10));
 const [note,setNote]=useState("");
 const [rows,setRows]=useState<MaterialEntry[]>([]);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const [total,setTotal]=useState(0);
 const [aggregate,setAggregate]=useState<MaterialAggregate|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");

 useEffect(()=>{
  let active=true;
  void Promise.all([
   json("/api/students?limit=1000"),
   json("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"workplaces.list"})}),
   json("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"groups.list"})}),
  ]).then(([people,sites,classes])=>{
   if(!active)return;
   const learners=(people.students??people) as Student[];
   setStudents(learners);
   setStudentId(old=>fixedStudentId??old??learners[0]?.id??"");
   if(!fixedStudentId)setStudentId(old=>old||learners[0]?.id||"");
   setWorkplaces((sites.data??[]) as Workplace[]);
   setGroups((classes.data??[]) as Group[]);
  }).catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;};
 },[fixedStudentId]);
 const loadDefaults=useCallback(async()=>{
  if(!workplaceId){setDefaults([]);setDefaultHistory([]);return;}
  const params=new URLSearchParams({defaults:"true",workplaceId,includeArchived:"true"});
  if(groupId)params.set("groupId",groupId);
  const data=await json("/api/coaching/materials?"+params) as {
    defaults:DefaultStudy[];history:DefaultHistory[];
  };
  setDefaults(data.defaults.filter(x=>!x.archived_at));setDefaultHistory(data.history);
 },[workplaceId,groupId]);
 useEffect(()=>{let active=true;void loadDefaults().catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;};},[loadDefaults]);
 async function addDefault(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!workplaceId)return;
  if(!window.confirm(t("addDefaultConfirm")))return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({operation:"default.create",workplaceId,
     ...(groupId?{groupId}:{}),label:studyLabel.trim(),url:studyUrl.trim(),
     notes:studyNotes,requestId:crypto.randomUUID(),confirmed:true}),
   });
   setStudyLabel("");setStudyUrl("");setStudyNotes("");
   await loadDefaults();setSuccess(t("addedDefault"));
  }catch(e){setError(toUserError(e, t("addDefaultFailed")));}
  finally{setBusy(false);}
 }
 async function updateDefault(item:DefaultStudy){
  if(!window.confirm(t("updateDefaultConfirm")))return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({operation:"default.update",defaultId:item.id,
      expectedUpdatedAt:item.updated_at,label:editDefaultLabel.trim(),
      url:editDefaultUrl.trim(),notes:editDefaultNotes,confirmed:true}),
   });
   setEditDefaultId("");await loadDefaults();setSuccess(t("updatedDefault"));
  }catch(e){setError(toUserError(e, t("updateDefaultFailed")));}
  finally{setBusy(false);}
 }
 async function archiveDefault(item:DefaultStudy){
  if(!window.confirm(t("archiveDefaultConfirm")))return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({operation:"default.archive",defaultId:item.id,
      expectedUpdatedAt:item.updated_at,confirmed:true}),
   });
   await loadDefaults();setSuccess(t("archivedDefault"));
  }catch(e){setError(toUserError(e, t("archiveDefaultFailed")));}
  finally{setBusy(false);}
 }
 const load=useCallback(async(offset=0)=>{
  if(!studentId&&!workplaceId){setRows([]);setTotal(0);setNextOffset(null);return;}
  const params=new URLSearchParams({limit:"50",offset:String(offset)});
  if(studentId)params.set("studentId",studentId);
  if(workplaceId)params.set("workplaceId",workplaceId);
  const [result,summary]=await Promise.all([
   json("/api/coaching/materials?"+params) as Promise<MaterialResult>,
   offset===0 ? json("/api/coaching/materials?"+new URLSearchParams({
     ...Object.fromEntries(params.entries()),aggregate:"true",offset:"0",
   })) as Promise<MaterialAggregate> : Promise.resolve(null),
  ]);
  if(summary)setAggregate(summary);
  setRows(prev=>offset===0?result.entries:[...prev,...result.entries]);
  setNextOffset(result.nextOffset);setTotal(result.total);
 },[studentId,workplaceId]);
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(String(e));});return ()=>{active=false;};},[load]);
 useEffect(()=>{
  let active=true;
  if(!studentId){setMaterials([]);setMaterialId("");return;}
  void json("/api/training/materials?limit=100")
   .then(v=>{if(active){const result=(v.materials??[]) as MaterialOption[];setMaterials(result);
     setMaterialId(prev=>result.some(r=>r.id===prev)?prev:result[0]?.id||"");}})
   .catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;};
 },[studentId]);
 async function record(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!studentId||!materialId)return;
  if(!window.confirm(t("recordConfirm",{stage:stageLabel(stage)})))return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({studentId,materialId,...(workplaceId?{workplaceId}:{}),
     stage,occurredOn,note,requestId:crypto.randomUUID(),confirmed:true}),
   });
   setNote("");await load();setSuccess(t("evidenceSaved"));
  }catch(e){setError(toUserError(e, t("evidenceFailed")));}
  finally{setBusy(false);}
 }
 async function retract(row:MaterialEntry){
  const reason=window.prompt(t("retractReason"));
  if(!reason)return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({entryId:row.id,expectedUpdatedAt:row.updated_at,reason,confirmed:true}),
   });
   await load();setSuccess(t("retracted"));
  }catch(e){setError(toUserError(e, t("retractFailed")));}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-border bg-surface p-4 space-y-4" aria-label={t("aria")}>
  <div>
   <h2 className="text-lg font-semibold">{t("title")}</h2>
   <p className="text-sm text-muted">{t("intro")}</p>
  </div>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {success&&<p role="status" className="text-sm text-success">{success}</p>}
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
   <label className="text-sm">{t("student")}
    <select className={input} value={studentId} disabled={!!fixedStudentId} onChange={e=>setStudentId(e.target.value)}>
     <option value="">{t("chooseStudent")}</option>
     {students.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
     {fixedStudentId&&!students.some(s=>s.id===fixedStudentId)&&<option value={fixedStudentId}>{t("thisStudent")}</option>}
    </select>
   </label>
   <label className="text-sm">{t("workplaceOptional")}
    <select className={input} value={workplaceId}
      onChange={e=>{setWorkplaceId(e.target.value);setGroupId("");}}> 
     <option value="">{t("allWorkplaces")}</option>
     {workplaces.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
    </select>
   </label>
  </div>
  {workplaceId&&<section aria-label={t("defaultAria")} className="border border-border rounded-lg p-3 space-y-3">
   <h3 className="font-semibold">{t("defaultsTitle")}</h3>
   <p className="text-xs text-muted">{t("defaultsHint")}</p>
   <label className="text-sm block">{t("groupOptional")}
    <select className={input} aria-label={t("groupAria")} value={groupId}
      onChange={e=>setGroupId(e.target.value)}>
     <option value="">{t("allDefaults")}</option>
     {groups.filter(g=>g.workplace_id===workplaceId)
       .map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
    </select>
   </label>
   <form onSubmit={addDefault} className="grid grid-cols-1 md:grid-cols-2 gap-2">
    <label className="text-xs">{t("studyLabel")}
     <input className={input} aria-label={t("newDefaultLabelAria")} required maxLength={160}
       value={studyLabel} onChange={e=>setStudyLabel(e.target.value)}/>
    </label>
    <label className="text-xs">{t("studyUrl")}
     <input type="url" className={input} aria-label={t("newDefaultUrlAria")}
       required maxLength={500} placeholder="https://lichess.org/study/AbCd1234"
       value={studyUrl} onChange={e=>setStudyUrl(e.target.value)}/>
    </label>
    <label className="text-xs md:col-span-2">{t("teachingNotes")}
     <input className={input} maxLength={1000} value={studyNotes}
       onChange={e=>setStudyNotes(e.target.value)}/>
    </label>
    <button className={button} disabled={busy}>{t("addDefault")}</button>
   </form>
   <ul className="space-y-2">
    {defaults.map(item=><li key={item.id} className="border-t border-border pt-2 space-y-1 text-sm">
      {editDefaultId===item.id?<div className="space-y-2">
       <input aria-label={t("editDefaultLabelAria")} className={input} value={editDefaultLabel}
         onChange={e=>setEditDefaultLabel(e.target.value)}/>
       <input aria-label={t("editDefaultUrlAria")} className={input} value={editDefaultUrl}
         onChange={e=>setEditDefaultUrl(e.target.value)}/>
       <input aria-label={t("editDefaultNotesAria")} className={input} value={editDefaultNotes}
         onChange={e=>setEditDefaultNotes(e.target.value)}/>
       <button className={button} type="button" disabled={busy}
         onClick={()=>void updateDefault(item)}>{t("saveDefault")}</button>
       <button type="button" className="ms-2 underline" onClick={()=>setEditDefaultId("")}>{t("cancel")}</button>
      </div>:<>
       <p><strong><bdi dir="auto">{item.label}</bdi></strong> · {item.group_id?t("group"):t("workplace")}</p>
       <a href={item.url} target="_blank" rel="noopener noreferrer"
         className="text-primary underline break-all">{item.url}</a>
       {item.notes&&<p className="text-xs text-muted">{item.notes}</p>}
       <div className="flex gap-3 text-xs">
        <button type="button" className="underline" onClick={()=>{
          setEditDefaultId(item.id);setEditDefaultLabel(item.label);
          setEditDefaultUrl(item.url);setEditDefaultNotes(item.notes);
        }}>{t("edit")}</button>
        <button type="button" className="underline" disabled={busy}
          onClick={()=>void archiveDefault(item)}>{t("archive")}</button>
       </div>
      </>}
    </li>)}
   </ul>
   <details>
    <summary className="text-xs cursor-pointer">{t("defaultHistory",{count:defaultHistory.length})}</summary>
    <ol className="text-xs space-y-1 mt-2">
      {defaultHistory.slice(0,50).map(item=><li key={item.id}>
        {new Date(item.created_at).toLocaleString(locale)} · {item.action} · {String(item.after_value.label??t("fallbackStudy"))}
      </li>)}
    </ol>
   </details>
  </section>}
  <div className="space-y-2" aria-live="polite">
   <h3 className="font-medium">{t("recordedEvidence",{count:total})}</h3>
   {aggregate&&<div className="text-sm rounded-lg border border-border p-3 space-y-2" aria-label={t("aggregateAria")}>
    <p className="font-medium">{t("aggregateHeadline",{count:aggregate.evidenceClaims})}</p>
    <p className="text-muted">{t("aggregateCounts",{assigned:aggregate.stages.assigned,
      taught:aggregate.stages.taught,completed:aggregate.stages.completed,
      students:aggregate.studentCount,combinations:aggregate.uniqueSessionMaterialStageCount})}</p>
    <ul className="space-y-1">{aggregate.materials.map(item=><li key={item.materialId}>
     {t("aggregateRow",{name:item.label||t("linkedMaterial"),
       assigned:item.stages.assigned,taught:item.stages.taught,
       completed:item.stages.completed,students:item.studentCount})}
    </li>)}</ul>
   </div>}
   {rows.length===0&&<p className="text-sm text-muted">{t("noEvidence")}</p>}
   <ul className="space-y-2">
    {rows.map(row=><li key={row.id} className="border border-border rounded-lg p-3 flex justify-between gap-3">
     <div className="text-sm">
      <strong><bdi dir="auto">{row.learning_materials?.title||t("unknownMaterial")}</bdi></strong>
      <span className="ms-2 text-muted">{stageLabel(row.stage)} · {row.occurred_on}</span>
      {row.note&&<p className="text-muted whitespace-pre-wrap" dir="auto">{row.note}</p>}
      {row.learning_materials?.source_url&&<a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={row.learning_materials.source_url}>{t("sourceLink")}</a>}
     </div>
     <button type="button" className="text-sm text-primary disabled:opacity-50" disabled={busy} onClick={()=>void retract(row)}>{t("correct")}</button>
    </li>)}
   </ul>
   {nextOffset!==null&&<button type="button" className={button} disabled={busy} onClick={()=>void load(nextOffset).catch(e=>setError(String(e)))}>{t("loadMore")}</button>}
  </div>
  <form onSubmit={record} className="space-y-3 border-t border-border pt-3">
   <h3 className="font-medium">{t("recordTitle")}</h3>
   <p className="text-xs text-muted">{t("recordHint")}</p>
   <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
    <label className="text-sm">{t("studyReference")}
     <select className={input} value={materialId} onChange={e=>setMaterialId(e.target.value)} required>
      {!materials.length&&<option value="">{t("firstMaterial")}</option>}
      {materials.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}
     </select>
    </label>
    <label className="text-sm">{t("stage")}
     <select className={input} value={stage} onChange={e=>setStage(e.target.value as typeof stage)}>
      <option value="assigned">{t("stageAssigned")}</option>
      <option value="taught">{t("stageTaught")}</option>
      <option value="completed">{t("stageCompleted")}</option>
     </select>
    </label>
    <label className="text-sm">{t("recordedDate")}
     <input className={input} type="date" required value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} />
    </label>
    <label className="text-sm">{t("context")}
     <input className={input} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder={t("contextHint")} />
    </label>
   </div>
   <button type="submit" className={button} disabled={busy||!studentId||!materialId}>{busy?t("saving"):t("confirmRecord")}</button>
  </form>
 </section>;
}
