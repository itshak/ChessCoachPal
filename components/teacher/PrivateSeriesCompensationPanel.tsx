"use client";
import {useRef,useState} from "react";
import {useLocale,useTranslations} from "next-intl";
import {isPrivateSeriesTerminalDenial} from "@/lib/private-series-approval-errors";
import type {privateSeriesRead} from "@/lib/server/private-series-compensation";

type Read=Awaited<ReturnType<typeof privateSeriesRead>>;
const uri="/api/compensation-agreements/private-series";
const field="block w-full rounded border border-border bg-background p-2";
async function get<T>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{cache:"no-store",...init}),body=await response.json().catch(()=>null);
 if(!response.ok)throw Object.assign(new Error("Private series request failed"),{code:body?.code});
 return body as T;
}
export function PrivateSeriesCompensationPanel({workplaceId}:{workplaceId:string}){
 const t=useTranslations("privateSeriesCompensation"),locale=useLocale();
 const [inventory,setInventory]=useState<Read|null>(null),[snapshot,setSnapshot]=useState<Read|null>(null);
 const [seriesId,setSeries]=useState(""),[agreementId,setAgreement]=useState(""),[sessionId,setSession]=useState("");
 const [payer,setPayer]=useState(""),[model,setModel]=useState("per_session"),[rate,setRate]=useState("");
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const attempt=useRef<{body:string;query:string}|null>(null),running=useRef(false),statusRef=useRef<HTMLParagraphElement>(null);
 const index=inventory?.workplaceId===workplaceId?inventory:null;
 const root=index?.series.find(x=>x.id===seriesId);
 const current=snapshot?.workplaceId===workplaceId&&snapshot.detail?.privateSeriesId===root?.id?snapshot:null;
 const term=current?.detail?.terms.find(x=>x.id===agreementId);
 const review=current&&"review" in current&&current.review?.term.id===term?.id?current.review:null;
 const occurrence=review?.occurrences.find(x=>x.id===sessionId&&x.state==="ready");
 const held=busy||pending;
 const overlap=Boolean(from&&to&&current?.detail?.terms.some(x=>x.status==="active"&&x.from<=to&&from<=x.to));
 const query=(rootId?:string,termId?:string)=>uri+"?"+new URLSearchParams({
  workplaceId,...(rootId?{privateSeriesId:rootId}:{}),...(termId?{agreementId:termId}:{}),
 });
 const weekday=(n:number)=>new Intl.DateTimeFormat(locale,{weekday:"long",timeZone:"UTC"}).format(new Date(Date.UTC(2025,0,5+n)));
 const readableTime=(iso:string,timeZone:string)=>new Intl.DateTimeFormat(locale,{timeStyle:"short",timeZone}).format(new Date(iso));
 const money=(cents:number,code:string)=>new Intl.NumberFormat(locale,{style:"currency",currency:code,minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100);
 async function read(rootId?:string,termId?:string){
  if(running.current||held||!workplaceId)return;
  running.current=true;setBusy(true);setError("");setNotice("");
  setSnapshot(null);
  if(!rootId){setInventory(null);setSeries("");setAgreement("");setSession("");setPayer("");}
  try{
   const v=await get<Read>(query(rootId,termId));
   if(rootId)setSnapshot(v);else setInventory(v);
  }catch{setError(t("unavailable"));}
  finally{running.current=false;setBusy(false);}
 }
 async function send(){
  const pinned=attempt.current;
  if(!pinned||running.current)return;
  running.current=true;setBusy(true);setError("");
  try{
   const receipt=await get<{action:"terms"|"archive"|"post";replayed:boolean}>(uri,
    {method:"POST",headers:{"Content-Type":"application/json"},body:pinned.body});
   attempt.current=null;setPending(false);setSnapshot(null);
   setNotice(t(receipt.replayed?"replay":receipt.action==="terms"?"termsSaved":receipt.action==="archive"?"termsArchived":"posted"));
   try{setSnapshot(await get<Read>(pinned.query));}catch{setError(t("refreshFailed"));}
   statusRef.current?.focus();
  }catch(e){
   const code=(e as {code?:string}).code;
   if(code&&isPrivateSeriesTerminalDenial(code)){
     attempt.current=null;setPending(false);setSnapshot(null);
     setError(t(code==="PRIVATE_SERIES_TERMS_OVERLAP"?"overlapChanged":
      code==="PRIVATE_SERIES_PAYER_UNAVAILABLE"?"payerChanged":
      code==="PRIVATE_SERIES_EARNING_ALREADY_POSTED"?"alreadyPosted":"changed"));
   }else{setPending(true);setError(t("uncertain"));}
  }finally{running.current=false;setBusy(false);}
 }
 function approve(action:"terms"|"archive"|"post"){
  if(held||running.current||!root||!current?.detail)return;
  const selectedPayer=current.detail.payers.find(x=>x.id===payer);
  const termPayer=current.detail.payers.find(x=>x.id===term?.billingAccountId);
  const rootLabel=root.studentName+" · "+weekday(root.weekday)+" "+root.startTime.slice(0,5)+" · "+root.id.slice(0,8);
  const base={action,confirmed:true,idempotencyKey:crypto.randomUUID()};
  let data:Record<string,unknown>,dialog:string;
  if(action==="terms"){
   const cents=Number(rate);
   if(current.workplaceArchived||!selectedPayer||!Number.isSafeInteger(cents)||cents<1||cents>1_000_000_000||
     !from||!to||from<=current.detail.currentVenueDay||to<from||overlap||
     !current.detail.segments.some(seg=>seg.active&&seg.from<=to&&(seg.to===null||seg.to>=from)))return;
   data={...base,workplaceId,privateSeriesId:root.id,billingAccountId:selectedPayer.id,
    currency:current.currency,model,rateCents:cents,from,to};
   dialog=t("confirmTerms",{root:rootLabel,venue:current.workplaceName,payer:selectedPayer.name+" · "+selectedPayer.id.slice(0,8),
    amount:money(cents,current.currency),model:t(model as "per_session"|"per_student"|"hourly"),from,to});
  }else if(action==="archive"&&term?.status==="active"){
   if(term.from<=current.detail.currentVenueDay)return;
   data={...base,agreementId:term.id,expectedRevision:term.revision};
   dialog=t("confirmArchive",{root:rootLabel,from:term.from,to:term.to});
  }else if(action==="post"&&term&&occurrence&&occurrence.expectedAmountCents!==null&&termPayer){
   data={...base,agreementId:term.id,expectedRevision:term.revision,privateSeriesId:root.id,sessionId:occurrence.id,
    taughtOn:occurrence.taughtOn,expectedAmountCents:occurrence.expectedAmountCents};
   dialog=t("confirmPost",{root:rootLabel,lesson:occurrence.title+" · "+occurrence.id.slice(0,8),day:occurrence.taughtOn,
    payer:termPayer.name+" · "+termPayer.id.slice(0,8),amount:money(occurrence.expectedAmountCents,term.currency)});
  }else return;
  if(!window.confirm(dialog))return;
  attempt.current={body:JSON.stringify(data),query:query(root.id,action==="terms"?undefined:term?.id)};
  setPending(true);void send();
 }
 return <section className="space-y-3 rounded border border-border p-4" aria-label={t("heading")}>
  <h3 className="font-semibold">{t("heading")}</h3><p>{t("description")}</p>
  <fieldset className="space-y-2" disabled={held||!workplaceId}>
   <button type="button" className="underline" onClick={()=>void read()}>{t("load")}</button>
   {index&&<label className="block">{t("series")}<select className={field} value={seriesId} onChange={e=>{
    setSeries(e.target.value);setSnapshot(null);setAgreement("");setSession("");setPayer("");setNotice("");setError("");
   }}><option value="">{t("choose")}</option>
    {index.series.map(s=><option key={s.id} value={s.id}>{s.studentName} · {weekday(s.weekday)} {s.startTime.slice(0,5)} · {s.id.slice(0,8)}</option>)}
   </select></label>}
   {root&&<button type="button" className="underline" onClick={()=>void read(root.id)}>{t("reviewSeries")}</button>}
   {current?.detail&&<>
    <p>{t("venueDay",{day:current.detail.currentVenueDay,zone:current.timezone})}</p>
    {!current.workplaceArchived&&current.detail.segments.some(x=>x.active)&&<>
     <label className="block">{t("payer")}<select className={field} value={payer} onChange={e=>setPayer(e.target.value)}>
      <option value="">{t("choose")}</option>{current.detail.payers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.id.slice(0,8)}</option>)}
     </select></label>
     <label className="block">{t("model")}<select className={field} value={model} onChange={e=>setModel(e.target.value)}>
      <option value="per_session">{t("per_session")}</option><option value="hourly">{t("hourly")}</option><option value="per_student">{t("per_student")}</option>
     </select></label>
     <label className="block">{t("rate",{currency:current.currency})}<input className={field} type="number" min="1" max="1000000000" step="1" value={rate} onChange={e=>setRate(e.target.value)}/></label>
     <label className="block">{t("from")}<input className={field} type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
     <label className="block">{t("to")}<input className={field} type="date" min={from||undefined} value={to} onChange={e=>setTo(e.target.value)}/></label>
     <p id="private-series-terms-overlap" aria-live="polite">{overlap?t("overlap"):""}</p>
     <button type="button" className="underline" aria-describedby="private-series-terms-overlap" disabled={!payer||!rate||!from||!to||from<=current.detail.currentVenueDay||to<from||overlap||
      !current.detail.segments.some(s=>s.active&&s.from<=to&&(s.to===null||s.to>=from))} onClick={()=>approve("terms")}>{t("approveTerms")}</button>
    </>}
    <label className="block">{t("agreement")}<select className={field} value={agreementId} onChange={e=>{setAgreement(e.target.value);setSession("");}}>
     <option value="">{t("choose")}</option>{current.detail.terms.map(x=><option key={x.id} value={x.id}>{x.from} – {x.to} · {money(x.rateCents,x.currency)} · {t(x.model)} · {t(x.status)} · {x.id.slice(0,8)}</option>)}
    </select></label>
    {term&&<>
     <button type="button" className="underline" onClick={()=>void read(root!.id,term.id)}>{t("reviewPost")}</button>
     {term.status==="active"&&term.from>current.detail.currentVenueDay&&<button type="button" className="ms-3 underline" onClick={()=>approve("archive")}>{t("archive")}</button>}
    </>}
   </>}
   {review&&<>
    <p>{review.state==="ready"?t("forecast",{amount:money(review.forecastCents,review.term.currency)}):t(review.state)}</p>
    {review.occurrences.length>0&&<label className="block">{t("occurrence")}<select className={field} value={sessionId} onChange={e=>setSession(e.target.value)}>
     <option value="">{t("choose")}</option>{review.occurrences.map(o=><option disabled={o.state!=="ready"} value={o.id} key={o.id}>
      {o.taughtOn} · {o.title} · {readableTime(o.startsAt,o.timezone)} · {o.timezone} · {t(o.state)} · {o.id.slice(0,8)}
     </option>)}
    </select></label>}
    {occurrence&&<p>{t("dateEvidence",{day:occurrence.taughtOn,original:occurrence.originalOn})}</p>}
    <button type="button" className="underline" disabled={!occurrence} onClick={()=>approve("post")}>{t("approvePost")}</button>
   </>}
  </fieldset>
  {pending&&!busy&&<button type="button" className="underline" onClick={()=>void send()}>{t("retry")}</button>}
  {error&&<p role="alert">{error}</p>}
  <p tabIndex={-1} role="status" ref={statusRef}>{busy?t("working"):notice}</p>
 </section>;
}
