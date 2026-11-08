"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";

type Student={id:string;name:string};
type Workplace={id:string;name:string};
type Resource={id:string;label:string;url:string};
type MaterialEntry={
 id:string;student_id:string;workplace_id:string|null;stage:"assigned"|"taught"|"completed";
 occurred_on:string;note:string;updated_at:string;session_id:string|null;
 chess_learning_resources:Resource|null;students:{name:string}|null;
};
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
 const [students,setStudents]=useState<Student[]>([]);
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [studentId,setStudentId]=useState(fixedStudentId||"");
 const [workplaceId,setWorkplaceId]=useState("");
 const [resources,setResources]=useState<Resource[]>([]);
 const [resourceId,setResourceId]=useState("");
 const [stage,setStage]=useState<"assigned"|"taught"|"completed">("taught");
 const [occurredOn,setOccurredOn]=useState(new Date().toISOString().slice(0,10));
 const [note,setNote]=useState("");
 const [rows,setRows]=useState<MaterialEntry[]>([]);
 const [nextOffset,setNextOffset]=useState<number|null>(null);
 const [total,setTotal]=useState(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [success,setSuccess]=useState("");

 useEffect(()=>{
  let active=true;
  void Promise.all([
   json("/api/students?limit=1000"),
   json("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"workplaces.list"})}),
  ]).then(([people,sites])=>{
   if(!active)return;
   const learners=(people.students??people) as Student[];
   setStudents(learners);
   setStudentId(old=>fixedStudentId??old??learners[0]?.id??"");
   if(!fixedStudentId)setStudentId(old=>old||learners[0]?.id||"");
   setWorkplaces((sites.data??[]) as Workplace[]);
  }).catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;};
 },[fixedStudentId]);
 const load=useCallback(async(offset=0)=>{
  if(!studentId&&!workplaceId){setRows([]);setTotal(0);setNextOffset(null);return;}
  const params=new URLSearchParams({limit:"50",offset:String(offset)});
  if(studentId)params.set("studentId",studentId);
  if(workplaceId)params.set("workplaceId",workplaceId);
  const result=await json("/api/coaching/materials?"+params) as MaterialResult;
  setRows(prev=>offset===0?result.entries:[...prev,...result.entries]);
  setNextOffset(result.nextOffset);setTotal(result.total);
 },[studentId,workplaceId]);
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(String(e));});return ()=>{active=false;};},[load]);
 useEffect(()=>{
  let active=true;
  if(!studentId){setResources([]);setResourceId("");return;}
  void json("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({action:"chess.resources.list",studentId}),
  }).then(v=>{if(active){const result=(v.data??[]) as Resource[];setResources(result);setResourceId(prev=>result.some(r=>r.id===prev)?prev:result[0]?.id||"");}})
   .catch(e=>{if(active)setError(String(e));});
  return ()=>{active=false;};
 },[studentId]);
 async function record(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!studentId||!resourceId)return;
  if(!window.confirm("Record this material as "+stage+" for the selected student? This is teacher-attested evidence."))return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({studentId,resourceId,...(workplaceId?{workplaceId}:{}),
     stage,occurredOn,note,requestId:crypto.randomUUID(),confirmed:true}),
   });
   setNote("");await load();setSuccess("Material evidence recorded.");
  }catch(e){setError(e instanceof Error?e.message:"Could not record material");}
  finally{setBusy(false);}
 }
 async function retract(row:MaterialEntry){
  const reason=window.prompt("Why is this teaching/material record incorrect? (minimum 5 characters)");
  if(!reason)return;
  setBusy(true);setError("");setSuccess("");
  try{
   await json("/api/coaching/materials",{method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({entryId:row.id,expectedUpdatedAt:row.updated_at,reason,confirmed:true}),
   });
   await load();setSuccess("Incorrect entry retracted; audit history remains preserved.");
  }catch(e){setError(e instanceof Error?e.message:"Could not correct history");}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-border bg-surface p-4 space-y-4" aria-label="Material learning history">
  <div>
   <h2 className="text-lg font-semibold">Materials assigned, taught and completed</h2>
   <p className="text-sm text-muted">Only explicitly recorded teacher evidence appears here. Merely linking a study does not mean it was taught or mastered.</p>
  </div>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {success&&<p role="status" className="text-sm text-success">{success}</p>}
  <div className="grid gap-3 md:grid-cols-2">
   <label className="text-sm">Student
    <select className={input} value={studentId} disabled={!!fixedStudentId} onChange={e=>setStudentId(e.target.value)}>
     <option value="">Choose student</option>
     {students.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
     {fixedStudentId&&!students.some(s=>s.id===fixedStudentId)&&<option value={fixedStudentId}>This student</option>}
    </select>
   </label>
   <label className="text-sm">Workplace (optional)
    <select className={input} value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)}>
     <option value="">All workplaces / private</option>
     {workplaces.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
    </select>
   </label>
  </div>
  <div className="space-y-2" aria-live="polite">
   <h3 className="font-medium">Recorded evidence ({total})</h3>
   {rows.length===0&&<p className="text-sm text-muted">No material learning evidence recorded for this selection.</p>}
   <ul className="space-y-2">
    {rows.map(row=><li key={row.id} className="border border-border rounded-lg p-3 flex justify-between gap-3">
     <div className="text-sm">
      <strong>{row.chess_learning_resources?.label||"Unlinked material"}</strong>
      <span className="ml-2 text-muted">{row.stage} · {row.occurred_on}</span>
      {row.note&&<p className="text-muted whitespace-pre-wrap">{row.note}</p>}
      {row.chess_learning_resources?.url&&<a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={row.chess_learning_resources.url}>Study source</a>}
     </div>
     <button type="button" className="text-sm text-primary disabled:opacity-50" disabled={busy} onClick={()=>void retract(row)}>Correct</button>
    </li>)}
   </ul>
   {nextOffset!==null&&<button type="button" className={button} disabled={busy} onClick={()=>void load(nextOffset).catch(e=>setError(String(e)))}>Load more</button>}
  </div>
  <form onSubmit={record} className="space-y-3 border-t border-border pt-3">
   <h3 className="font-medium">Record material evidence</h3>
   <p className="text-xs text-muted">First attach a study or HTTPS learning link in Chess learning, then select it here.</p>
   <div className="grid gap-3 md:grid-cols-2">
    <label className="text-sm">Study / reference
     <select className={input} value={resourceId} onChange={e=>setResourceId(e.target.value)} required>
      {!resources.length&&<option value="">No attached study yet</option>}
      {resources.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
     </select>
    </label>
    <label className="text-sm">Learning stage
     <select className={input} value={stage} onChange={e=>setStage(e.target.value as typeof stage)}>
      <option value="assigned">Assigned (not yet taught)</option>
      <option value="taught">Taught (not necessarily mastered)</option>
      <option value="completed">Teacher-confirmed completed</option>
     </select>
    </label>
    <label className="text-sm">Recorded date
     <input className={input} type="date" required value={occurredOn} onChange={e=>setOccurredOn(e.target.value)} />
    </label>
    <label className="text-sm">Evidence / context
     <input className={input} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} placeholder="Chapter, outcome or exercise notes" />
    </label>
   </div>
   <button type="submit" className={button} disabled={busy||!studentId||!resourceId}>{busy?"Saving…":"Confirm and record"}</button>
  </form>
 </section>;
}
