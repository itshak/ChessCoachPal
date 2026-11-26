"use client";

import {notifyOnlineRatingContextChanged} from "@/lib/online-rating-context";
import {useEffect,useState} from "react";
import {useTranslations} from "next-intl";

type Provider="lichess"|"chesscom";
type Permission={
 studentId:string;provider:Provider;username:string|null;studentEpoch:string;
 expectedRevision:number;enabled:boolean;canChange:boolean;
};
type Review={permission:Permission;requestId:string};

function ProviderPermission({studentId,provider}:{studentId:string;provider:Provider}){
 const t=useTranslations("automaticRatings");
 const [state,setState]=useState<Permission|null>(null);
 const [review,setReview]=useState<Review|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState<"loadError"|"saveError"|"changed"|null>(null);
 const [saved,setSaved]=useState(false);
 const [version,setVersion]=useState(0);
 const path="/api/students/"+encodeURIComponent(studentId)+"/ratings/consent";
 const providerName=provider==="lichess"?"Lichess":"Chess.com";
 useEffect(()=>{
  const abort=new AbortController();
  fetch(path+"?provider="+provider,{cache:"no-store",signal:abort.signal})
   .then(async(response)=>{
    if(!response.ok)throw new Error("read failed");
    const next=await response.json() as Permission;
    if(next.studentId!==studentId||next.provider!==provider)throw new Error("read mismatch");
    if(!abort.signal.aborted)setState(next);
   }).catch(()=>{if(!abort.signal.aborted)setError("loadError");})
   .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[path,provider,studentId,version]);

 function refresh(){
  setLoading(true);setReview(null);setVersion(v=>v+1);
 }
 async function confirm(){
  if(!review||!review.permission.username||saving)return;
  const current=review.permission;
  setSaving(true);setError(null);setSaved(false);
  try{
   const response=await fetch(path,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     studentId,provider,username:current.username,studentEpoch:current.studentEpoch,
     expectedRevision:current.expectedRevision,enable:!current.enabled,requestId:review.requestId,confirmed:true,
    }),
   });
   if(response.status===409){
    const reason=await response.json().catch(()=>null);
    if(reason?.code==="RATING_CONSENT_STALE"||reason?.code==="IDEMPOTENCY_CONFLICT"){
     setError("changed");refresh();return;
    }
   }
   if(!response.ok)throw new Error("save failed");
   setSaved(true);refresh();
   notifyOnlineRatingContextChanged(studentId);
  }catch{
   // An ambiguous transport failure can retry the identical reviewed request.
   setError("saveError");
  }finally{setSaving(false);}
 }
 return <section className="rounded-lg border border-border p-3 space-y-2" aria-label={providerName}>
  <h3 className="font-medium">{providerName}</h3>
  <p className="text-sm" role="status">
   {loading?t("loading"):state?t(state.enabled?"enabled":"disabled"):null}
  </p>
  {state?.username&&<p className="text-sm">{t("account")}: <bdi>{state.username}</bdi></p>}
  {!loading&&state&&!state.canChange&&<p className="text-sm">{t("unavailable")}</p>}
  {error&&<p className="text-sm text-danger" role="alert">{t(error)}</p>}
  {saved&&!error&&<p className="text-sm" role="status">{t("saved")}</p>}
  <div className="flex gap-2 flex-wrap">
   {!review&&state?.canChange&&<button type="button" className="rounded border border-border px-3 py-2 text-sm"
    disabled={loading||saving} onClick={()=>{setSaved(false);setError(null);setReview({permission:state,requestId:crypto.randomUUID()});}}>
    {t(state.enabled?"reviewDisable":"reviewEnable")}
   </button>}
   {!review&&<button type="button" className="rounded border border-border px-3 py-2 text-sm"
    disabled={loading||saving} onClick={()=>{setError(null);setSaved(false);refresh();}}>
    {t("refresh")}
   </button>}
  </div>
  {review&&<fieldset className="rounded border border-border p-2 space-y-2">
   <legend className="text-sm font-medium">{t("confirmTitle")}</legend>
   <p className="text-sm">{t(review.permission.enabled?"confirmDisable":"confirmEnable",{
    provider:providerName,username:review.permission.username??"",
   })}</p>
   <div className="flex gap-2 flex-wrap">
    <button type="button" disabled={saving} onClick={()=>void confirm()}
      className="rounded bg-primary text-white px-3 py-2 text-sm disabled:opacity-50">
      {t(review.permission.enabled?"disable":"enable")}
    </button>
    <button type="button" disabled={saving} onClick={()=>{setReview(null);setError(null);}}
      className="rounded border border-border px-3 py-2 text-sm">
      {t("cancel")}
    </button>
   </div>
  </fieldset>}
 </section>;
}

export function StudentAutomaticRatingsPanel({studentId}:{studentId:string}){
 const t=useTranslations("automaticRatings");
 return <section id="automatic-ratings" aria-labelledby="automatic-ratings-title"
   className="rounded-xl border border-border bg-surface p-4 space-y-3">
  <h2 id="automatic-ratings-title" className="font-semibold text-lg">{t("title")}</h2>
  <p className="text-sm text-muted">{t("intro")}</p>
  <div className="grid gap-3 sm:grid-cols-2">
   <ProviderPermission key={studentId+":lichess"} studentId={studentId} provider="lichess" />
   <ProviderPermission key={studentId+":chesscom"} studentId={studentId} provider="chesscom" />
  </div>
 </section>;
}
