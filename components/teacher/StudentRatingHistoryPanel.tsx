"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useCallback,useEffect,useState} from "react";
import {useLocale,useTranslations} from "next-intl";

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
const providerLabel:Record<Provider,string>={lichess:"Lichess",chesscom:"Chess.com"};
const sourceLabel:Record<Rating["source"],"providerApi"|"teacherManual">={
 provider_api:"providerApi",teacher_manual:"teacherManual",
};
const controls:Record<Provider,Control[]>={
 lichess:["bullet","blitz","rapid","classical","puzzle"],
 chesscom:["bullet","blitz","rapid","daily","puzzle"],
};
const field="w-full rounded-lg border border-border bg-background p-2 text-foreground text-sm";
const button="rounded-lg bg-primary px-3 py-2 text-white font-medium disabled:opacity-50";

export function StudentRatingHistoryPanel({studentId}:{studentId:string}){
 const t=useTranslations("ratingHistory"),locale=useLocale();
  const toUserError=useLocalizedApiError();
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
  if(!res.ok)throw new Error(t("loadError"));
  const body=await res.json() as {snapshots:Rating[]};
  setHistory(body.snapshots);
 },[studentId,t]);
 useEffect(()=>{void load().catch(e=>setError(String(e)));},[load]);
 async function manualRecord(){
  const value=Number(manual);
  if(!Number.isInteger(value)||value<100||value>4000){setError(t("rangeError"));return;}
  setBusy(true);setError("");setNotice("");
  try{
   const res=await fetch("/api/students/"+studentId+"/ratings",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"manual",provider,timeControl:control,rating:value,
     ratingDeviation:null,provisional:null,games:null,observedAt:new Date().toISOString(),
     requestId:crypto.randomUUID(),confirmed:true}),
   });
   if(!res.ok)throw new Error((await res.json()).error??t("manualError"));
   setManual("");setNotice(t("manualSaved"));
   await load();
  }catch(e){setError(toUserError(e, t("saveError")));}
  finally{setBusy(false);}
 }
 async function inspectProvider(){
  if(!externalApproved){setError(t("approveLookup"));return;}
  setBusy(true);setError("");setNotice("");setPreview(null);
  try{
   const res=await fetch("/api/students/"+studentId+"/ratings",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({action:"refreshPreview",provider,confirmedExternal:true}),
   });
   const data=await res.json();
   if(!res.ok)throw new Error(toUserError(data, t("lookupUnavailable")));
   setPreview(data as Preview);setCursor(null);
  }catch(e){setError(toUserError(e, t("lookupFailed")));}
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
   if(!res.ok)throw new Error(toUserError(body, t("importRejected")));
   setPreview(null);setCursor(null);
   setNotice(t("importSaved"));
   await load();
  }catch(e){setError(toUserError(e, t("importFailed")));}
  finally{setBusy(false);}
 }
 return <section aria-label={t("aria")} className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 className="font-semibold text-lg">{t("title")}</h2>
  <p className="text-sm text-muted">{t("intro")}</p>
  <div className="grid gap-3 sm:grid-cols-3">
   <label className="text-sm">{t("platform")}
    <select className={field} value={provider} onChange={e=>{const p=e.target.value as Provider;
      setProvider(p);setControl("rapid");setPreview(null);setCursor(null);}}>
     <option value="lichess">{providerLabel.lichess}</option><option value="chesscom">{providerLabel.chesscom}</option>
    </select>
   </label>
   <label className="text-sm">{t("timeControl")}
    <select className={field} value={control} onChange={e=>setControl(e.target.value as Control)}>
     {controls[provider].map(x=><option key={x} value={x}>{t(x)}</option>)}
    </select>
   </label>
   <label className="text-sm">{t("teacherRating")}
    <input type="number" min={100} max={4000} className={field} value={manual}
      onChange={e=>setManual(e.target.value)} />
   </label>
  </div>
  <button type="button" className={button} onClick={()=>void manualRecord()} disabled={busy}>
   {t("recordManual")}
  </button>
  <div className="border-t border-border pt-3 space-y-2">
   <label className="flex gap-2 items-start text-sm">
    <input type="checkbox" checked={externalApproved}
     onChange={e=>{setExternalApproved(e.target.checked);setPreview(null);setCursor(null);}} />
    {t("externalConsent")}
   </label>
   <button type="button" className={button} disabled={!externalApproved||busy}
    onClick={()=>void inspectProvider()}>{t("previewButton")}</button>
  </div>
  {preview&&<div className="border border-border rounded-lg p-3 space-y-2 text-sm">
   <h3 className="font-semibold" dir="auto">{t("review",{
     username:preview.username,provider:providerLabel[preview.provider]??t("unknown")
   })}</h3>
   <ul className="list-disc ps-5">
    {preview.ratings.map(x=><li key={x.timeControl}>
     {t(x.timeControl)}: {x.rating??t("unavailable")}{x.provisional===true?" "+t("provisionalSuffix"):""}
     {x.games!==null?" · "+t("games",{count:x.games}):""}
    </li>)}
   </ul>
   <p dir="auto">{preview.note}</p>
   <button type="button" className={button} disabled={busy||!externalApproved}
    onClick={()=>void acceptProvider()}>{t("importConfirm")}</button>
  </div>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <div className="space-y-2">
   <h3 className="font-semibold text-sm">{t("recent")}</h3>
   {history.length===0?<p className="text-sm text-muted">{t("noSnapshots")}</p>:
    <div className="overflow-x-auto"><table aria-label={t("recent")} className="w-full text-xs">
     <thead><tr className="text-start"><th scope="col">{t("recorded")}</th><th scope="col">{t("provider")}</th><th scope="col">{t("control")}</th><th scope="col">{t("rating")}</th><th scope="col">{t("source")}</th><th scope="col">{t("status")}</th></tr></thead>
     <tbody>{history.map(x=><tr key={x.id} className="border-t border-border">
      <td>{new Date(x.observed_at).toLocaleDateString(locale)}</td><td><bdi>{providerLabel[x.provider]??t("unknown")}</bdi></td>
      <td>{t(x.time_control)}</td><td>{x.rating}</td><td>{t(sourceLabel[x.source]??"unknown")}</td>
      <td>{x.provisional===true?t("provisional"):x.provisional===false?t("established"):t("unknown")}</td>
     </tr>)}</tbody>
    </table></div>}
  </div>
 </section>;
}
