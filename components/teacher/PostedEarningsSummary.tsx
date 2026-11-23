"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import type {FinanceEarningSummary} from "@/lib/server/finance-earning-summary";

type Workplace={id:string;name:string};
type Account={id:string;displayName:string;status:string};
const field="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const initial={workplaceId:"",from:"",to:"",currency:"",billingAccountId:""};
async function read<T>(url:string,init?:RequestInit):Promise<T>{
 const result=await fetch(url,{cache:"no-store",...init});
 if(!result.ok)throw new Error("EARNINGS_SUMMARY_UNAVAILABLE");
 return result.json();
}
function currencyAmount(cents:number,currency:string,locale:string){
 const amount=BigInt(cents),centsPerUnit=BigInt(100);
 const digits=new Intl.NumberFormat(locale,{minimumIntegerDigits:2,useGrouping:false});
 const money=new Intl.NumberFormat(locale,{style:"currency",currency,currencyDisplay:"code",
  minimumFractionDigits:2,maximumFractionDigits:2});
 return money.formatToParts(amount/centsPerUnit).map(part=>part.type==="fraction"?digits.format(amount%centsPerUnit):part.value).join("");
}
export function PostedEarningsSummary(){
 const t=useTranslations("postedEarnings"),locale=useLocale();
 const [scope,setScope]=useState(initial);
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [choices,setChoices]=useState<"loading"|"failed"|"ready">("loading");
 const [state,setState]=useState<"idle"|"pending"|"failed"|"ready">("idle");
 const [summary,setSummary]=useState<FinanceEarningSummary|null>(null);
 const active=useRef<AbortController|null>(null);
 useEffect(()=>{
  const controller=new AbortController(),signal=controller.signal;
  void Promise.all([
   read<{data:Workplace[];ok:boolean}>("/api/agent/v1",{method:"POST",signal,
    headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"workplaces.list"})}),
   read<Account[]>("/api/billing-accounts",{signal}),
  ]).then(([venues,payers])=>{
   if(signal.aborted)return;
   if(!venues.ok||!Array.isArray(venues.data)||!Array.isArray(payers)){
    setChoices("failed");return;
   }
   setWorkplaces(venues.data);setAccounts(payers);setChoices("ready");
  }).catch(()=>{if(!signal.aborted)setChoices("failed");});
  return ()=>{controller.abort();active.current?.abort();};
 },[]);
 function change(key:keyof typeof initial,value:string){
  active.current?.abort();active.current=null;
  setSummary(null);setState("idle");setScope(previous=>({...previous,[key]:value}));
 }
 async function run(event:FormEvent){
  event.preventDefault();active.current?.abort();
  const current=new AbortController();active.current=current;
  setState("pending");setSummary(null);
  const {billingAccountId,...required}=scope;
  const query=new URLSearchParams({...required,...(billingAccountId?{billingAccountId}:{})});
  try{
   const result=await read<FinanceEarningSummary>("/api/finance-ledger/earnings-summary?"+query,{signal:current.signal});
   if(active.current!==current||current.signal.aborted)return;
   setSummary(result);setState("ready");
  }catch{
   if(active.current===current&&!current.signal.aborted)setState("failed");
  }
 }
 return <section aria-label={t("title")} className="space-y-3 rounded-lg border border-border p-4">
  <h3 className="font-semibold">{t("title")}</h3>
  <p className="text-sm text-muted">{t("description")}</p>
  <form onSubmit={run} className="space-y-3">
   <div className="grid gap-3 sm:grid-cols-2">
    <label>{t("venue")}
     <select required className={field} value={scope.workplaceId} disabled={choices!=="ready"}
       onChange={event=>change("workplaceId",event.target.value)}>
      <option value="">{t("chooseVenue")}</option>
      {workplaces.map(venue=><option key={venue.id} value={venue.id}>{venue.name}</option>)}
     </select>
    </label>
    <label>{t("payer")}
     <select className={field} value={scope.billingAccountId} disabled={choices!=="ready"}
       onChange={event=>change("billingAccountId",event.target.value)}>
      <option value="">{t("allPayers")}</option>
      {accounts.map(account=><option key={account.id} value={account.id}>{account.status==="archived"?t("archived",{name:account.displayName}):account.displayName}</option>)}
     </select>
    </label>
    <label>{t("from")}<input required className={field} type="date" value={scope.from} onChange={event=>change("from",event.target.value)}/></label>
    <label>{t("to")}<input required className={field} type="date" value={scope.to} onChange={event=>change("to",event.target.value)}/></label>
    <label>{t("currency")}<input required className={field} pattern="[A-Z]{3}" maxLength={3} value={scope.currency}
      onChange={event=>change("currency",event.target.value.toUpperCase())}/></label>
   </div>
   <button type="submit" disabled={choices!=="ready"||state==="pending"} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{t("run")}</button>
  </form>
  {(choices==="failed"||state==="failed")&&<p role="alert" className="text-sm text-error">{t("unavailable")}</p>}
  <p role="status" className="text-sm">{choices==="loading"?t("loading"):state==="pending"?t("pending"):summary?t("postedCount",{count:summary.obligationCount}):""}</p>
  {summary&&<dl className="grid gap-2 sm:grid-cols-2">
   {(["grossPostedCents","correctionCents","correctedPostedCents","netAllocatedReceivedCents","outstandingCents"] as const).map(key=>
    <div key={key}><dt>{t(key)}</dt><dd className="font-medium"><bdi>{currencyAmount(summary[key],summary.currency,locale)}</bdi></dd></div>)}
  </dl>}
 </section>;
}
