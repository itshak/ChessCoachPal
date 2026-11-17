"use client";

import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

import {useCallback,useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {useTranslations} from "next-intl";
import {useConfirm} from "@/components/ui/confirm-dialog";

type TotpFactor={id:string;status:string;friendly_name?:string|null;
 factor_type?:string};
type Enrollment={id:string;qr:string;secret:string};

export function AccountMfaSettings(){
 const t=useTranslations("mfa");
  const toUserError=useLocalizedApiError();
 const confirm=useConfirm();
 const [verified,setVerified]=useState<TotpFactor[]>([]);
 const [unverified,setUnverified]=useState<TotpFactor[]>([]);
 const [enrollment,setEnrollment]=useState<Enrollment|null>(null);
 const [code,setCode]=useState("");
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 // Stable browser auth client prevents repeatedly enrolling/listing factors
 // on every React rerender of the security settings panel.
 const client=useMemo(()=>createClient(),[]);

 const refresh=useCallback(async()=>{
  const {data,error}=await client.auth.mfa.listFactors();
  if(error)throw error;
  const factors=(data.all??[]) as TotpFactor[];
  setVerified(factors.filter(f=>f.factor_type==="totp"&&f.status==="verified"));
  setUnverified(factors.filter(f=>f.factor_type==="totp"&&f.status!=="verified"));
  setReady(true);
 },[client]);
 useEffect(()=>{void refresh().catch(e=>{
  setError(toUserError(e, t("statusUnavailable")));
  setReady(true);
 });},[refresh,t,toUserError]);

 async function enable(){
  setBusy(true);setError("");setNotice("");
  try{
   // Abandoned setup cannot be completed without the original QR secret:
   // remove only unverified factors before enrolling a fresh one.
   for(const pending of unverified){
    const {error}=await client.auth.mfa.unenroll({factorId:pending.id});
    if(error)throw error;
   }
   const {data,error}=await client.auth.mfa.enroll({
    factorType:"totp",friendlyName:"ChessCoachPal authenticator",
   });
   if(error)throw error;
   if(!data.totp?.qr_code||!data.totp.secret)
    throw new Error(t("setupIncomplete"));
   setEnrollment({id:data.id,qr:data.totp.qr_code,secret:data.totp.secret});
   setCode("");
  }catch(e){setError(toUserError(e, t("setupError")));}
  finally{setBusy(false);}
 }
 async function verify(){
  if(!enrollment||!/^[0-9]{6}$/.test(code))return;
  setBusy(true);setError("");setNotice("");
  try{
   const {data:challenge,error:challengeError}=await client.auth.mfa.challenge({
    factorId:enrollment.id,
   });
   if(challengeError)throw challengeError;
   const {error:verifyError}=await client.auth.mfa.verify({
    factorId:enrollment.id,challengeId:challenge.id,code,
   });
   if(verifyError)throw verifyError;
   setEnrollment(null);setCode("");
   await refresh();
   setNotice(t("success"));
  }catch(e){setError(toUserError(e, t("invalidCode")));}
  finally{setBusy(false);}
 }
 async function cancel(){
  if(!enrollment)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error}=await client.auth.mfa.unenroll({factorId:enrollment.id});
   if(error)throw error;
   setEnrollment(null);setCode("");await refresh();
  }catch(e){setError(toUserError(e, t("cancelError")));}
  finally{setBusy(false);}
 }
 async function disable(factorId:string){
  if(!/^[0-9]{6}$/.test(code)){
   setError(t("removeCodeRequired"));
   return;
  }
  const approved=await confirm({
   title:t("removeTitle"),
   message:t("removeWarning"),
   confirmLabel:t("removeConfirm"),variant:"danger",
  });
  if(!approved)return;
  setBusy(true);setError("");setNotice("");
  try{
   const {error:challengeError}=await client.auth.mfa.challengeAndVerify({factorId,code});
   if(challengeError)throw challengeError;
   const {error:removeError}=await client.auth.mfa.unenroll({factorId});
   if(removeError)throw removeError;
   setCode("");await refresh();
   setNotice(t("removed"));
  }catch(e){setError(toUserError(e, t("removeError")));}
  finally{setBusy(false);}
 }
 return <section id="security" aria-label={t("title")}
  className="space-y-4 rounded-xl border border-border bg-surface p-5">
  <h2 className="text-lg font-semibold">{t("title")}</h2>
  <p className="text-sm text-muted">
   {t("description")}
  </p>
  {!ready&&<p role="status" className="text-sm">{t("checking")}</p>}
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm text-success">{notice}</p>}
  {ready&&!enrollment&&<div className="space-y-3">
   {verified.length===0?<div className="space-y-2">
    <p className="text-sm">{t("notEnabled")}</p>
    <button type="button" onClick={()=>void enable()} disabled={busy}
     className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
     {t("enable")}
    </button>
   </div>:<>
    <p className="text-sm">{t("enabled",{count:verified.length})}</p>
    <p className="text-xs text-muted">
     {t("removeGuidance")}
    </p>
    <label className="block text-sm">{t("removalCode")}
     <input type="text" inputMode="numeric" autoComplete="one-time-code"
      pattern="[0-9]{6}" maxLength={6} value={code}
      onChange={e=>setCode(e.target.value.replace(/\D/g,""))}
      placeholder="000000"
      className="mt-1 w-full max-w-44 rounded-md border border-border bg-background px-3 py-2"/>
    </label>
    {verified.map(factor=><button type="button" key={factor.id}
     disabled={busy} onClick={()=>void disable(factor.id)}
     className="me-2 rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50">
     {t("removeFactor",{name:factor.friendly_name||t("authenticator")})}
    </button>)}
    <button type="button" onClick={()=>void enable()} disabled={busy}
     className="rounded-md border border-primary px-4 py-2 text-sm text-primary disabled:opacity-50">
     {t("addBackup")}
    </button>
   </>}
  </div>}
  {enrollment&&<div className="space-y-3">
   <p className="text-sm font-semibold">{t("scan")}</p>
   {/* Supabase returns the QR as SVG. Its secret is confined to browser memory. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qr)}`}
    width={196} height={196} alt={t("qrAlt")}
    className="rounded-md bg-white p-2"/>
   <p className="text-xs text-muted">{t("scanFails")}</p>
   <code aria-label={t("setupSecret")}
    className="block break-all rounded-md border border-border p-3 text-sm">{enrollment.secret}</code>
   <label className="block text-sm">{t("sixDigit")}
    <input type="text" inputMode="numeric" autoComplete="one-time-code"
     pattern="[0-9]{6}" maxLength={6} value={code}
     onChange={e=>setCode(e.target.value.replace(/\D/g,""))}
     placeholder="000000"
     className="mt-1 w-full max-w-44 rounded-md border border-border bg-background px-3 py-2"/>
   </label>
   <div className="flex gap-2">
    <button type="button" onClick={()=>void verify()}
     disabled={busy||code.length!==6}
     className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
     {t("verify")}
    </button>
    <button type="button" onClick={()=>void cancel()} disabled={busy}
     className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
     {t("cancel")}
    </button>
   </div>
  </div>}
 </section>;
}
