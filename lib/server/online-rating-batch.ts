import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {z} from "zod";
import {provider} from "../chess-public-ratings";
import {onlineRatingQueueDiscovery} from "./online-rating-queue";
import {onlineRatingProviderBudget,runOnlineRatingCandidateWithBudget} from "./online-rating-provider-budget";
import {onlineRatingWorkerAuthority} from "./online-rating-worker-authority";

type Provider=z.infer<typeof provider>;
type Transport=Parameters<typeof runOnlineRatingCandidateWithBudget>[1]["transport"];
const candidate=z.object({teacherId:z.uuid(),jobId:z.uuid(),provider}).strict();
const scope=z.object({
 enqueue:z.number().int().min(0).max(8),
 work:z.number().int().min(0).max(2),
}).strict();
const limitsByProvider=z.object({lichess:scope,chesscom:scope}).strict();
const enqueueReply=z.discriminatedUnion("status",[
 z.object({status:z.literal("ok"),checked:z.number().int().min(0),queued:z.number().int().min(0)}).strict(),
 z.object({status:z.literal("paused")}).strict(),
 z.object({status:z.literal("busy")}).strict(),
 z.object({status:z.literal("invalid")}).strict(),
]);
type Dependencies={
 db:SupabaseClient;
 transport:Transport;
 enabled?:()=>boolean;
 providerEnabled?:(key:Provider)=>boolean;
};

/** One explicitly requested, unregistered pass. Constructing the adapters never
 * starts work or creates a provider client. Authority and quotas live in
 * Postgres. An operator must independently allow both the pass and provider;
 * the same live gate is checked immediately before egress by the worker. */
export async function runOnlineRatingBatch(limits:unknown,deps:Dependencies){
 const counters={checked:0,queued:0,scanned:0,submitted:0,finalized:0,withheld:0,unavailable:0};
 const result=(status:"disabled"|"ran"|"invalid")=>({status,...counters});
 const active=()=>{try{return deps.enabled?.()===true;}catch{return false;}};
 const allowed=(key:Provider)=>{try{return deps.providerEnabled?.(key)===true;}catch{return false;}};
 if(!active())return result("disabled");
 const parsed=limitsByProvider.safeParse(limits);
 if(!parsed.success)return result("invalid");
 const discover=onlineRatingQueueDiscovery(deps.db);
 const authority=onlineRatingWorkerAuthority(deps.db);
 const budget=onlineRatingProviderBudget(deps.db);
 const seen=new Set<string>();
 for(const key of provider.options){
  if(!active())return result("disabled");
  if(!allowed(key))continue;
  const {enqueue,work}=parsed.data[key];
  if(enqueue>0){
   try{
    const response=await deps.db.rpc("ccp_online_rating_enqueue_due",{p_provider:key,p_limit:enqueue});
    const reply=enqueueReply.safeParse(response.data);
    if(response.error||!reply.success||reply.data.status==="invalid"){counters.unavailable++;continue;}
    if(reply.data.status==="paused"){counters.withheld++;continue;}
    if(reply.data.status==="busy"){counters.unavailable++;continue;}
    const {checked,queued}=reply.data;
    if(checked>4*enqueue||queued>enqueue||queued>checked){counters.unavailable++;continue;}
    counters.checked+=checked;
    counters.queued+=queued;
   }catch{counters.unavailable++;continue;}
  }
  if(!active())return result("disabled");
  if(!allowed(key)||work===0)continue;
  let rows:unknown;
  try{rows=await discover(key,work);}
  catch{counters.unavailable++;continue;}
  const selected=z.array(candidate).max(work).safeParse(rows);
  if(!selected.success||selected.data.some(row=>row.provider!==key)){
   counters.unavailable++;continue;
  }
  counters.scanned+=selected.data.length;
  for(const row of selected.data){
   if(!active())return result("disabled");
   if(!allowed(key))break;
   const identity=row.teacherId+":"+row.jobId;
   if(seen.has(identity))continue;
   seen.add(identity);
   counters.submitted++;
   try{
    const attempt=await runOnlineRatingCandidateWithBudget(row,{
     ...authority,budget,transport:deps.transport,enabled:()=>active()&&allowed(key),
    });
    if(attempt.status==="finalized"){
     counters.finalized++;
     // A retry includes provider 429 or a temporary transport failure. Do
     // not submit more work for that provider in this pass.
     if(attempt.outcome==="retry")break;
    }else if(attempt.status==="budget_withheld"){counters.withheld++;break;}
    else if(attempt.status==="disabled")break;
    else if(attempt.status!=="not_admitted"){counters.unavailable++;break;}
   }catch{counters.unavailable++;break;}
  }
 }
 return result(active()?"ran":"disabled");
}
