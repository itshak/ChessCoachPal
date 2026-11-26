import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {provider} from "../chess-public-ratings";
import {OnlineRatingProviderLimited,StudentRatingError} from "./online-rating-transport";
import {OnlineRatingBudgetUnavailable,runOnlineRatingLease} from "./online-rating-worker";

type Provider=z.infer<typeof provider>;
const candidate=z.object({teacherId:z.uuid(),jobId:z.uuid(),provider}).strict();
const grant=z.object({status:z.literal("admitted"),token:z.uuid(),leaseUntil:z.iso.datetime({offset:true})}).strict();
const refused=z.object({status:z.enum(["unavailable","operator_hold","paused","cooling_down","in_flight","quota","busy"])}).strict();
const settled=z.object({status:z.enum(["recorded","operator_hold"])}).strict();
type Settlement=
 | {p_outcome:"completed"|"operator_hold";p_retry_at:null}
 | {p_outcome:"rate_limited";p_retry_at:string};
type Budget={
 acquire:(key:Provider)=>Promise<unknown>;
 finish:(key:Provider,token:string,outcome:Settlement)=>Promise<unknown>;
};
type Worker=Parameters<typeof runOnlineRatingLease>[1];
type Dependencies=Worker&{budget:Budget};
const done:Settlement={p_outcome:"completed",p_retry_at:null};
const hold:Settlement={p_outcome:"operator_hold",p_retry_at:null};
const minimumSendWindowMs=15_000; // Transport has one ten-second end-to-end deadline.

export function onlineRatingProviderBudget(db:SupabaseClient):Budget{
 async function required(query:PromiseLike<{data:unknown;error:unknown}>){
  const {data,error}=await query;
  if(error)throw new OnlineRatingBudgetUnavailable();
  return data;
 }
 return {
  acquire:(key)=>required(db.rpc("ccp_online_rating_budget_acquire",{p_provider:key})),
  finish:(key,token,outcome)=>required(db.rpc("ccp_online_rating_budget_finish",{
   p_provider:key,p_token:token,...outcome,
  })),
 };
}

function settlementFor(error:unknown):Settlement{
 if(error instanceof OnlineRatingProviderLimited){
  const hint=error.cooldown;
  if(hint.kind==="until"&&Number.isSafeInteger(hint.retryAt)&&
   hint.retryAt>=0&&hint.retryAt<=8_640_000_000_000_000)
   return {p_outcome:"rate_limited",p_retry_at:new Date(hint.retryAt).toISOString()};
  return hold;
 }
 // The known transport error summarizes a completed bounded response or
 // transport failure. An unexpected error cannot safely end a reservation.
 return error instanceof StudentRatingError&&error.status!==429?done:hold;
}

/** Unregistered one-candidate worker. The reservation precedes claim; fresh
 * job admission still decides whether to send. Finish the exact reservation
 * once, before finalization if a request was attempted. Never retry egress. */
export async function runOnlineRatingCandidateWithBudget(input:unknown,deps:Dependencies){
 const active=()=>{try{return deps.enabled?.()===true;}catch{return false;}};
 const unavailable={status:"authority_unavailable"} as const;
 if(!active())return {status:"disabled"} as const;
 const checked=candidate.safeParse(input);
 if(!checked.success)return {status:"not_admitted"} as const;
 const {provider:key,...ids}=checked.data;
 let raw:unknown;
 try{raw=await deps.budget.acquire(key);}catch{return unavailable;}
 const parsed=grant.safeParse(raw);
 if(!parsed.success)return refused.safeParse(raw).success?{status:"budget_withheld"} as const:unavailable;
 const {token,leaseUntil}=parsed.data;
 const expires=Date.parse(leaseUntil), now=deps.now??Date.now;
 const sendWindow=()=>{
  const at=now();
  return Number.isSafeInteger(at)&&at>=0&&expires-at>=minimumSendWindowMs;
 };
 let finishing:Promise<void>|undefined;
 function finish(outcome:Settlement){
  if(!finishing)finishing=Promise.resolve().then(async()=>{
   try{
    const ack=settled.safeParse(await deps.budget.finish(key,token,outcome));
    if(!ack.success||(outcome.p_outcome==="operator_hold"&&ack.data.status!=="operator_hold"))
     throw new OnlineRatingBudgetUnavailable();
   }catch{throw new OnlineRatingBudgetUnavailable();}
  });
  return finishing;
 }
 let result;
 try{
  result=await runOnlineRatingLease(ids,{
   ...deps,enabled:active,
   claim:async(candidate)=>sendWindow()?deps.claim(candidate):null,
   admit:async(lease)=>lease.provider===key&&sendWindow()&&await deps.admit(lease),
   transport:async(actual,username)=>{
    if(actual!==key||!active()||!sendWindow())throw new OnlineRatingBudgetUnavailable();
    let payload:unknown;
    try{payload=await deps.transport(actual,username);}
    catch(error){
     await finish(settlementFor(error));
     throw error;
    }
    await finish(done);
    return payload;
   },
  });
 }catch{
  result=unavailable;
 }finally{
  // This includes pause, expired grant, stale claim, a denied fresh read, and
  // exceptions. Reuse an existing finish promise; never clear another token.
  try{await finish(done);}catch{result=unavailable;}
 }
 return result;
}
