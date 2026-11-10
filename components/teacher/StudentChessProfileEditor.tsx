"use client";
import {useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Provider="lichess"|"chesscom";
type Control="bullet"|"blitz"|"rapid"|"classical"|"daily"|"puzzle";
const controls:Control[]=["bullet","blitz","rapid","classical","daily","puzzle"];
type Ratings=Partial<Record<Provider,Partial<Record<Control,number|null>>>>;
type HistoryItem={
 id:string;field_name:string;previous_value:unknown;next_value:unknown;created_at:string;
};
type Props={
 studentId:string;initialAliases:string[];initialStrength:number|null;
 initialLichessUsername:string|null;initialChesscomUsername:string|null;
 initialLichessRating:number|null;initialChesscomRating:number|null;
 initialGoals:string;initialRatings:Ratings;
};
export function StudentChessProfileEditor(props:Props){
 const router=useRouter();
 const [aliases,setAliases]=useState(props.initialAliases.join(", "));
 const [strength,setStrength]=useState(props.initialStrength?.toString()??"");
 const [lichess,setLichess]=useState(props.initialLichessUsername??"");
 const [chesscom,setChesscom]=useState(props.initialChesscomUsername??"");
 const [lichessRating,setLichessRating]=useState(props.initialLichessRating?.toString()??"");
 const [chesscomRating,setChesscomRating]=useState(props.initialChesscomRating?.toString()??"");
 const [goals,setGoals]=useState(props.initialGoals);
 const [ratings,setRatings]=useState<Ratings>(props.initialRatings??{});
 const [history,setHistory]=useState<HistoryItem[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
 const rating=(value:string)=>value.trim()?Number(value):null;
 const loadHistory=useCallback(async()=>{
   const res=await fetch(`/api/students/${props.studentId}?chessHistory=true&limit=30`,{
     cache:"no-store",
   });
   if(res.ok){
     const data=await res.json();
     setHistory(data.entries??[]);
   }
 },[props.studentId]);
 useEffect(()=>{void loadHistory();},[loadHistory]);
 function updateRating(provider:Provider,control:Control,value:string){
   setRatings(before=>({...before,[provider]:{
     ...(before[provider]??{}),[control]:rating(value),
   }}));
 }
 async function save(e:React.FormEvent<HTMLFormElement>){
   e.preventDefault();setBusy(true);setError("");
   try{
     const res=await fetch(`/api/students/${props.studentId}`,{
       method:"PUT",headers:{"Content-Type":"application/json"},
       body:JSON.stringify({
         nameAliases:aliases.split(",").map(x=>x.trim()).filter(Boolean),
         strength:strength?Number(strength):null,
         lichessUsername:lichess.trim()||null,chesscomUsername:chesscom.trim()||null,
         lichessRating:rating(lichessRating),chesscomRating:rating(chesscomRating),
         chessGoals:goals,chessRatings:ratings,
       }),
     });
     if(!res.ok){
       const data=await res.json().catch(()=>null);
       setError(data?.error??"Unable to save chess profile");return;
     }
     await loadHistory();router.refresh();
   }catch{setError("Unable to save chess profile");}
   finally{setBusy(false);}
 }
 const show=(v:unknown)=>v==null?"—":typeof v==="string"?v:JSON.stringify(v);
 return <Card padding="sm" className="mb-6">
   <form onSubmit={save} className="space-y-3">
     <div>
       <h2 className="font-semibold">Chess profile</h2>
       <p className="text-xs text-muted">Ratings and goals are entered by the teacher, not verified against chess platforms. Edits are recorded in history.</p>
     </div>
     <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
       <label className="text-sm">Name aliases (comma-separated, Hebrew or English)
         <input className={field} value={aliases} onChange={e=>setAliases(e.target.value)}
           maxLength={2400} placeholder="Short name, English spelling"/>
       </label>
       <label className="text-sm">Teacher-assessed strength (1–10)
         <select className={field} value={strength} onChange={e=>setStrength(e.target.value)}>
           <option value="">Not assessed</option>
           {Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}
         </select>
       </label>
       <label className="text-sm">Lichess username
         <input className={field} value={lichess} onChange={e=>setLichess(e.target.value)} maxLength={30}/>
       </label>
       <label className="text-sm">Chess.com username
         <input className={field} value={chesscom} onChange={e=>setChesscom(e.target.value)} maxLength={30}/>
       </label>
       <label className="text-sm">Lichess rating (teacher-recorded, general)
         <input type="number" className={field} value={lichessRating}
           onChange={e=>setLichessRating(e.target.value)} min={100} max={4000}/>
       </label>
       <label className="text-sm">Chess.com rating (teacher-recorded, general)
         <input type="number" className={field} value={chesscomRating}
           onChange={e=>setChesscomRating(e.target.value)} min={100} max={4000}/>
       </label>
     </div>
     <label className="text-sm block">Teaching goals
       <textarea className={field} rows={3} maxLength={5000} value={goals}
         onChange={e=>setGoals(e.target.value)}
         placeholder="Goals, priorities and planned chess topics"/>
     </label>
     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
       {(["lichess","chesscom"] as const).map(provider=>
         <fieldset key={provider} className="border border-border rounded-lg p-3">
           <legend className="text-sm font-semibold">
             {provider==="lichess"?"Lichess":"Chess.com"} ratings by time control
           </legend>
           <div className="grid grid-cols-2 gap-2">
             {controls.map(control=>
               <label key={control} className="text-xs capitalize">{control}
                 <input type="number" min={100} max={4000} className={field}
                   aria-label={`${provider} ${control} rating`}
                   value={ratings[provider]?.[control]??""}
                   onChange={e=>updateRating(provider,control,e.target.value)}/>
               </label>)}
           </div>
         </fieldset>)}
     </div>
     {error&&<p role="alert" className="text-sm text-error">{error}</p>}
     <Button type="submit" disabled={busy}>{busy?"Saving…":"Save chess profile"}</Button>
   </form>
   <div className="mt-4 border-t border-border pt-3">
     <h3 className="text-sm font-semibold mb-2">Chess profile change history</h3>
     {history.length===0?<p className="text-xs text-muted">No rating, strength or goal changes recorded yet.</p>:
       <ol className="space-y-2 max-h-64 overflow-y-auto" aria-label="Chess profile change history">
         {history.map(item=><li key={item.id} className="text-xs text-muted">
           <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
           {" · "}<strong>{item.field_name.replaceAll("_"," ")}</strong>
           {": "}{show(item.previous_value)}{" → "}{show(item.next_value)}
         </li>)}
       </ol>}
   </div>
 </Card>;
}
