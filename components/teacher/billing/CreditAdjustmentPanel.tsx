"use client";

import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
import {useConfirm} from "@/components/ui/confirm-dialog";

type Kind="manual_grant"|"forfeiture"|"transfer"|"refund_entitlement"|"expiry_extension";
type Preview={
 packageId:string;studentId:string;workplaceId:string;
 purchasedCredits:number;redeemedCredits:number;adjustmentCredits:number;
 availableCredits:number;startsOn:string;expiresOn:string|null;
 invoiceId:string;invoiceStatus:string;invoiceAmountCents:number;
 receivedOnInvoiceCents:number;fullyFunded:boolean;
};
type Reply<T>={ok?:boolean;data?:T;error?:{code:string;message?:string}};
const field="w-full rounded-lg border border-border bg-background p-2 text-foreground";
const button="rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50";

async function operation<T>(action:string,payload:Record<string,unknown>):Promise<T>{
 const response=await fetch("/api/agent/v1",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action,...payload}),cache:"no-store",
 });
 const body=await response.json() as Reply<T>;
 if(!response.ok||!body.ok||body.data===undefined)
  throw Object.assign(
   new Error(body.error?.message??body.error?.code??"Operation failed"),
   {code:body.error?.code??"DATABASE_ERROR"},
  );
 return body.data;
}

export function CreditAdjustmentPanel({packageId}:{packageId:string}){
 const t=useTranslations("credits");
 const toError=useLocalizedApiError();
 const confirm=useConfirm();
 const router=useRouter();
 const [open,setOpen]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [kind,setKind]=useState<Kind>("manual_grant");
 const [credits,setCredits]=useState("1");
 const [reason,setReason]=useState("");
 const [destinationPackageId,setDestinationPackageId]=useState("");
 const [sourcePaymentId,setSourcePaymentId]=useState("");
 const [refundReversalId,setRefundReversalId]=useState("");
 const [newExpiresOn,setNewExpiresOn]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const retryRequestId=useRef<string|null>(null);
 const kindLabel=(value:Kind)=>{
  switch(value){
   case "manual_grant":return t("adjustment_manual_grant");
   case "forfeiture":return t("adjustment_forfeiture");
   case "transfer":return t("adjustment_transfer");
   case "refund_entitlement":return t("adjustment_refund_entitlement");
   case "expiry_extension":return t("adjustment_expiry_extension");
  }
 };
 const invalidate=()=>{setPreview(null);setError("");setNotice("");retryRequestId.current=null;};
 const review=async()=>{
  setBusy(true);setError("");setNotice("");setPreview(null);
  try{
   const next=await operation<Preview>("credits.adjustmentPreview",{packageId});
   setPreview(next);
  }catch(e){setError(toError(e,t("adjustmentFailed")));}
  finally{setBusy(false);}
 };
 const submit=async()=>{
  if(!preview||busy||reason.trim().length<8)return;
  const count=kind==="expiry_extension"?0:Number(credits);
  if(!Number.isInteger(count)||count<0||count>200)return;
  const yes=await confirm({
   title:t("adjustmentConfirmTitle"),
   message:t("adjustmentConfirmWarning",{credits:count,remaining:preview.availableCredits}),
   confirmLabel:t("adjustmentConfirmButton"),
  });
  if(!yes)return;
  setBusy(true);setError("");setNotice("");
  try{
   await operation("credits.adjustmentCommit",{
    packageId,kind,credits:count,expectedBalance:preview.availableCredits,
    ...(kind==="transfer"?{destinationPackageId}:{}),
    ...(kind==="expiry_extension"?{newExpiresOn}:{}),
    ...(kind==="refund_entitlement"?{sourcePaymentId,refundReversalId}:{}),
    requestId:retryRequestId.current??(retryRequestId.current=crypto.randomUUID()),
    reason:reason.trim(),confirmed:true,
   });
   setPreview(null);setOpen(false);setReason("");
   retryRequestId.current=null;
   setNotice(t("adjustmentSaved"));
   router.refresh();
  }catch(e){
   setError(toError(e,t("adjustmentFailed")));
   // Preserve the request ID after an ambiguous network failure so retry
   // cannot mint a second entitlement grant or refund event.
  }finally{setBusy(false);}
 };
 return <div className="mt-2 space-y-3 text-sm">
  <button type="button" className="text-primary hover:underline" onClick={()=>{
   setOpen(x=>!x);invalidate();
  }}>{open?t("adjustmentClose"):t("adjustmentOpen")}</button>
  {open&&<div className="rounded-lg border border-border p-3 space-y-3">
   <p className="text-xs text-muted">{t("adjustmentSeparateFinance")}</p>
   <label className="block">{t("adjustmentKind")}
    <select className={field} value={kind} disabled={busy}
     onChange={e=>{setKind(e.target.value as Kind);invalidate();}}>
     {(["manual_grant","forfeiture","transfer","refund_entitlement","expiry_extension"] as Kind[])
       .map(value=><option key={value} value={value}>{kindLabel(value)}</option>)}
    </select>
   </label>
   {kind!=="expiry_extension"&&<label className="block">{t("adjustmentCredits")}
    <input className={field} type="number" min={1} max={200} step={1}
     value={credits} disabled={busy} onChange={e=>{setCredits(e.target.value);invalidate();}}/>
   </label>}
   {kind==="transfer"&&<label className="block">{t("adjustmentDestination")}
    <input className={field} value={destinationPackageId} disabled={busy}
     onChange={e=>{setDestinationPackageId(e.target.value);invalidate();}}/>
   </label>}
   {kind==="expiry_extension"&&<label className="block">{t("adjustmentExpires")}
    <input className={field} type="date" value={newExpiresOn} disabled={busy}
     onChange={e=>{setNewExpiresOn(e.target.value);invalidate();}}/>
   </label>}
   {kind==="refund_entitlement"&&<>
    <label className="block">{t("adjustmentRefundPayment")}
     <input className={field} value={sourcePaymentId} disabled={busy}
      onChange={e=>{setSourcePaymentId(e.target.value);invalidate();}}/>
    </label>
    <label className="block">{t("adjustmentRefundReversal")}
     <input className={field} value={refundReversalId} disabled={busy}
      onChange={e=>{setRefundReversalId(e.target.value);invalidate();}}/>
    </label>
   </>}
   <label className="block">{t("adjustmentReason")}
    <textarea className={field} rows={2} minLength={8} maxLength={1000}
     value={reason} disabled={busy} onChange={e=>{setReason(e.target.value);invalidate();}}/>
   </label>
   <button type="button" className={button} onClick={review} disabled={busy}>
    {t("adjustmentPreviewButton")}
   </button>
   {preview&&<>
    <p>{t("adjustmentBalance",{remaining:preview.availableCredits,
     purchased:preview.purchasedCredits,redeemed:preview.redeemedCredits,
     adjusted:preview.adjustmentCredits})}</p>
    <p>{t("adjustmentFunding",{
     status:preview.invoiceStatus,paid:preview.receivedOnInvoiceCents,
     required:preview.invoiceAmountCents})}</p>
    {!preview.fullyFunded&&(kind==="transfer"||kind==="refund_entitlement")&&
     <p className="text-error">{t("adjustmentUnfunded")}</p>}
    <button type="button" className={button}
     disabled={busy||reason.trim().length<8||
      ((kind==="transfer"||kind==="refund_entitlement")&&!preview.fullyFunded)||
      (kind==="expiry_extension"&&!newExpiresOn)||
      (kind==="transfer"&&!destinationPackageId)||
      (kind==="refund_entitlement"&&(!sourcePaymentId||!refundReversalId))}
     onClick={submit}>{t("adjustmentConfirmButton")}</button>
   </>}
  </div>}
  {error&&<p className="text-error">{error}</p>}
  {notice&&<p className="text-foreground">{notice}</p>}
 </div>;
}
