"use client";

import {useState} from "react";
import {useTranslations} from "next-intl";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";

type Learner={id:string;name:string};
type Preview={
  membershipId:string;workplaceId:string;studentId:string;revision:number;
  startsOn:string|null;endOn:string;canEnd:boolean;
  activeGroups:number;futureSessions:number;activeSlots:number;
  creditPolicy:string;
};
type Reply<T>={ok?:boolean;data?:T;error?:{code:string;message?:string}};

async function action<T>(actionName:string,params:Record<string,unknown>):Promise<T>{
 const reply=await fetch("/api/agent/v1",{
  method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({action:actionName,...params}),cache:"no-store",
 });
 const body=await reply.json() as Reply<T>;
 if(!reply.ok||!body.ok||body.data===undefined){
   throw Object.assign(new Error(body.error?.message??body.error?.code??"Operation failed"),{
     code:body.error?.code??"DATABASE_ERROR",
   });
 }
 return body.data;
}

/** Explicit teacher approval is mandatory: preview alone never ends a learner
 * relationship. Finance remains on hold; no refund, transfer, invoice or
 * automatic archive can be inferred from this action.
 */
export function WorkplaceMembershipEndPanel({
 workplaceId,students,enrolledIds,onEnded,
}:{
 workplaceId:string;students:Learner[];enrolledIds:string[];
 onEnded:()=>Promise<unknown>;
}){
 const t=useTranslations("coaching");
 const toUserError=useLocalizedApiError();
 const [studentId,setStudentId]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const selected=students.filter(student=>enrolledIds.includes(student.id));
 const field="w-full rounded-lg border border-border bg-surface p-2 text-foreground";
 const button="rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50";
 const choose=(value:string)=>{setStudentId(value);setPreview(null);setReason("");setMessage("");setError("");};
 const load=async()=>{
  if(!workplaceId||!studentId)return;
  setBusy(true);setError("");setMessage("");setPreview(null);
  try{
   setPreview(await action<Preview>("workplaces.unenrollPreview",{workplaceId,studentId}));
  }catch(e){setError(toUserError(e,t("operationFailed")));}
  finally{setBusy(false);}
 };
 const commit=async()=>{
  if(!preview||!preview.canEnd||!studentId||reason.trim().length<8)return;
  setBusy(true);setError("");setMessage("");
  try{
   await action("workplaces.unenroll",{
    workplaceId,studentId,confirmed:true,
    expectedRevision:preview.revision,
    idempotencyKey:crypto.randomUUID(),reason:reason.trim(),
   });
   setPreview(null);setStudentId("");setReason("");
   await onEnded();
   setMessage(t("membershipEndSuccess"));
  }catch(e){setError(toUserError(e,t("operationFailed")));setPreview(null);}
  finally{setBusy(false);}
 };
 return <div className="space-y-3 border-t border-border pt-3">
  <h3 className="font-semibold">{t("membershipEndTitle")}</h3>
  <p className="text-sm text-muted">{t("membershipEndExplain")}</p>
  <label className="block text-sm">{t("membershipEndSelect")}
   <select aria-label={t("membershipEndSelect")} className={field}
    value={studentId} onChange={e=>choose(e.target.value)} disabled={busy}>
    <option value="">{t("chooseStudent")}</option>
    {selected.map(student=><option key={student.id} value={student.id}>{student.name}</option>)}
   </select>
  </label>
  <button type="button" className={button} disabled={!studentId||busy}
   onClick={load}>{t("membershipEndPreviewButton")}</button>
  {preview&&<>
   <p className="text-sm">{t("membershipEndBlockers",{
    groups:preview.activeGroups,sessions:preview.futureSessions,slots:preview.activeSlots,
   })}</p>
   <p className="text-sm">{t("membershipEndCreditHold")}</p>
   {preview.canEnd?<>
    <label className="block text-sm">{t("membershipEndReason")}
     <textarea className={field} value={reason} onChange={e=>setReason(e.target.value)}
      minLength={8} maxLength={1000} required rows={2}/>
    </label>
    <button type="button" className={button}
     disabled={busy||reason.trim().length<8} onClick={commit}>
      {t("membershipEndConfirmButton")}
    </button>
   </>:<p className="text-sm text-muted">{t("membershipEndResolveBlockers")}</p>}
  </>}
  {message&&<p className="text-sm text-foreground">{message}</p>}
  {error&&<p className="text-sm text-destructive">{error}</p>}
 </div>;
}
