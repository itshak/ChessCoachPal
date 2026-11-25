"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useLocale,useTranslations} from "next-intl";
import {currencyAmount} from "@/lib/finance-amount-format";
import type {FinancePeriodEndReview} from "@/lib/server/finance-period-end-review";
import type {FinancePeriodEndActuals} from "@/lib/server/finance-period-end-actuals";

type Workplace={id:string;name:string};
type Account={id:string;displayName:string;status:string};
const field="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
const initial={workplaceId:"",month:"",currency:"",billingAccountId:""};
async function read<T>(url:string,init?:RequestInit):Promise<T>{
 const result=await fetch(url,{cache:"no-store",...init});
 if(!result.ok)throw new Error("PERIOD_END_ACTUALS_UNAVAILABLE");
 return result.json();
}
type ReviewItem=FinancePeriodEndReview["items"][number];
type OnReview=(item:ReviewItem,monthStart:string,monthEnd:string)=>boolean;
function PeriodEndActualsForm({onReview}:{onReview:OnReview}){
 const t=useTranslations("periodEndActuals"),locale=useLocale();
 const [scope,setScope]=useState(initial);
 const [workplaces,setWorkplaces]=useState<Workplace[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [choices,setChoices]=useState<"loading"|"failed"|"ready">("loading");
 const [state,setState]=useState<"idle"|"pending"|"failed"|"ready">("idle");
 const [summary,setSummary]=useState<FinancePeriodEndActuals|null>(null);
 const [review,setReview]=useState<FinancePeriodEndReview|null>(null);
 const [stale,setStale]=useState(false);
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
  setSummary(null);setReview(null);setStale(false);setState("idle");setScope(previous=>({...previous,[key]:value}));
 }
 async function run(event:FormEvent){
  event.preventDefault();active.current?.abort();
  const current=new AbortController();active.current=current;
  const reviewOnly=(event.nativeEvent as SubmitEvent).submitter?.getAttribute("value")==="review";
  setState("pending");setSummary(null);setReview(null);setStale(false);
  const {billingAccountId,month,...required}=scope;
  const query=new URLSearchParams({...required,monthStart:month+"-01",...(billingAccountId?{billingAccountId}:{})});
  try{
   const options={signal:current.signal};
   if(reviewOnly){
    const result=await read<FinancePeriodEndReview>("/api/finance-ledger/period-end-review?"+query,options);
    if(active.current!==current||current.signal.aborted)return;
    setReview(result);
   }else{
    const result=await read<FinancePeriodEndActuals>("/api/finance-ledger/period-end-actuals?"+query,options);
    if(active.current!==current||current.signal.aborted)return;
    setSummary(result);
   }
   setState("ready");
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
    <label>{t("month")}<input required className={field} type="month" min="0001-01" max="9999-12"
      value={scope.month} onChange={event=>change("month",event.target.value)}/></label>
    <label>{t("currency")}<input required className={field} pattern="[A-Z]{3}" maxLength={3} value={scope.currency}
      onChange={event=>change("currency",event.target.value.toUpperCase())}/></label>
   </div>
   <div className="flex flex-wrap gap-2">
    <button type="submit" disabled={choices!=="ready"||state==="pending"} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{t("run")}</button>
    <button type="submit" value="review" disabled={choices!=="ready"||state==="pending"} className="rounded-lg border border-border px-4 py-2 disabled:opacity-50">{t("runReview")}</button>
   </div>
  </form>
  {(choices==="failed"||state==="failed")&&<p role="alert" className="text-sm text-error">{t("unavailable")}</p>}
  <p role="status" className="text-sm">{choices==="loading"?t("loading"):state==="pending"?t("pending"):(summary??review)?t("scope",{month:(summary??review)!.monthStart.slice(0,7),currency:(summary??review)!.currency}):""}</p>
  {review&&<section aria-label={t("reviewTitle")} className="space-y-2 rounded-lg border border-border p-3">
   <h4 className="font-semibold">{t("reviewTitle")}</h4>
   <p className="text-sm text-muted">{t("reviewDescription")}</p>
   {stale&&<p role="alert" className="text-sm text-error">{t("reviewStale")}</p>}
   {review.items.length?<ul className="space-y-2 text-sm">
    {review.items.map(item=><li key={item.agreementId} className="space-y-1 border-b border-border pb-2">
     <p className="break-words">{accounts.find(account=>account.id===item.billingAccountId)?.displayName??item.billingAccountId.slice(0,8)}
      {" · "}<bdi>{item.agreementId.slice(0,8)}</bdi>{" · "}<bdi>{currencyAmount(item.proposedCents,review.currency,locale)}</bdi></p>
     {item.reviewStatus==="payer_archived"?<p>{t("reviewPayerArchived")}</p>:
      <button type="button" className="rounded-lg border border-border px-3 py-1"
       aria-label={t("reviewExact",{reference:item.agreementId.slice(0,8)})}
       onClick={()=>setStale(!onReview(item,review.monthStart,review.monthEnd))}>{t("reviewOpen")}</button>}
    </li>)}
   </ul>:<p className="text-sm">{t("reviewEmpty")}</p>}
  </section>}
  {summary&&<div className="grid min-w-0 gap-3 lg:grid-cols-3">
   {summary.categories.map(row=><section key={row.kind} className="min-w-0 rounded-lg border border-border p-3" aria-label={t(row.kind)}>
    <h4 className="font-semibold">{t(row.kind)}</h4>
    <p className="text-sm text-muted">{t("postedCount",{count:row.obligationCount})}</p>
    <dl className="space-y-1 text-sm">
     {(["grossPostedCents","correctionCents","correctedPostedCents","netAppliedCents","outstandingCents"] as const).map(key=>
      <div key={key}><dt>{t(key)}</dt><dd className="break-words font-medium"><bdi>{currencyAmount(row[key],summary.currency,locale)}</bdi></dd></div>)}
    </dl>
   </section>)}
  </div>}
 </section>;
}

export function PeriodEndActuals({onReview}:{onReview:OnReview}){
 const t=useTranslations("periodEndActuals");
 const [opened,setOpened]=useState(false);
 return <>
  <button type="button" className="rounded-lg border border-border px-4 py-2" aria-expanded={opened}
    onClick={()=>setOpened(value=>!value)}>{t("toggle")}</button>
  {opened&&<PeriodEndActualsForm onReview={onReview} />}
 </>;
}
