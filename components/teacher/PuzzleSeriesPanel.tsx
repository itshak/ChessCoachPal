"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useCallback,useEffect,useState} from "react";
import {useTranslations} from "next-intl";
const field="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground";
const button="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50";
type Series={nextName:string;nextSuffix:number;studies:Array<{id:string;name:string}>;
 localReceipts:Array<{request_id:string;name:string;state:string;study_id:string|null}>;note:string};
type Capacity={chapterCount:number;availableChapters:number;canPublish:boolean;maxChapters:number;note:string};
export function PuzzleSeriesPanel(){
 const t=useTranslations("puzzleSeries");
  const toUserError=useLocalizedApiError();
 const [series,setSeries]=useState<Series|null>(null);
 const [studyId,setStudyId]=useState("");
 const [capacity,setCapacity]=useState<Capacity|null>(null);
 const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  const res=await fetch("/api/lichess/puzzle-series",{cache:"no-store"});
  if(!res.ok)throw new Error((await res.json()).error??t("loadFailed"));
  setSeries(await res.json() as Series);
 },[t]);
 useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);
 async function inspect(){
  setBusy(true);setError("");
  try{
   const res=await fetch("/api/lichess/puzzle-series?studyId="+encodeURIComponent(studyId),{cache:"no-store"});
   const data=await res.json();
   if(!res.ok)throw new Error(toUserError(data, t("capacityFailed")));
   setCapacity(data as Capacity);
  }catch(e){setError(toUserError(e, t("capacityLookupFailed")));}
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
   if(!res.ok)throw new Error((toUserError(body, t("creationUncertain")))+
     t("reconcileRequest",{requestId}));
   setNotice(t("created",{name:body.name,id:body.studyId}));
   setApproved(false);await load();
  }catch(e){setError(toUserError(e, t("creationFailed")));}
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
   if(!res.ok)throw new Error(toUserError(body, t("stillAmbiguous")));
   setNotice(t("reconciled",{name:body.name,id:body.studyId}));
   await load();
  }catch(e){setError(toUserError(e, t("reconcileFailed")));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="text-lg font-semibold">{t("title")}</h2>
  <p className="text-sm text-muted">{t("description")}</p>
  <div className="flex gap-2 flex-wrap items-end">
   <label className="text-sm">{t("studyId")}
    <input className={field} value={studyId} maxLength={8}
      onChange={e=>{setStudyId(e.target.value);setCapacity(null);}} />
   </label>
   <button type="button" className={button} disabled={!/^[A-Za-z0-9]{8}$/.test(studyId)||busy}
    onClick={()=>void inspect()}>{t("checkCapacity")}</button>
  </div>
  {capacity&&<p className="text-sm">{capacity.chapterCount}/{capacity.maxChapters} {t("chapters")}.
    {capacity.canPublish?t("remaining",{count:capacity.availableChapters}):t("full")}
  </p>}
  <div className="border-t border-border pt-3 space-y-3">
   <p className="text-sm">{t("nextName")} <strong dir="auto">{series?.nextName??t("connect")}</strong></p>
   <label className="flex gap-2 items-start text-sm">
    <input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)} />
    {t("consent")}
   </label>
   <button type="button" className={button} disabled={!series||busy||!approved}
    onClick={()=>void create()}>{t("createPrivate",{name:series?.nextName??"Puzzles"})}</button>
   {series?.localReceipts.filter(x=>x.state==="attempted").map(x=>
    <div key={x.request_id} className="text-xs flex gap-2 items-center">
     <span>{t("unconfirmed",{name:x.name,id:x.request_id})}</span>
     <button type="button" disabled={busy} className={button}
      onClick={()=>void reconcile(x.request_id)}>{t("reconcileOnly")}</button>
    </div>)}
  </div>
  {error&&<p role="alert" className="text-error text-sm">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
 </section>;
}
