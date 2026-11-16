"use client";

import {useState,useEffect,useCallback} from "react";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {useConfirm} from "@/components/ui/confirm-dialog";
type Student={id:string;name:string;archived_at:string|null;updated_at:string};
type PreviewRow={studentId:string;name:string;currentArchived:boolean;
 requestedArchived:boolean;canChange:boolean;stale:boolean;blockers:Record<string,number>};
type Preview={rows:PreviewRow[];previewDigest:string;canCommit:boolean;
 quotaBlocked:boolean;activeStudentCountBefore:number;activeStudentCountAfter:number};
const asJson=async(res:Response)=>{
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error??"Request failed");
 return data;
};
export function BulkStudentLifecyclePanel(){
 const confirm=useConfirm();
 const [students,setStudents]=useState<Student[]>([]);
 const [chosen,setChosen]=useState<string[]>([]);
 const [action,setAction]=useState<"archive"|"reactivate">("archive");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [rows,setRows]=useState<Array<{studentId:string;archived:boolean;expectedUpdatedAt:string}>>([]);
 const [key,setKey]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const [message,setMessage]=useState<string|null>(null);
 const reload=useCallback(async()=>{
  const data=await asJson(await fetch("/api/students?includeArchived=true&limit=1000",{cache:"no-store"}));
  setStudents(data.students??[]);
 },[]);
 useEffect(()=>{void reload().catch(()=>setError("Unable to load student roster"));},[reload]);
 const reset=()=>{setPreview(null);setRows([]);setKey("");};
 const available=students.filter(s=>action==="archive"?!s.archived_at:!!s.archived_at);
 async function review(){
  const selected=available.filter(s=>chosen.includes(s.id));
  if(!selected.length)return;
  setBusy(true);setError(null);setMessage(null);reset();
  try{
   const candidates=selected.map(s=>({studentId:s.id,
    archived:action==="archive",expectedUpdatedAt:s.updated_at}));
   const result=await asJson(await fetch("/api/students/bulk-lifecycle",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({rows:candidates}),
   }));
   setRows(candidates);setPreview(result);setKey(crypto.randomUUID());
  }catch(e){setError(e instanceof Error?e.message:"Preview failed");}
  finally{setBusy(false);}
 }
 async function commit(){
  if(!preview?.canCommit||!key)return;
  const approve=await confirm({title:"Confirm bulk student lifecycle",
   message:"Apply "+rows.length+" reviewed student status changes atomically? Student history will be preserved. Active workplace enrollments and future commitments block unsafe archiving.",
   confirmLabel:action==="archive"?"Archive selected":"Reactivate selected"});
  if(!approve)return;
  setBusy(true);setError(null);
  try{
   const result=await asJson(await fetch("/api/students/bulk-lifecycle",{
    method:"PUT",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({rows,previewDigest:preview.previewDigest,
     idempotencyKey:key,confirmed:true}),
   }));
   setMessage("Updated "+result.count+" students; historical records retained.");
   setChosen([]);reset();await reload();
  }catch(e){setError(e instanceof Error?e.message:"Bulk update failed");}
  finally{setBusy(false);}
 }
 return <Card id="bulk-student-lifecycle">
  <h2 className="font-semibold text-lg mb-1">Bulk archive and reactivate students</h2>
  <p className="text-sm text-muted mb-3">
   Archive former students without losing their history or consuming active-student quota.
   Active workplace enrollments, groups and future sessions must be resolved first.
  </p>
  <label className="block text-sm mb-3">Action
   <select className="rounded-lg border border-border bg-background p-2 ml-2"
    value={action} disabled={busy}
    onChange={e=>{setAction(e.target.value as "archive"|"reactivate");
     setChosen([]);reset();}}>
    <option value="archive">Archive</option><option value="reactivate">Reactivate</option>
   </select>
  </label>
  <div className="max-h-52 overflow-y-auto space-y-2 mb-3 text-sm">
   {available.map(s=><label key={s.id} className="flex items-center gap-2">
    <input type="checkbox" checked={chosen.includes(s.id)}
     disabled={busy||(!chosen.includes(s.id)&&chosen.length>=100)}
     onChange={e=>{setChosen(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id));reset();}}/>
    {s.name} <span className="text-muted text-xs">({s.id.slice(0,8)})</span>
   </label>)}
   {available.length===0&&<p className="text-muted">No students available for this action.</p>}
  </div>
  <Button type="button" disabled={busy||chosen.length===0}
   onClick={()=>void review()}>Preview {chosen.length} status changes</Button>
  {preview&&<section className="border-t border-border mt-3 pt-3 text-sm space-y-2">
   <p>Active student count: {preview.activeStudentCountBefore} → {preview.activeStudentCountAfter}.</p>
   {preview.quotaBlocked&&<p role="alert" className="text-error">
    Reactivation would exceed your active-student quota.</p>}
   {preview.rows.map(r=><div key={r.studentId} className="border-b border-border py-1">
    <span className="font-medium">{r.name}</span> · {r.canChange?"Ready":"Blocked"}
    {!r.canChange&&<p className="text-xs text-error">
     {r.stale?"Student changed since selection. ":""}
     {Object.entries(r.blockers).filter(([,value])=>value>0)
      .map(([name,value])=>name+": "+value).join("; ")}
    </p>}
   </div>)}
   {preview.canCommit&&<Button type="button" disabled={busy}
    onClick={()=>void commit()}>Confirm {action}</Button>}
  </section>}
  {message&&<p role="status" className="text-success text-sm mt-3">{message}</p>}
  {error&&<p role="alert" className="text-error text-sm mt-3">{error}</p>}
 </Card>;
}
