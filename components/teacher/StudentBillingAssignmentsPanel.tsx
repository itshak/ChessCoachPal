"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";
import {Card} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

type Workplace={id:string;name:string};
type Payer={id:string;displayName:string;status:"active"|"archived"};
type Assignment={id:string;studentId:string;workplaceId:string;billingAccountId:string;
 effectiveFrom:string;effectiveTo:string|null;revision:number};
const field="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const firstDay=()=>new Date().toISOString().slice(0,10);
export function StudentBillingAssignmentsPanel({studentId,workplaces}:{studentId:string;workplaces:Workplace[]}){
 const t=useTranslations("payerAssignments");
 const [accounts,setAccounts]=useState<Payer[]>([]);
 const [assignments,setAssignments]=useState<Assignment[]>([]);
 const [workplaceId,setWorkplaceId]=useState(workplaces[0]?.id??"");
 const [accountId,setAccountId]=useState("");
 const [from,setFrom]=useState(firstDay());
 const [until,setUntil]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const endpoint=`/api/students/${studentId}/billing-assignments`;
 const load=useCallback(async()=>{
  const [a,b]=await Promise.all([fetch("/api/billing-accounts",{cache:"no-store"}),
    fetch(endpoint,{cache:"no-store"})]);
  if(!a.ok||!b.ok)throw new Error(t("loadFailed"));
  setAccounts(await a.json());
  const data=await b.json() as {assignments:Assignment[]};
  setAssignments(data.assignments);
 },[endpoint,t]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:t("loadFailed")));},[load]);
 async function act(url:string,method:"POST"|"PATCH",body:unknown){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
   if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error??t("saveFailed"));}
   await load();setNotice(t("saved"));
  }catch(e){setError(e instanceof Error?e.message:t("saveFailed"));}
  finally{setBusy(false);}
 }
 async function create(event:FormEvent){
  event.preventDefault();
  if(!window.confirm(t("confirmPayer")))return;
  await act(endpoint,"POST",{
   studentId,workplaceId,billingAccountId:accountId,
   effectiveFrom:from,effectiveTo:until||null,
   idempotencyKey:crypto.randomUUID(),confirmed:true,
  });
 }
 async function close(assignment:Assignment){
  const end=window.prompt(t("endPrompt"),firstDay());
  if(!end)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(end)){
   setError(t("invalidDate"));return;
  }
  if(!window.confirm(t("confirmEnd")))return;
  await act(`${endpoint}/${assignment.id}`,"PATCH",{
   studentId,assignmentId:assignment.id,expectedRevision:assignment.revision,
   effectiveTo:end,idempotencyKey:crypto.randomUUID(),confirmed:true,
  });
 }
 const name=(id:string)=>accounts.find(a=>a.id===id)?.displayName??t("unknownAccount");
 return <Card padding="sm" className="mb-6 space-y-3">
  <h2 className="font-semibold">{t("title")}</h2>
  <p className="text-xs text-muted">{t("disclaimer")}</p>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <ul className="space-y-2" aria-label={t("history")}>{assignments.map(a=><li key={a.id}
   className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
   <div><strong><bdi dir="auto">{name(a.billingAccountId)}</bdi></strong>
    {" · "}{workplaces.find(w=>w.id===a.workplaceId)?.name??t("otherWorkplace")}
    <p className="text-xs text-muted">{a.effectiveFrom} – {a.effectiveTo??t("ongoing")}</p></div>
   {!a.effectiveTo&&<Button size="sm" variant="secondary" disabled={busy}
    onClick={()=>void close(a)}>{t("close")}</Button>}
  </li>)}</ul>
  {!assignments.length&&<p className="text-sm text-muted">{t("noPayer")}</p>}
  <form onSubmit={create} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
   <label className="text-xs">{t("workplace")}
    <select data-testid="payer-workplace" className={field} required value={workplaceId}
     onChange={e=>setWorkplaceId(e.target.value)}>
     <option value="">{t("selectWorkplace")}</option>
     {workplaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
    </select>
   </label>
   <label className="text-xs">{t("billingAccount")}
    <select data-testid="payer-account" className={field} required value={accountId}
     onChange={e=>setAccountId(e.target.value)}>
     <option value="">{t("selectAccount")}</option>
     {accounts.filter(a=>a.status==="active").map(a=><option key={a.id} value={a.id}>{a.displayName}</option>)}
    </select>
   </label>
   <label className="text-xs">{t("from")}
    <input className={field} type="date" value={from} required onChange={e=>setFrom(e.target.value)}/>
   </label>
   <label className="text-xs">{t("until")}
    <input className={field} type="date" min={from} value={until} onChange={e=>setUntil(e.target.value)}/>
   </label>
   <div className="sm:col-span-2 lg:col-span-4"><Button type="submit" disabled={busy||!workplaceId||!accountId}>
    {busy?t("saving"):t("assign")}</Button></div>
  </form>
 </Card>;
}
