"use client";
import {useEffect,useState,type FormEvent} from "react";
type Learner={id:string;name:string};
type Workplace={id:string;name:string};
type Item={resourceId:string;label:string;url:string;
 assignmentStudentCount:number;taughtStudentCount:number;
 completedStudentCount:number;distinctTeachingEvents:number;
 firstEvidenceDate:string;lastEvidenceDate:string};
type Report={totals:{resourceCount:number;studentCount:number;
 assignmentEvidenceCount:number;teachingEvidenceCount:number;completionEvidenceCount:number;
 distinctTeachingEvents:number};materials:Item[];warnings:string[];
 completeRange:boolean;filter:{from:string;to:string}};
const field="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground";
const today=new Date().toISOString().slice(0,10);
export function MaterialCoverageReportPanel(){
 const [students,setStudents]=useState<Learner[]>([]);
 const [sites,setSites]=useState<Workplace[]>([]);
 const [studentId,setStudentId]=useState("");
 const [workplaceId,setWorkplaceId]=useState("");
 const [from,setFrom]=useState(today.slice(0,7)+"-01");
 const [to,setTo]=useState(today);
 const [result,setResult]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  void Promise.all([
   fetch("/api/students?limit=1000").then(x=>x.json()),
   fetch("/api/agent/v1",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"workplaces.list"})}).then(x=>x.json()),
  ]).then(([people,places])=>{
   if(!active)return;
   setStudents(people.students??people);
   setSites(places.data??[]);
  }).catch(()=>{if(active)setError("Unable to load report choices");});
  return ()=>{active=false;};
 },[]);
 async function run(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");setResult(null);setBusy(true);
  try{
   if(!studentId&&!workplaceId)throw new Error("Choose a student or workplace");
   const q=new URLSearchParams({from,to});
   if(studentId)q.set("studentId",studentId);
   if(workplaceId)q.set("workplaceId",workplaceId);
   const response=await fetch("/api/coaching/material-report?"+q,{cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error??"Could not generate report");
   setResult(body);
  }catch(e){setError(e instanceof Error?e.message:"Could not generate report");}
  finally{setBusy(false);}
 }
 return <section aria-label="Learning material coverage report" className="rounded-xl border border-border bg-surface p-4 space-y-4">
  <div>
   <h2 className="text-xl font-semibold">Learning material coverage report</h2>
   <p className="text-sm text-muted">Compare teacher-attested assignments, what was taught, and what students completed. Summaries cover the complete selected period, not just a displayed page.</p>
  </div>
  <form onSubmit={run} className="grid gap-3 md:grid-cols-2">
   <label className="text-sm">Workplace
    <select className={field} value={workplaceId} onChange={e=>setWorkplaceId(e.target.value)}>
     <option value="">All / select student below</option>
     {sites.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>
   <label className="text-sm">Student (optional)
    <select className={field} value={studentId} onChange={e=>setStudentId(e.target.value)}>
     <option value="">All students at selected workplace</option>
     {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>
   <label className="text-sm">From
    <input className={field} type="date" required value={from} onChange={e=>setFrom(e.target.value)}/>
   </label>
   <label className="text-sm">To
    <input className={field} type="date" required value={to} onChange={e=>setTo(e.target.value)}/>
   </label>
   <button type="submit" disabled={busy||(!studentId&&!workplaceId)}
    className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
    {busy?"Calculating…":"Generate coverage report"}
   </button>
  </form>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {result&&<div aria-live="polite" className="space-y-3">
   <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
    <div className="border border-border p-3 rounded-lg"><div className="text-xs text-muted">Resources</div><strong>{result.totals.resourceCount}</strong></div>
    <div className="border border-border p-3 rounded-lg"><div className="text-xs text-muted">Learners</div><strong>{result.totals.studentCount}</strong></div>
    <div className="border border-border p-3 rounded-lg"><div className="text-xs text-muted">Taught events</div><strong>{result.totals.distinctTeachingEvents}</strong></div>
    <div className="border border-border p-3 rounded-lg"><div className="text-xs text-muted">Completed attestations</div><strong>{result.totals.completionEvidenceCount}</strong></div>
   </div>
   {result.materials.length===0?<p className="text-sm text-muted">No teacher-attested material evidence in this period.</p>:
    <div className="overflow-x-auto"><table className="min-w-full text-sm">
     <thead><tr className="text-left border-b border-border">
      <th className="p-2">Study / chapter</th><th className="p-2">Assigned learners</th>
      <th className="p-2">Taught learners</th><th className="p-2">Completed learners</th>
      <th className="p-2">Teaching events</th>
     </tr></thead>
     <tbody>{result.materials.map(row=><tr className="border-b border-border" key={row.resourceId}>
      <td className="p-2"><a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{row.label}</a></td>
      <td className="p-2">{row.assignmentStudentCount}</td>
      <td className="p-2">{row.taughtStudentCount}</td>
      <td className="p-2">{row.completedStudentCount}</td>
      <td className="p-2">{row.distinctTeachingEvents}</td>
     </tr>)}</tbody>
    </table></div>}
   {result.warnings.map((warning,i)=><p key={i} className="text-xs text-muted">{warning}</p>)}
  </div>}
 </section>;
}
