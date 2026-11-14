"use client";
import {useCallback,useEffect,useState} from "react";
const field="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground";
const button="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50";
type Series={nextName:string;nextSuffix:number;studies:Array<{id:string;name:string}>;
 localReceipts:Array<{request_id:string;name:string;state:string;study_id:string|null}>;note:string};
type Capacity={chapterCount:number;availableChapters:number;canPublish:boolean;maxChapters:number;note:string};
export function PuzzleSeriesPanel(){
 const [series,setSeries]=useState<Series|null>(null);
 const [studyId,setStudyId]=useState("");
 const [capacity,setCapacity]=useState<Capacity|null>(null);
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  const res=await fetch("/api/lichess/puzzle-series",{cache:"no-store"});
  if(!res.ok)throw new Error((await res.json()).error??"Cannot read Puzzles series");
  setSeries(await res.json() as Series);
 },[]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function inspect(){
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/lichess/puzzle-series?studyId="+encodeURIComponent(studyId),{cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"Cannot verify study capacity");
   setCapacity(data as Capacity);
  }catch(e){setError(e instanceof Error?e.message:"Capacity lookup failed");}
  finally{setBusy(false);}
 }
 async function create(){
  if(!series||!approved)return;
  setBusy(true);setError("");setNotice("");
  try{
   const requestId=crypto.randomUUID();
   const res=await fetch("/api/lichess/puzzle-series",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"create",expectedName:series.nextName,requestId,
     confirmed:true,confirmedExternal:true}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error((body.error??"Study creation uncertain")+
     " Request ID: "+requestId+". Reconcile this exact request; never create again automatically.");
   setNotice("Created private "+body.name+" with Lichess study ID "+body.studyId);
   setApproved(false);await load();
  }catch(e){setError(e instanceof Error?e.message:"Study creation failed");}
  finally{setBusy(false);}
 }
 async function reconcile(requestId:string){
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch("/api/lichess/puzzle-series",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"reconcile",requestId,confirmedExternal:true,confirmed:true}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Study creation still ambiguous");
   setNotice("Reconciled "+body.name+" to existing Lichess study "+body.studyId);
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Reconciliation failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="Lichess Puzzles series" className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="text-lg font-semibold">Private puzzle study capacity and rollover</h2>
  <p className="text-sm text-muted">The Lichess 64-chapter cap includes its starter chapter. A full study needs an explicitly approved new private Puzzles N study; never delete or silently move unrelated chapters. External study creation is limited by Lichess and a local 30/day budget.</p>
  <div className="flex gap-2 flex-wrap items-end">
   <label className="text-sm">Existing Lichess study ID
    <input className={field} value={studyId} maxLength={8}
      onChange={e=>{setStudyId(e.target.value);setCapacity(null);}} />
   </label>
   <button type="button" className={button} disabled={!/^[A-Za-z0-9]{8}$/.test(studyId)||busy}
    onClick={()=>void inspect()}>Check live chapter capacity</button>
  </div>
  {capacity&&<p className="text-sm">{capacity.chapterCount}/{capacity.maxChapters} chapters.
    {capacity.canPublish?" "+capacity.availableChapters+" remaining.":" Full: approve a new Puzzles study before publishing."}
  </p>}
  <div className="border-t border-border pt-3 space-y-3">
   <p className="text-sm">Next unclaimed series name: <strong>{series?.nextName??"Connect Lichess"}</strong></p>
   <label className="flex gap-2 items-start text-sm">
    <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
    Approve creating a new PRIVATE study in my connected Lichess account using study:write. This is an external write.
   </label>
   <button type="button" className={button} disabled={!series||busy||!approved}
    onClick={()=>void create()}>Create approved private {series?.nextName??"Puzzles"} study</button>
   {series?.localReceipts.filter(x=>x.state==="attempted").map(x=>
    <div key={x.request_id} className="text-xs flex gap-2 items-center">
     <span>Unconfirmed {x.name} ({x.request_id})</span>
     <button type="button" disabled={busy} className={button}
      onClick={()=>void reconcile(x.request_id)}>Reconcile without new creation</button>
    </div>)}
  </div>
  {error&&<p role="alert" className="text-error text-sm">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
