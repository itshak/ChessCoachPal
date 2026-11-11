"use client";
import {useCallback,useEffect,useState} from "react";

type Source={
 id:string;label:string;url:string;resource_type:string;
 mappedMaterial:{id:string;title:string;kind:string}|null;
 linkedAt:string|null;
};
type Material={id:string;title:string;kind:string;source_url:string|null};
const field="rounded-lg border border-border bg-background px-3 py-2 text-sm";
export function LegacyMaterialBridgePanel({studentId}:{studentId:string}){
 const [sources,setSources]=useState<Source[]>([]);
 const [materials,setMaterials]=useState<Material[]>([]);
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [filter,setFilter]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [total,setTotal]=useState(0);
 const [loaded,setLoaded]=useState(false);
 const load=useCallback(async()=>{
  const [oldList,newList]=await Promise.all([
    fetch("/api/coaching/materials/legacy-bridge?"+
      new URLSearchParams({studentId,limit:"100",offset:"0"}),{cache:"no-store"}),
    fetch("/api/training/materials?"+
      new URLSearchParams({query:filter.trim(),limit:"100",offset:"0"}),{cache:"no-store"}),
  ]);
  if(!oldList.ok||!newList.ok)throw new Error("Historical and typed learning sources unavailable");
  const a=await oldList.json();
  const b=await newList.json();
  setSources(a.entries??[]);setTotal(a.total??0);
  setMaterials(b.materials??[]);setLoaded(true);
 },[studentId,filter]);
 useEffect(()=>{let active=true;
   void load().catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load sources");});
   return()=>{active=false;};
 },[load]);
 async function change(source:Source,action:"link"|"unlink"){
   const materialId=action==="unlink"?source.mappedMaterial?.id:selected[source.id];
   if(!materialId){setError("Select a typed learning material first");return;}
   setBusy(source.id);setError("");setNotice("");
   try{
     const response=await fetch("/api/coaching/materials/legacy-bridge",{
       method:"POST",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({
         resourceId:source.id,materialId,action,confirmed:true,
         requestId:crypto.randomUUID(),
       }),
     });
     const result=await response.json();
     if(!response.ok)throw new Error(result.error||"Material mapping rejected");
     setNotice(action==="link"
       ?"Confirmed old learning source now points to the typed material. No teaching evidence changed."
       :"Material mapping removed. Historical teaching records remain intact.");
     await load();
   }catch(e){setError(e instanceof Error?e.message:"Material mapping unavailable");}
   finally{setBusy("");}
 }
 return <section className="space-y-3 rounded-xl border border-border p-4" aria-label="Legacy learning materials reconciliation">
   <div>
     <h2 className="text-lg font-semibold">Link previous learning resources</h2>
     <p className="text-sm text-muted">Review old study URLs and teaching resources against typed games, puzzles and study chapters. Nothing is mapped automatically, and prior lesson evidence is never erased.</p>
   </div>
   <label className="block text-sm">Search new typed materials by title
     <input className={field+" block w-full mt-1"} value={filter}
       onChange={e=>setFilter(e.target.value)} placeholder="Game, puzzle or study name"/>
   </label>
   {error&&<p role="alert" className="text-sm text-red-500">{error}</p>}
   {notice&&<p role="status" className="text-sm text-emerald-600">{notice}</p>}
   {loaded&&<p className="text-xs text-muted">Showing {sources.length} of {total} historical resources. Additional sources are available from MCP with pagination.</p>}
   {!sources.length&&loaded&&<p className="text-sm text-muted">No historical source links recorded for this student.</p>}
   <div className="space-y-3">{sources.map(source=><div className="rounded-lg bg-surface-dim/40 p-3 space-y-2" key={source.id}>
     <div className="text-sm font-semibold">{source.label}</div>
     <div className="text-xs text-muted break-all">{source.url}</div>
     {source.mappedMaterial?
       <div className="flex items-center justify-between gap-2 flex-wrap">
         <span className="text-sm">Mapped to {source.mappedMaterial.kind}: {source.mappedMaterial.title}</span>
         <button className={field} type="button" disabled={busy===source.id}
           onClick={()=>{void change(source,"unlink");}}>Unlink mapping</button>
       </div>:
       <div className="flex gap-2 items-center flex-wrap">
         <select className={field+" min-w-52 flex-1"} aria-label={"Typed material for "+source.label}
           value={selected[source.id]??""} onChange={e=>setSelected(p=>({...p,[source.id]:e.target.value}))}>
           <option value="">Choose matching material</option>
           {materials.filter(x=>source.resource_type!=="lichess_study"||
             x.kind==="study_chapter"||x.kind==="external_link").map(x=>
               <option key={x.id} value={x.id}>{x.kind}: {x.title}</option>)}
         </select>
         <button className={field} type="button" disabled={busy===source.id||!selected[source.id]}
           onClick={()=>{void change(source,"link");}}>Confirm link</button>
       </div>}
   </div>)}</div>
 </section>;
}
