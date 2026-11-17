"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useCallback,useEffect,useState} from "react";
import {useLocale,useTranslations} from "next-intl";

type Goal={
 id:string;title:string;
 status:"planned"|"in_progress"|"achieved"|"abandoned";
 targetDate:string|null;coachEvidence:string|null;
};
type Plan={
 id:string;student_id:string;title:string;summary:string;
 status:"draft"|"active"|"paused"|"completed"|"archived";
 goals:Goal[];revision:number;updated_at:string;
};
const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const btn="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50";
export function StudentTrainingPlansPanel({studentId}:{studentId:string}){
 const t=useTranslations("trainingPlans"),locale=useLocale();
  const toUserError=useLocalizedApiError();
 const planStatus=(v:Plan["status"])=>t(v);
 const goalStatus=(v:Goal["status"])=>t(v==="in_progress"?"inProgress":v);
 const [plans,setPlans]=useState<Plan[]>([]);
 const [editing,setEditing]=useState<Plan|null>(null);
 const [title,setTitle]=useState("");
 const [summary,setSummary]=useState("");
 const [status,setStatus]=useState<Plan["status"]>("draft");
 const [goals,setGoals]=useState<Goal[]>([]);
 const [newGoal,setNewGoal]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [includeArchived,setIncludeArchived]=useState(false);
 const [revisions,setRevisions]=useState<Array<{revision:number;changed_at:string}>|null>(null);
 const load=useCallback(async()=>{
   const response=await fetch("/api/training/plans?"+
     new URLSearchParams({studentId,includeArchived:String(includeArchived),limit:"50"}),{cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw new Error(toUserError(data, t("loadError")));
   setPlans(data.plans??[]);
 },[studentId,includeArchived,t,toUserError]);
 useEffect(()=>{let live=true;void load().catch(e=>{if(live)setError(toUserError(e, t("unavailable")));});
   return()=>{live=false;};
 },[load,t,toUserError]);
 function select(plan:Plan|null){
   setEditing(plan);setTitle(plan?.title??"");setSummary(plan?.summary??"");
   setStatus(plan?.status??"draft");setGoals(plan?plan.goals.map(g=>({...g})):[]);
   setError("");setNotice("");setRevisions(null);
 }
 function addGoal(){
   if(!newGoal.trim()||goals.length>=20)return;
   setGoals(p=>[...p,{id:crypto.randomUUID(),title:newGoal.trim(),
     status:"planned",targetDate:null,coachEvidence:null}]);
   setNewGoal("");
 }
 async function save(){
   if(!title.trim())return;
   setBusy(true);setError("");setNotice("");
   try{
     const payload={
       ...(editing?{planId:editing.id,expectedRevision:editing.revision}:{}),
       studentId,title:title.trim(),summary,status,goals,
       requestId:crypto.randomUUID(),confirmed:true,
     };
     const response=await fetch("/api/training/plans",{
       method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),
     });
     const data=await response.json();
     if(!response.ok)throw new Error(toUserError(data, t("saveError")));
     const message=editing?t("corrected"):t("created");
     select(null);setNotice(message);await load();
   }catch(e){setError(toUserError(e, t("saveFailed")));}
   finally{setBusy(false);}
 }
 async function readAudit(plan:Plan){
   setBusy(true);setError("");
   try{
     const response=await fetch("/api/training/plans?"+
       new URLSearchParams({planId:plan.id}),{cache:"no-store"});
     const data=await response.json();
     if(!response.ok)throw new Error(toUserError(data, t("auditUnavailable")));
     setEditing(plan);setTitle(plan.title);setSummary(plan.summary);
     setStatus(plan.status);setGoals(plan.goals.map(g=>({...g})));
     setRevisions(data.revisions);
   }catch(e){setError(toUserError(e, t("auditUnavailable")));}
   finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-border p-4 space-y-4"
   aria-label={t("aria")}>
   <div className="flex items-start justify-between gap-3 flex-wrap">
     <div>
       <h2 className="text-lg font-semibold">{t("title")}</h2>
       <p className="text-sm text-muted">{t("intro")}</p>
     </div>
     <button className={btn} type="button" onClick={()=>select(null)}>{t("newPlan")}</button>
   </div>
   {error&&<p className="text-sm text-red-500" role="alert">{error}</p>}
   {notice&&<p className="text-sm text-emerald-600" role="status">{notice}</p>}
   <label className="flex items-center gap-2 text-sm">
     <input type="checkbox" checked={includeArchived} onChange={e=>setIncludeArchived(e.target.checked)}/>
     {t("includeArchived")}
   </label>
   {plans.length===0?<p className="text-sm text-muted">{t("none")}</p>:
   <ul className="space-y-2">{plans.map(plan=><li key={plan.id}
     className="flex flex-wrap justify-between gap-3 rounded-lg border border-border p-3">
     <div>
       <p className="font-semibold" dir="auto">{plan.title}</p>
       <p className="text-xs text-muted">{planStatus(plan.status)} ·
       {t("goalCount",{count:plan.goals.length})} · {t("revision",{number:plan.revision})}</p>
       <p className="text-xs text-muted" dir="auto">{plan.summary}</p>
     </div>
     <button type="button" className={btn} disabled={busy}
       onClick={()=>{void readAudit(plan);}}>{t("editInspect")}</button>
   </li>)}</ul>}
   <div className="space-y-3 rounded-lg bg-surface p-3">
     <h3 className="font-semibold">{editing?t("correctPlan"):t("draftPlan")}</h3>
     <label className="block text-sm">{t("planTitle")}
       <input className={field+" mt-1"} maxLength={160} value={title}
         onChange={e=>setTitle(e.target.value)} placeholder={t("titleExample")}/>
     </label>
     <label className="block text-sm">{t("coachNotes")}
       <textarea className={field+" mt-1"} rows={2} maxLength={2500}
         value={summary} onChange={e=>setSummary(e.target.value)} />
     </label>
     <label className="block text-sm">{t("planStatus")}
       <select className={field+" mt-1"} value={status}
         onChange={e=>setStatus(e.target.value as Plan["status"])}>
         {(["draft","active","paused","completed","archived"] as const).map(x=>
           <option key={x} value={x}>{planStatus(x)}</option>)}
       </select>
     </label>
     <div className="space-y-3">
       <p className="text-sm font-semibold">{t("goals")}</p>
       {goals.map((g,i)=><div key={g.id} className="rounded-md border border-border p-3 space-y-2">
         <label className="text-sm">{t("goal")}
           <input className={field+" mt-1"} maxLength={160} value={g.title}
             onChange={e=>setGoals(prev=>prev.map((v,j)=>j===i?{...v,title:e.target.value}:v))}/>
         </label>
         <label className="text-sm">{t("status")}
           <select className={field+" mt-1"} value={g.status}
             onChange={e=>setGoals(prev=>prev.map((v,j)=>j===i?
               {...v,status:e.target.value as Goal["status"]}:v))}>
             {(["planned","in_progress","achieved","abandoned"] as const).map(x=>
               <option key={x} value={x}>{goalStatus(x)}</option>)}
           </select>
         </label>
         <label className="text-sm">{t("targetDate")}
           <input type="date" className={field+" mt-1"} value={g.targetDate??""}
             onChange={e=>setGoals(prev=>prev.map((v,j)=>j===i?
               {...v,targetDate:e.target.value||null}:v))}/>
         </label>
         <label className="text-sm">{t("coachEvidence")} {g.status==="achieved"?t("required"):""}
           <textarea className={field+" mt-1"} rows={2} maxLength={1500}
             value={g.coachEvidence??""} onChange={e=>setGoals(prev=>prev.map((v,j)=>j===i?
               {...v,coachEvidence:e.target.value||null}:v))}/>
         </label>
         <button className={btn} type="button"
           onClick={()=>setGoals(prev=>prev.filter((_,j)=>j!==i))}>{t("removeGoal")}</button>
       </div>)}
       <div className="flex gap-2 flex-wrap">
         <input className={field+" flex-1"} maxLength={160} value={newGoal}
           onChange={e=>setNewGoal(e.target.value)} placeholder={t("newGoal")}/>
         <button className={btn} disabled={!newGoal.trim()||goals.length>=20}
           type="button" onClick={addGoal}>{t("addGoal")}</button>
       </div>
     </div>
     {revisions&&<div>
       <h4 className="text-sm font-semibold">{t("history")}</h4>
       <ul className="text-xs text-muted">{revisions.map(r=><li key={r.revision}>
         {t("savedRevision",{number:r.revision})} · {new Date(r.changed_at).toLocaleString(locale)}
       </li>)}</ul>
     </div>}
     <div className="flex gap-3">
       <button className={btn} type="button" disabled={busy||!title.trim()}
         onClick={()=>{void save();}}>{busy?t("saving"):editing?t("saveCorrection"):t("savePlan")}</button>
       {editing&&<button className={btn} type="button" onClick={()=>select(null)}>{t("cancelEditing")}</button>}
     </div>
   </div>
 </section>;
}
