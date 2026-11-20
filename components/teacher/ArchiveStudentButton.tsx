"use client";

import {useRef,useState} from "react";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {useToast} from "@/components/ui/toast";

type Preview={
 studentId:string;archived:boolean;expectedUpdatedAt:string;
 teacherLocalToday:string;canArchive:boolean;canReactivate:boolean;
 currentMemberships:Array<{workplaceId:string}>;
 futureMemberships:Array<{workplaceId:string}>;
 previousWorkplaceIds:string[];activeGroupMemberships:number;
 activeRecurringSlots:number;futureSessions:number;
 creditPackages:Array<{packageId:string;purchasedCredits:number;
  redeemedCredits:number;adjustmentCredits:number;expiresOn:string|null;
  invoiceStatus:string;recordedLegacyInvoicePaymentsCents:number}>;
 creditPolicy:string;
};
type Workplace={id:string;name:string};
type Reply<T>={ok?:boolean;data?:T;error?:{code?:string;message?:string}};
async function gateway<T>(action:string,args:Record<string,unknown>):Promise<T>{
 const response=await fetch("/api/agent/v1",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action,...args}),cache:"no-store",
 });
 const json=await response.json() as Reply<T>;
 if(!response.ok||!json.ok||json.data===undefined)
  throw new Error(json.error?.code??"DATABASE_ERROR");
 return json.data;
}

/** Archive is a transactional period closure, not a destructive student delete.
 * Reactivation requires explicit workplace selections and cannot infer
 * affiliations from past lessons or frozen attendance snapshots.
 */
export function ArchiveStudentButton({
 studentId,studentName,archived,
}:{studentId:string;studentName:string;archived:boolean}){
 const router=useRouter();
 const t=useTranslations("studentArchive");
 const {showToast}=useToast();
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [reason,setReason]=useState("");
 const requestId=useRef<string|null>(null);
 const start=async()=>{
  setBusy(true);setPreview(null);setSelected([]);setReason("");
  requestId.current=null;
  try{
   const next=await gateway<Preview>("students.lifecyclePreview",{studentId});
   if(!archived&&!next.canArchive){
    showToast(t("resolveBlockers",{blockers:
     t("lifecycleBlockers",{
      groups:next.activeGroupMemberships,
      sessions:next.futureSessions,
      slots:next.activeRecurringSlots,
     })}),"error");
    return;
   }
   if(archived){
    const data=await gateway<Workplace[]>("workplaces.list",{});
    setWorkplaces(data);
   }
   setPreview(next);
  }catch{showToast(t("previewFailed"),"error");}
  finally{setBusy(false);}
 };
 const commit=async()=>{
  if(!preview||reason.trim().length<8)return;
  if(!archived&&(!preview.canArchive||!window.confirm(t("archiveWarning"))))return;
  if(archived&&!window.confirm(t("reactivateWarning")))return;
  setBusy(true);
  try{
   const payload={
    studentId,mode:archived?"reactivate":"archive",
    expectedUpdatedAt:preview.expectedUpdatedAt,
    selectedWorkplaceIds:archived?selected:[],
    requestId:requestId.current??(requestId.current=crypto.randomUUID()),
    reason:reason.trim(),confirmed:true,
   };
   await gateway("students.lifecycleCommit",payload);
   setPreview(null);requestId.current=null;
   router.refresh();
  }catch{
   showToast(t("updateFailed"),"error");
   setPreview(null); // A new preview is required after an ambiguous conflict.
  }finally{setBusy(false);}
 };
 return <div className="space-y-3">
  <Button type="button" variant="secondary" size="sm" disabled={busy}
   onClick={preview?()=>{setPreview(null);requestId.current=null;}:start}
   title={archived?t("restoreTitle",{name:studentName}):t("archiveTitle",{name:studentName})}>
   {busy?"…":preview?t("cancelReview"):archived?t("restore"):t("archive")}
  </Button>
  {preview&&<div className="space-y-3 rounded-lg border border-border p-3 text-sm">
   <p className="font-semibold">{archived?t("reactivateReviewTitle"):t("archiveReviewTitle")}</p>
   <p>{t("lifecycleBlockers",{
    groups:preview.activeGroupMemberships,
    sessions:preview.futureSessions,slots:preview.activeRecurringSlots,
   })}</p>
   <p>{t("periodCounts",{
    current:preview.currentMemberships.length,
    future:preview.futureMemberships.length,
   })}</p>
   <p>{t("creditHoldPolicy")}</p>
   {preview.creditPackages.length>0&&
    <p>{t("creditPackageCount",{count:preview.creditPackages.length})}</p>}
   {archived&&<>
    <p>{t("reactivateWorkplaces")}</p>
    {preview.previousWorkplaceIds.length===0&&<p>{t("noPreviousWorkplaces")}</p>}
    {preview.previousWorkplaceIds.map(id=>{
     const title=workplaces.find(w=>w.id===id)?.name??id;
     return <label key={id} className="flex items-center gap-2">
      <input type="checkbox" checked={selected.includes(id)} disabled={busy}
       onChange={event=>setSelected(previous=>event.target.checked?
        [...previous,id]:previous.filter(value=>value!==id))}/>
      <span>{title}</span>
     </label>;
    })}
    <p className="text-muted">{t("reactivateNothingAutomatic")}</p>
   </>}
   <label className="block">{t("lifecycleReason")}
    <textarea className="mt-1 w-full rounded-lg border border-border bg-background p-2"
     rows={2} minLength={8} maxLength={1000} required
     value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/>
   </label>
   <Button type="button" variant="secondary" size="sm"
    disabled={busy||reason.trim().length<8} onClick={commit}>
    {archived?t("confirmReactivate"):t("confirmArchive")}
   </Button>
  </div>}
 </div>;
}
