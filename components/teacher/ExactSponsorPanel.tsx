"use client";
import {useRef,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
type Lesson={id:string;title:string;startsAt:string;timezone:string};
type Review={workplaceId:string;sessionId:string;day:string;currency:string;timezone:string;title:string;startsAt:string;
 participants:{id:string;name:string;automaticBillingReviewRequired:boolean;activeAgreement:{id:string;revision:number}|null}[];payers:{id:string;name:string}[]};
const url="/api/compensation-agreements/exact-sponsor";
const field="w-full rounded border border-border bg-background p-2";
async function json<T>(path:string,init?:RequestInit):Promise<T>{
 const r=await fetch(path,{...init,cache:"no-store"}),data=await r.json().catch(()=>null);
 if(!r.ok)throw Object.assign(new Error("Request failed"),{code:data?.code,status:r.status});
 return data as T;
}
export function ExactSponsorPanel({workplaceId,onSaved}:{workplaceId:string;onSaved:()=>void}){
 const t=useTranslations("exactSponsor"),locale=useLocale();
 const [day,setDay]=useState(""),[lesson,setLesson]=useState(""),[student,setStudent]=useState(""),[payer,setPayer]=useState("");
 const [lessons,setLessons]=useState<{key:string;items:Lesson[]}|null>(null),[review,setReview]=useState<Review|null>(null);
 const [rate,setRate]=useState(""),[model,setModel]=useState("per_session"),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const attempt=useRef<string|null>(null),inFlight=useRef(false),status=useRef<HTMLParagraphElement>(null);
 const context=workplaceId+":"+day,choices=lessons?.key===context?lessons.items:[];
 const ready=review?.workplaceId===workplaceId&&review.day===day&&review.sessionId===lesson?review:null;
 const selected=ready?.participants.find(p=>p.id===student),selectedPayer=ready?.payers.find(p=>p.id===payer);
 const active=selected?.activeAgreement;
 const locked=busy||pending;
 function clear(){setLesson("");setStudent("");setPayer("");setReview(null);setError("");setMessage("");}
 async function lookup(){
  if(locked||inFlight.current||!day)return;
  inFlight.current=true;setBusy(true);clear();
  try{
   const v=await json<{lessons:Lesson[]}>("/api/compensation-agreements/completed-lessons?"+
     new URLSearchParams({workplaceId,date:day}));
   setLessons({key:context,items:v.lessons});
  }catch{setError(t("unavailable"));}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function reviewLesson(){
  if(locked||inFlight.current||!choices.some(x=>x.id===lesson))return;
  inFlight.current=true;setBusy(true);setError("");setReview(null);setStudent("");setPayer("");
  try{setReview(await json<Review>(url+"?"+new URLSearchParams({workplaceId,sessionId:lesson,day})));}
  catch{setError(t("unavailable"));}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function send(){
  if(!attempt.current||inFlight.current)return;
  inFlight.current=true;setBusy(true);setError("");
  try{
   const out=await json<{status:"active"|"archived";workplaceId:string;exactSessionId:string;day:string;replayed:boolean}>(
    url,{method:"POST",headers:{"Content-Type":"application/json"},body:attempt.current});
   // The receipt acknowledges the write, not the current state. Disable new
   // actions until we fetch the signed exact current review independently.
   attempt.current=null;setPending(false);setReview(null);
   setMessage(t(out.replayed?"replayReceipt":out.status==="archived"?"archived":"saved"));
   try{
    setReview(await json<Review>(url+"?"+new URLSearchParams({
     workplaceId:out.workplaceId,sessionId:out.exactSessionId,day:out.day,
    })));
   }catch{setError(t("refreshFailed"));}
   onSaved();status.current?.focus();
  }catch(e){
   const code=(e as {code?:string})?.code;
   // Only receipt-first typed definitive business denials may release the exact attempt.
   if(["EXACT_SPONSOR_RETAINED_BILLING_SOURCE","EXACT_AGREEMENT_ALREADY_POSTED","STALE_AGREEMENT_REVISION",
     "EXACT_AGREEMENT_SCOPE_UNAVAILABLE","EXACT_SPONSOR_REVIEW_CHANGED"].includes(code??"")){
      attempt.current=null;setPending(false);setError(t("changed"));setReview(null);
   }else{setPending(true);setError(t("uncertain"));}
  }finally{inFlight.current=false;setBusy(false);}
 }
 function approve(archive=false){
  if(locked||inFlight.current||!ready||!selected)return;
  const amount=Number(rate);
  if(archive&&!active)return;
  if(!archive&&(!selectedPayer||!Number.isSafeInteger(amount)||amount<1||amount>1_000_000_000))return;
  const time=new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:ready.timezone}).format(new Date(ready.startsAt));
  const details={lesson:ready.title+" · "+time+" · "+ready.sessionId.slice(0,8),day:ready.day,
   student:selected.name+" · "+selected.id.slice(0,8),
   payer:selectedPayer?selectedPayer.name+" · "+selectedPayer.id.slice(0,8):"",currency:ready.currency,amount};
  if(!window.confirm(archive?t("archiveConfirm",{lesson:details.lesson,day:details.day,student:details.student}):
    t("confirm",{...details,model:t(model as "per_session"|"per_student"|"hourly")})+"\n\n"+t("willHold")))return;
  const base={idempotencyKey:crypto.randomUUID(),confirmed:true};
  attempt.current=JSON.stringify(archive&&active?
   {...base,action:"archive",agreementId:active.id,expectedRevision:active.revision}:
   {...base,action:"create",workplaceId,sessionId:ready.sessionId,studentId:student,billingAccountId:payer,
    day:ready.day,currency:ready.currency,model,rateCents:amount});
  setPending(true);void send();
 }
 return <section aria-label={t("heading")} className="space-y-3 rounded border border-border p-4">
  <h3 className="font-semibold">{t("heading")}</h3><p>{t("description")}</p>
  <fieldset disabled={locked||!workplaceId} className="space-y-2">
   <label className="block">{t("day")}<input className={field} type="date" value={day} onChange={e=>{setDay(e.target.value);clear();}}/></label>
   <button type="button" className="underline" onClick={()=>void lookup()} disabled={!day}>{t("find")}</button>
   {lessons?.key===context&&<label className="block">{t("lesson")}<select className={field} value={lesson} onChange={e=>{clear();setLesson(e.target.value);}}>
    <option value="">{t("choose")}</option>
    {choices.map(l=><option key={l.id} value={l.id}>{l.title} · {new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone:l.timezone}).format(new Date(l.startsAt))} · {l.id.slice(0,8)}</option>)}
   </select></label>}
   <button type="button" className="underline" onClick={()=>void reviewLesson()} disabled={!lesson||!choices.some(x=>x.id===lesson)}>{t("review")}</button>
   {ready&&<>
    <p>{t("exactDay",{day:ready.day,zone:ready.timezone})}</p>
    <label className="block">{t("student")}<select className={field} value={student} onChange={e=>{setStudent(e.target.value);setPayer("");}}>
     <option value="">{t("choose")}</option>{ready.participants.map(x=><option value={x.id} key={x.id}>{x.name} · {x.id.slice(0,8)}</option>)}
    </select></label>
    {selected&&<p>{t(selected.automaticBillingReviewRequired?"witness":"willHold")}</p>}
    {active?<button type="button" className="underline" onClick={()=>approve(true)}>{t("archive")}</button>:<>
     <label className="block">{t("payer")}<select className={field} value={payer} onChange={e=>setPayer(e.target.value)}>
      <option value="">{t("choose")}</option>{ready.payers.map(x=><option value={x.id} key={x.id}>{x.name} · {x.id.slice(0,8)}</option>)}
     </select></label>
     <label className="block">{t("model")}<select className={field} value={model} onChange={e=>setModel(e.target.value)}>
      <option value="per_session">{t("per_session")}</option><option value="per_student">{t("per_student")}</option>
      <option value="hourly">{t("hourly")}</option>
     </select></label>
     <label className="block">{t("amount",{currency:ready.currency})}<input className={field} type="number" min="1" max="1000000000" step="1" value={rate} onChange={e=>setRate(e.target.value)}/></label>
     <button type="button" className="underline" onClick={()=>approve()} disabled={!selected||!selectedPayer||!rate}>{t("approve")}</button>
    </>}
   </>}
  </fieldset>
  {pending&&!busy&&<button type="button" className="underline" onClick={()=>void send()}>{t("retry")}</button>}
  {error&&<p role="alert">{error}</p>}
  <p role="status" tabIndex={-1} ref={status}>{busy?t("working"):message}</p>
 </section>;
}
