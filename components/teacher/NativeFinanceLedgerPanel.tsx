"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {useTranslations} from "next-intl";
import type {FinancePeriodEndReview} from "@/lib/server/finance-period-end-review";
import {PeriodEndActuals} from "./PeriodEndActuals";
import {PostedEarningsSummary} from "./PostedEarningsSummary";
import {useLocalizedApiError} from "@/i18n/use-localized-api-error";
type Obligation={id:string;kind:string;amount_cents:number;currency:string;agreement_id:string;period_start:string};
type Payment={id:string;amount_cents:number;currency:string;billing_account_id:string};
type Allocation={id:string;amount_cents:number};
type Ledger={obligations:Obligation[];receivedPayments:Payment[];allocations:Allocation[];
 reversals:Array<{id:string;kind:string;amount_cents:number}>;limitPerCategory:number};
type Agreement={id:string;model:string;exactSessionId:string|null;effectiveFrom:string;agreementRole:string;revision:number;status:string;currency:string};
type Account={id:string;displayName:string;status:string};
type Action="approve"|"payment"|"allocate"|"reverse";
const field="mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";
async function getJson<T>(url:string,init?:RequestInit):Promise<T>{
 const res=await fetch(url,{cache:"no-store",...init}),value=await res.json().catch(()=>null);
 if(!res.ok)throw Object.assign(new Error(value?.error??"Request failed"),{code:value?.code});
 return value as T;
}
export function NativeFinanceLedgerPanel(){
 const t=useTranslations("nativeFinance"),apiError=useLocalizedApiError();
 const [ledger,setLedger]=useState<Ledger>({obligations:[],receivedPayments:[],allocations:[],reversals:[],limitPerCategory:100});
 const [agreements,setAgreements]=useState<Agreement[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [action,setAction]=useState<Action>("approve");
 const [agreementId,setAgreementId]=useState(""),[accountId,setAccountId]=useState("");
 const [sessionId,setSessionId]=useState(""),[studentId,setStudentId]=useState("");
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [currency,setCurrency]=useState("ILS"),[amount,setAmount]=useState(0);
 const [method,setMethod]=useState("bank_transfer"),[reference,setReference]=useState("");
 const [receivedAt,setReceivedAt]=useState("");
 const [paymentId,setPaymentId]=useState(""),[obligationId,setObligationId]=useState("");
 const [kind,setKind]=useState("allocation_reversal"),[targetId,setTargetId]=useState("");
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function refresh(){
  const [l,a,p]=await Promise.all([
   getJson<Ledger>("/api/finance-ledger"),
   getJson<Agreement[]>("/api/compensation-agreements?includeArchived=true"),
   getJson<Account[]>("/api/billing-accounts"),
  ]);
  setLedger(l);setAgreements(a.filter(x=>x.status==="active"));
  setAccounts(p.filter(x=>x.status==="active"));
 }
 useEffect(()=>{
  void refresh().catch(e=>setError(apiError(e,t("loadFailed"))));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const approvalSelector=useRef<HTMLSelectElement>(null);
 const agreement=agreements.find(x=>x.id===agreementId);
 const targets=kind==="allocation_reversal"?ledger.allocations:
  kind==="payment_refund"?ledger.receivedPayments:ledger.obligations;
 async function submit(event:FormEvent){
  event.preventDefault();setError("");setNotice("");
  const endpoint=action==="approve"?"obligations":action==="payment"?"payments":
   action==="allocate"?"allocations":"reversals";
  const payload=action==="approve"?{
    agreementId,expectedRevision:agreement?.revision,expectedAmountCents:amount,
    sessionId:agreement?.exactSessionId??(sessionId.trim()||null),
    studentId:agreement?.exactSessionId?null:(studentId.trim()||null),
    periodStart:agreement?.exactSessionId?agreement.effectiveFrom:from,
    periodEnd:agreement?.exactSessionId?agreement.effectiveFrom:to,
   }:action==="payment"?{
    billingAccountId:accountId,currency,amountCents:amount,
    receivedAt:new Date(receivedAt).toISOString(),
    method,externalReference:reference.trim()||null,
   }:action==="allocate"?{
    receivedPaymentId:paymentId,obligationId,amountCents:amount,
   }:{kind,targetId,amountCents:amount,reason:reason.trim()};
  if(!window.confirm(t("confirm")))return;
  setBusy(true);
  try{
   await getJson("/api/finance-ledger/"+endpoint,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...payload,idempotencyKey:crypto.randomUUID(),confirmed:true}),
   });
   await refresh();setNotice(t("saved"));
  }catch(e){
   const code=(e as {code?:string}|null)?.code;
   setError(code==="EXACT_AGREEMENT_REVIEW_REQUIRED"?t("reviewRequired"):
    code==="EXACT_AGREEMENT_SESSION_MISMATCH"?t("reviewMismatch"):
    code==="GROUP_AGREEMENT_REVIEW_REQUIRED"?t("groupReviewRequired"):apiError(e,t("saveFailed")));
  }
  finally{setBusy(false);}
 }
 return <section aria-label={t("title")} className="mb-8 space-y-4 rounded-xl border border-border bg-surface p-5">
  <h2 className="text-lg font-semibold">{t("title")}</h2>
  <p className="text-sm text-muted">{t("description")}</p>
  <p className="text-xs text-muted">{t("warning")}</p>
  {error&&<p role="alert" className="text-sm text-error">{error}</p>}
  {notice&&<p role="status" className="text-sm">{notice}</p>}
  <PostedEarningsSummary />
  <PeriodEndActuals onReview={(item:FinancePeriodEndReview["items"][number],monthStart,monthEnd)=>{
   const term=agreements.find(row=>row.id===item.agreementId);
   if(!term||term.revision!==item.revision||term.model!=="fixed_period")return false;
   setAction("approve");setAgreementId(item.agreementId);setSessionId("");setStudentId("");
   setFrom(monthStart);setTo(monthEnd);setAmount(item.proposedCents);setNotice("");setError("");
   requestAnimationFrame(()=>approvalSelector.current?.focus());return true;
  }} />
  <form onSubmit={submit} className="space-y-3">
   <label className="block text-sm">{t("action")}
    <select className={field} value={action} onChange={e=>setAction(e.target.value as Action)}>
     <option value="approve">{t("approve")}</option>
     <option value="payment">{t("payment")}</option>
     <option value="allocate">{t("allocate")}</option>
     <option value="reverse">{t("reverse")}</option>
    </select>
   </label>
   {action==="approve"&&<>
    <label className="block text-sm">{t("agreement")}
     <select ref={approvalSelector} required className={field} value={agreementId} onChange={e=>setAgreementId(e.target.value)}>
      <option value="">{t("select")}</option>
      {agreements.map(x=><option key={x.id} value={x.id}>{x.exactSessionId?t("exactAgreement"):x.agreementRole} · {x.model} · {x.id.slice(0,8)}</option>)}
     </select>
    </label>
    {agreement?.exactSessionId?<p className="text-sm">{t("pinnedLesson",{
      reference:agreement.exactSessionId.slice(0,8),date:agreement.effectiveFrom,
    })}</p>:<>
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-sm">{t("from")}<input required type="date" className={field} value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label className="text-sm">{t("to")}<input required type="date" className={field} value={to} onChange={e=>setTo(e.target.value)}/></label>
    </div>
    <label className="block text-sm">{t("sessionId")}<input className={field} value={sessionId} onChange={e=>setSessionId(e.target.value)}/></label>
    <label className="block text-sm">{t("studentId")}<input className={field} value={studentId} onChange={e=>setStudentId(e.target.value)}/></label>
    </>}
   </>}
   {action==="payment"&&<>
    <label className="block text-sm">{t("account")}
     <select required className={field} value={accountId} onChange={e=>setAccountId(e.target.value)}>
      <option value="">{t("select")}</option>
      {accounts.map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}
     </select>
    </label>
    <div className="grid gap-3 sm:grid-cols-2">
     <label className="text-sm">{t("currency")}<input required pattern="[A-Z]{3}" maxLength={3} className={field} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></label>
     <label className="text-sm">{t("receivedAt")}<input required type="datetime-local" className={field} value={receivedAt} onChange={e=>setReceivedAt(e.target.value)}/></label>
    </div>
    <label className="block text-sm">{t("method")}
     <select className={field} value={method} onChange={e=>setMethod(e.target.value)}>
      <option value="bank_transfer">{t("bank")}</option><option value="cash">{t("cash")}</option>
      <option value="card">{t("card")}</option><option value="other">{t("other")}</option>
     </select>
    </label>
    <label className="block text-sm">{t("reference")}<input className={field} maxLength={240} value={reference} onChange={e=>setReference(e.target.value)}/></label>
   </>}
   {action==="allocate"&&<>
    <label className="block text-sm">{t("paymentId")}
     <select required className={field} value={paymentId} onChange={e=>setPaymentId(e.target.value)}>
      <option value="">{t("select")}</option>
      {ledger.receivedPayments.map(x=><option key={x.id} value={x.id}>{x.id.slice(0,8)} · {x.amount_cents} {x.currency}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("obligationId")}
     <select required className={field} value={obligationId} onChange={e=>setObligationId(e.target.value)}>
      <option value="">{t("select")}</option>
      {ledger.obligations.map(x=><option key={x.id} value={x.id}>{x.id.slice(0,8)} · {x.amount_cents} {x.currency}</option>)}
     </select>
    </label>
   </>}
   {action==="reverse"&&<>
    <label className="block text-sm">{t("kind")}
     <select className={field} value={kind} onChange={e=>{setKind(e.target.value);setTargetId("");}}>
      <option value="allocation_reversal">{t("allocationReversal")}</option>
      <option value="payment_refund">{t("refund")}</option>
      <option value="obligation_correction">{t("correction")}</option>
     </select>
    </label>
    <label className="block text-sm">{t("target")}
     <select required className={field} value={targetId} onChange={e=>setTargetId(e.target.value)}>
      <option value="">{t("select")}</option>
      {targets.map(x=><option key={x.id} value={x.id}>{x.id.slice(0,8)} · {x.amount_cents}</option>)}
     </select>
    </label>
    <label className="block text-sm">{t("reason")}<textarea required minLength={3} maxLength={1000} className={field} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   </>}
   <label className="block text-sm">{t("cents")}
    <input type="number" min="1" max="1000000000" step="1" required className={field} value={amount} onChange={e=>setAmount(Number(e.target.value))}/>
   </label>
   <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
    {t("confirmAction")}
   </button>
  </form>
  <div className="grid gap-4 lg:grid-cols-2">
   <div><h3 className="font-semibold">{t("obligations")}</h3>
    <ul className="max-h-52 overflow-auto text-sm">
     {ledger.obligations.map(x=><li key={x.id} className="border-b border-border py-2">
      {x.kind} · {x.amount_cents} {x.currency} · {x.period_start} · {x.id.slice(0,8)}
     </li>)}
    </ul>
   </div>
   <div><h3 className="font-semibold">{t("receipts")}</h3>
    <ul className="max-h-52 overflow-auto text-sm">
     {ledger.receivedPayments.map(x=><li key={x.id} className="border-b border-border py-2">
      {x.amount_cents} {x.currency} · {x.id.slice(0,8)}
     </li>)}
    </ul>
   </div>
  </div>
  <p className="text-xs text-muted">{t("limit",{limit:ledger.limitPerCategory})}</p>
 </section>;
}
