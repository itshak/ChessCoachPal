"use client";
import {useCallback,useEffect,useState} from "react";

type Provider="lichess"|"chesscom";
type Control="bullet"|"blitz"|"rapid"|"classical"|"daily"|"puzzle";
type Rating={
 id:string;provider:Provider;time_control:Control;rating:number;
 rating_deviation:number|null;provisional:boolean|null;games:number|null;
 source:"teacher_manual"|"provider_api";observed_at:string;fetched_at:string|null;
};
type ProviderRating={provider:Provider;timeControl:Control;rating:number|null;
 ratingDeviation:number|null;provisional:boolean|null;games:number|null;};
type Preview={studentId:string;provider:Provider;username:string;
 expectedDigest:string;ratings:ProviderRating[];readOnly:boolean;
 accountOwnershipVerified:boolean;teacherStrengthChanged:boolean;note:string};
const controls:Record<Provider,Control[]>={
 lichess:["bullet","blitz","rapid","classical","puzzle"],
 chesscom:["bullet","blitz","rapid","daily","puzzle"],
};
const field="w-full rounded-lg border border-border bg-background p-2 text-foreground text-sm";
const button="rounded-lg bg-primary px-3 py-2 text-white font-medium disabled:opacity-50";

export function StudentRatingHistoryPanel({studentId}:{studentId:string}){
 const [provider,setProvider]=useState<Provider>("lichess");
 const [control,setControl]=useState<Control>("rapid");
 const [manual,setManual]=useState("");
 const [history,setHistory]=useState<Rating[]>([]);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [externalApproved,setExternalApproved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [cursor,setCursor]=useState<string|null>(null);
 const load=useCallback(async()=>{
  const res=await fetch("/api/students/"+studentId+"/ratings?limit=100",{cache:"no-store"});
  if(!res.ok)throw new Error("Rating history cannot be loaded");
  const body=await res.json() as {snapshots:Rating[]};
  setHistory(body.snapshots);
 },[studentId]);
 useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
 async function manualRecord(){
  const value=Number(manual);
  if(!Number.isInteger(value)||value<100||value>4000){setError("Enter a rating from 100 to 4000");return;}
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch("/api/students/"+studentId+"/ratings",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"manual",provider,timeControl:control,rating:value,
     ratingDeviation:null,provisional:null,games:null,observedAt:new Date().toISOString(),
     requestId:crypto.randomUUID(),confirmed:true}),
   });
   if(!res.ok)throw new Error((await res.json()).error??"Manual rating failed");
   setManual("");setNotice("Teacher-entered rating saved to append-only history.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Rating save failed");}
  finally{setBusy(false);}
 }
 async function inspectProvider(){
  if(!externalApproved){setError("Approve public account lookup first");return;}
  setBusy(true);setError("");setNotice("");setPreview(null);
  try{
   const res=await fetch("/api/students/"+studentId+"/ratings",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"refreshPreview",provider,confirmedExternal:true}),
   });
   const data=await res.json();
   if(!res.ok)throw new Error(data.error??"Public provider lookup unavailable");
   setPreview(data as Preview);setCursor(null);
  }catch(e){setError(e instanceof Error?e.message:"Public lookup failed");}
  finally{setBusy(false);}
 }
 async function acceptProvider(){
  if(!preview||!externalApproved||preview.provider!==provider)return;
  setBusy(true);setError("");setNotice("");
  if(!cursor)setCursor(crypto.randomUUID());
  const requestId=cursor??crypto.randomUUID();
  if(!cursor)setCursor(requestId);
  try{
   const res=await fetch("/api/students/"+studentId+"/ratings",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"refreshCommit",provider:preview.provider,
     expectedDigest:preview.expectedDigest,requestId,confirmed:true,
     confirmedExternal:true}),
   });
   const body=await res.json();
   if(!res.ok)throw new Error(body.error??"Public rating import rejected");
   setPreview(null);setCursor(null);
   setNotice("Provider-sourced observations saved. Teacher-assessed strength was not changed.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Rating refresh failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="Chess rating observations" className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="font-semibold text-lg">Rating observations by source and time control</h2>
  <p className="text-sm text-muted">These snapshots are separate from teacher-assessed strength (1–10).
   A public username does not prove account ownership. Ratings across providers or time controls must not be averaged.</p>
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-sm">Platform
    <select className={field} value={provider} onChange={e=>{const p=e.target.value as Provider;
      setProvider(p);setControl("rapid");setPreview(null);setCursor(null);}}>
     <option value="lichess">Lichess</option><option value="chesscom">Chess.com</option>
    </select>
   </label>
   <label className="text-sm">Time control
    <select className={field} value={control} onChange={e=>setControl(e.target.value as Control)}>
     {controls[provider].map(x=><option key={x} value={x}>{x}</option>)}
    </select>
   </label>
   <label className="text-sm">Teacher-entered rating
    <input type="number" min={100} max={4000} className={field} value={manual}
      onChange={e=>setManual(e.target.value)} />
   </label>
  </div>
  <button type="button" className={button} onClick={()=>void manualRecord()} disabled={busy}>
   Record manual rating
  </button>
  <div className="border-t border-border pt-3 space-y-2">
   <label className="flex gap-2 items-start text-sm">
    <input type="checkbox" checked={externalApproved}
     onChange={e=>{setExternalApproved(e.target.checked);setPreview(null);setCursor(null);}} />
    I approve checking the saved public chess username with the selected provider. This can disclose the username externally.
   </label>
   <button type="button" className={button} disabled={!externalApproved||busy}
    onClick={()=>void inspectProvider()}>Preview public ratings (no save)</button>
  </div>
  {preview&&<div className="border border-border rounded-lg p-3 space-y-2 text-sm">
   <h3 className="font-semibold">Review {preview.username} — {preview.provider}</h3>
   <ul className="list-disc ps-5">
    {preview.ratings.map(x=><li key={x.timeControl}>
     {x.timeControl}: {x.rating??"unavailable"}{x.provisional===true?" (provisional)":""}
     {x.games!==null?" · "+x.games+" games":""}
    </li>)}
   </ul>
   <p>{preview.note}</p>
   <button type="button" className={button} disabled={busy||!externalApproved}
    onClick={()=>void acceptProvider()}>Confirm import of these provider observations</button>
  </div>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <div className="space-y-2">
   <h3 className="font-semibold text-sm">Recent immutable observations</h3>
   {history.length===0?<p className="text-sm text-muted">No rating snapshots yet.</p>:
    <div className="overflow-x-auto"><table className="w-full text-xs">
     <thead><tr className="text-start"><th>Recorded</th><th>Provider</th><th>Control</th><th>Rating</th><th>Source</th><th>Status</th></tr></thead>
     <tbody>{history.map(x=><tr key={x.id} className="border-t border-border">
      <td>{new Date(x.observed_at).toLocaleDateString()}</td><td>{x.provider}</td>
      <td>{x.time_control}</td><td>{x.rating}</td><td>{x.source}</td>
      <td>{x.provisional===true?"Provisional":x.provisional===false?"Established":"Unknown"}</td>
     </tr>)}</tbody>
    </table></div>}
  </div>
 </section>;
}
