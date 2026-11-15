"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";

type Scope="teacher"|"workplace"|"student";
type Purpose="lesson"|"puzzle";
type Workplace={id:string;name:string;timezone:string};
type Student={id:string;name:string};
type Existing={study_id:string;revision:number};
type Context={teacherId:string;workplaces:Workplace[]};
const field="w-full rounded-lg border border-border bg-surface p-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 text-white font-semibold disabled:opacity-50";

/**
 * Plain HTTPS /api and delegated MCP share the same owner-scoped SQL receipt.
 * No Lichess OAuth token, PGN contents, attendance or mastery is exposed.
 */
export function StudyPreferencesPanel(){
 const [context,setContext]=useState<Context|null>(null);
 const [students,setStudents]=useState<Student[]>([]);
 const [purpose,setPurpose]=useState<Purpose>("lesson");
 const [scope,setScope]=useState<Scope>("teacher");
 const [scopeId,setScopeId]=useState("");
 const [studyId,setStudyId]=useState("");
 const [revision,setRevision]=useState(0);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [effective,setEffective]=useState("");
 const requestRef=useRef<{signature:string;requestId:string}|null>(null);
 useEffect(()=>{
  let active=true;
  void Promise.all([
   fetch("/api/teacher/context",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("Teacher context unavailable"))),
   fetch("/api/students?limit=100&offset=0",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("Student list unavailable"))),
  ]).then(([ctx,roster]:[Context,{students:Student[];nextOffset:number|null}])=>{
    if(!active)return;
    setContext(ctx);setScopeId(ctx.teacherId);
    setStudents(roster.students??[]);
    if(roster.nextOffset!==null)setNotice("First 100 active learners are shown. Other learner IDs can be edited through MCP.");
   }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Could not load preferences");});
  return()=>{active=false;};
 },[]);
 const selectedId=scope==="teacher"?context?.teacherId??"":scopeId;
 useEffect(()=>{
  if(!selectedId)return;
  let active=true;
  setLoading(true);setError("");setEffective("");requestRef.current=null;
  const query=new URLSearchParams({action:"list",purpose,scope,
   scopeId:selectedId,limit:"1"});
  void fetch("/api/lichess/study-preferences?"+query,{cache:"no-store"})
   .then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error??"Preference lookup failed");return result;})
   .then((result:{preferences:Existing[]})=>{
    if(!active)return;
    const current=result.preferences[0];
    setStudyId(current?.study_id??"");setRevision(current?.revision??0);
   }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Preference unavailable");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[purpose,scope,selectedId]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!selectedId||busy)return;
  const payload={purpose,scope,scopeId:selectedId,studyId:studyId.trim()||null,
   expectedRevision:revision,confirmed:true};
  const signature=JSON.stringify(payload);
  if(requestRef.current?.signature!==signature)
    requestRef.current={signature,requestId:crypto.randomUUID()};
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/lichess/study-preferences",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"set",...payload,
     requestId:requestRef.current.requestId}),cache:"no-store",
   });
   const result=await response.json() as {error?:string;revision?:number;
    replayed?:boolean;studyId?:string|null};
   if(!response.ok)throw Error(result.error??"Preference update denied");
   setRevision(result.revision??0);setStudyId(result.studyId??"");
   requestRef.current=null;
   setEffective("");
   setNotice(result.studyId?
    "Verified Lichess preference saved; this does not mark a chapter taught.":
    "Preference cleared. Next-level fallback is used only after explicit review.");
  }catch(x){setError(x instanceof Error?x.message:"Preference write unavailable");}
  finally{setBusy(false);}
 }
 async function resolve(){
  setError("");setEffective("");
  try{
   const query=new URLSearchParams({action:"resolve",purpose,
    ...(scope==="workplace"?{workplaceId:selectedId}:{}),
    ...(scope==="student"?{studentId:selectedId}:{})});
   const response=await fetch("/api/lichess/study-preferences?"+query,{cache:"no-store"});
   const data=await response.json() as {error?:string;studyId?:string|null;
    selectedScope?:string|null;needsSync?:boolean};
   if(!response.ok)throw Error(data.error??"Resolution unavailable");
   setEffective(data.studyId?
    data.studyId+" ("+(data.selectedScope??"")+")"+
    (data.needsSync?" — provider metadata needs refreshing before use":" — indexed source available"):
    "No study preference saved for this context.");
  }catch(e){setError(e instanceof Error?e.message:"Resolution failed");}
 }
 return <section aria-label="Lichess study preferences" className="space-y-3 rounded-xl border border-border bg-surface p-5">
  <h2 className="font-semibold text-lg">Default Lichess studies</h2>
  <p className="text-sm text-muted-foreground">Use one verified study ID for lesson or puzzle planning. Student choice overrides workplace, which overrides teacher. A default is not proof of teaching, account ownership or mastery.</p>
  <form onSubmit={e=>void submit(e)} className="grid gap-3 md:grid-cols-2">
   <label className="text-sm">Purpose
    <select className={field} value={purpose} onChange={e=>setPurpose(e.target.value as Purpose)}>
     <option value="lesson">Lesson study</option><option value="puzzle">Puzzle study</option>
    </select>
   </label>
   <label className="text-sm">Override scope
    <select className={field} value={scope} onChange={e=>{const val=e.target.value as Scope;
     setScope(val);setScopeId(val==="teacher"?context?.teacherId??"":"");}}>
     <option value="teacher">Teacher default</option><option value="workplace">Workplace default</option>
     <option value="student">Student override</option>
    </select>
   </label>
   {scope==="workplace"&&<label className="text-sm">Workplace
    <select className={field} required value={scopeId} onChange={e=>setScopeId(e.target.value)}>
     <option value="">Select workplace</option>
     {(context?.workplaces??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>}
   {scope==="student"&&<label className="text-sm">Student
    <select className={field} required value={scopeId} onChange={e=>setScopeId(e.target.value)}>
     <option value="">Select learner</option>
     {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
   </label>}
   <label className="text-sm">Verified eight-character Lichess study ID (blank to clear)
    <input className={field} value={studyId} maxLength={8} pattern="[A-Za-z0-9]{8}"
     placeholder="e.g. StUd1234"
     onChange={e=>{setStudyId(e.target.value);requestRef.current=null;}} />
   </label>
   <div className="flex items-end flex-wrap gap-2">
    <button className={button} disabled={busy||loading||!selectedId} type="submit">
     {studyId.trim()?"Save verified preference":"Clear this override"}
    </button>
    <button className={button} type="button" disabled={busy||!selectedId}
     onClick={()=>void resolve()}>Show effective study</button>
   </div>
  </form>
  <p className="text-xs text-muted-foreground">Revision {revision}. Saving requires exact owner/revision and an indexed Lichess study synced with study:read within 24 hours. Setting or clearing a preference performs no external Lichess write.</p>
  {loading&&<p role="status">Loading saved preference…</p>}
  {effective&&<p role="status">{effective}</p>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" className="text-red-500">{error}</p>}
 </section>;
}
